import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../database/prisma.service";
import { OrderStatus, TransactionType, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { RedisCacheService } from '../../redis/redisCache.service';

const JOB_CONSTANTS = {
    CANCEL_ORDERS: {
        NAME: 'AUTO_CANCEL_ORDERS',
        LOCK_KEY: 'cron_lock:cancel_orders',
        TTL_SEC: 180,
        EXPIRE_HOURS: 24,
        CHUNK_SIZE: 100,
    },
    MAIL_MARKETING: {
        NAME: 'MAIL_MARKETING',
        LOCK_KEY: 'cron_lock:mail_marketing',
        TTL_SEC: 60,
        TOP_PRODUCTS_LIMIT: 3,
    }
};

@Injectable()
export class TasksService {
    private readonly logger = new Logger(TasksService.name);

    constructor(
        private readonly prisma: PrismaService,
        @InjectQueue('mail-queue') private readonly mailQueue: Queue,
        private readonly cacheService: RedisCacheService
    ) {}

    // CRON JOBS DEFINITIONS

    @Cron(CronExpression.EVERY_HOUR)
    async handleCancelOrders() {
        const { NAME, LOCK_KEY, TTL_SEC } = JOB_CONSTANTS.CANCEL_ORDERS;

        return this.executeWithLock(NAME, LOCK_KEY, TTL_SEC, async () => {
            const expiredOrders = await this.fetchExpiredOrders();
            if (!expiredOrders.length) return 0;
            return this.processExpiredOrdersInChunks(expiredOrders);
        });
    }

    @Cron(CronExpression.EVERY_WEEK)
    async handleSendMailMarketing() {
        const { NAME, LOCK_KEY, TTL_SEC, TOP_PRODUCTS_LIMIT } = JOB_CONSTANTS.MAIL_MARKETING;

        return this.executeWithLock(NAME, LOCK_KEY, TTL_SEC, async () => {
            const [users, topProducts] = await Promise.all([
                this.prisma.db.user.findMany({
                    where: { isVerified: true },
                    select: { id: true, email: true, fullName: true },
                }),
                this.prisma.db.product.findMany({
                    take: TOP_PRODUCTS_LIMIT,
                    orderBy: { createdAt: 'desc' },
                })
            ]);

            if (!users.length || !topProducts.length) return 0;

            await this.dispatchMarketingEmails(users, topProducts);
            return users.length;
        });
    }

    // CORE LOGIC & HELPER METHODS (PRIVATE)
    private async executeWithLock(jobName: string, lockKey: string, ttlSeconds: number, jobLogic: () => Promise<number>) {
        const acquired = await this.cacheService.setNX(lockKey, 'locked', ttlSeconds);
        if (!acquired) {
            this.logger.debug(`[${jobName}] Đang được chạy bởi worker khác. Bỏ qua...`);
            return;
        }

        this.logger.log(`🕒 [${jobName}] Bắt đầu chạy...`);
        try {
            const recordsAffected = await jobLogic();
            
            await this.logJobStatus(jobName, 'SUCCESS', `Chạy thành công. Xử lý ${recordsAffected} bản ghi.`, recordsAffected);
            this.logger.log(`✅ [${jobName}] Thành công! Xử lý ${recordsAffected} dòng.`);
        } catch (error) {
            const errorMsg = `Lỗi hệ thống: ${(error as Error).message}`;
            await this.logJobStatus(jobName, 'FAILED', errorMsg, 0);
            this.logger.error(`❌ [${jobName}] Thất bại! ${errorMsg}`, (error as Error).stack);
        } finally {
            await this.cacheService.del(lockKey);
        }
    }

    private async fetchExpiredOrders() {
        const expireThreshold = new Date(Date.now() - JOB_CONSTANTS.CANCEL_ORDERS.EXPIRE_HOURS * 60 * 60 * 1000);
        return this.prisma.db.order.findMany({
            where: { status: OrderStatus.PENDING, createdAt: { lt: expireThreshold } },
            include: { orderItems: true },
        });
    }

    private async processExpiredOrdersInChunks(expiredOrders: any[]) {
        const { CHUNK_SIZE } = JOB_CONSTANTS.CANCEL_ORDERS;
        const cacheKeysToClear = new Set<string>();
        let hasInventoryChanges = false;
        let processedCount = 0;

        for (let i = 0; i < expiredOrders.length; i += CHUNK_SIZE) {
            const chunk = expiredOrders.slice(i, i + CHUNK_SIZE);
            
            await this.prisma.db.$transaction(async (tx) => {
                for (const order of chunk) {
                    const inventoryChanged = await this.cancelSingleOrder(tx, order);
                    if (inventoryChanged) hasInventoryChanges = true;
                    cacheKeysToClear.add(`orders_user_${order.userId}`);
                }
            });
            
            processedCount += chunk.length;
            this.logger.debug(`Đã xử lý lô ${processedCount}/${expiredOrders.length} đơn hàng.`);
        }

        await this.clearPostCancelCaches(Array.from(cacheKeysToClear), hasInventoryChanges);
        return processedCount;
    }

    private async cancelSingleOrder(tx: Prisma.TransactionClient, order: any): Promise<boolean> {
        let hasInventoryChanges = false;

        await tx.order.update({
            where: { id: order.id },
            data: { status: OrderStatus.CANCELLED }
        });

        for (const item of order.orderItems) {
            if (item.inventoryId) {
                hasInventoryChanges = true;
                await tx.inventory.update({
                    where: { id: item.inventoryId },
                    data: { quantity: { increment: item.quantity } }
                });
                await tx.inventoryTransaction.create({
                    data: { 
                        type: TransactionType.IN, 
                        quantity: item.quantity, 
                        inventoryId: item.inventoryId, 
                        userId: order.userId 
                    },
                });
            }
        }
        return hasInventoryChanges;
    }

    private async clearPostCancelCaches(userOrderKeys: string[], hasInventoryChanges: boolean) {
        if (userOrderKeys.length > 0) {
            await this.cacheService.del(...userOrderKeys);
        }

        if (hasInventoryChanges) {
            await this.cacheService.del('products_key');
            await this.cacheService.delByPattern('products:page=*');
            this.logger.debug('Đã quét sạch cache Sản phẩm do có thay đổi tồn kho.');
        }
    }

    private async dispatchMarketingEmails(users: any[], products: any[]) {
        const jobs = users.map(user => ({
            name: 'marketing-mail',
            data: {
                email: user.email,
                fullName: user.fullName,
                userId: user.id,
                products: products, 
            },
            opts: { removeOnComplete: true, attempts: 3 }
        }));

        await this.mailQueue.addBulk(jobs);
    }

    private async logJobStatus(jobName: string, status: 'SUCCESS' | 'FAILED', message: string, recordsAffected: number) {
        await this.prisma.db.scheduledJobLog.create({
            data: { jobName, status, message, recordsAffected },
        });
    }
}