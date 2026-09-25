import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../database/prisma.service";
import { OrderStatus, TransactionType } from '@prisma/client';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { RedisCacheService } from '../../redis/redisCache.service'; 

@Injectable()
export class TasksService {
    private readonly logger = new Logger(TasksService.name);

    constructor(
        private readonly prisma: PrismaService, 
        @InjectQueue('mail-queue') private readonly mailQueue: Queue,
        private readonly cacheService: RedisCacheService // Chỉ dùng duy nhất CacheService
    ) {}

    private async executeJob(
        jobName: string,
        lockKey: string,
        ttlSeconds: number,
        jobLogic: () => Promise<number>,
    ) {
        const acquired = await this.cacheService.setNX(lockKey, 'locked', ttlSeconds);
        
        if (!acquired) {
            this.logger.debug(`[${jobName}] Đang được chạy bởi worker khác. Bỏ qua...`);
            return;
        }

        this.logger.log(`🕒 [${jobName}] Bắt đầu chạy...`);
        
        try {
            const recordsAffected = await jobLogic();
            
            const successMsg = `Chạy thành công. Xử lý ${recordsAffected} bản ghi.`;
            await this.prisma.db.scheduledJobLog.create({
                data: { jobName, status: 'SUCCESS', message: successMsg, recordsAffected },
            });
            this.logger.log(`✅ [${jobName}] Thành công! Xử lý ${recordsAffected} dòng.`);
            
        } catch (error) {
            const errorMsg = `Lỗi hệ thống: ${error.message}`;
            this.logger.error(`❌ [${jobName}] Thất bại! ${errorMsg}`, error.stack);
            
            await this.prisma.db.scheduledJobLog.create({
                data: { jobName, status: 'FAILED', message: errorMsg, recordsAffected: 0 },
            });
        } finally {
            // Nhả khóa qua CacheService
            await this.cacheService.del(lockKey);
        }
    }

    @Cron(CronExpression.EVERY_HOUR)
    async handleCancelOrders() {
        return this.executeJob(
            'AUTO_CANCEL_ORDERS', 
            'cron_lock:cancel_orders', 
            180, 
            async () => {
                const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

                const expiredOrders = await this.prisma.db.order.findMany({
                    where: { status: OrderStatus.PENDING, createdAt: { lt: oneDayAgo } },
                    include: { orderItems: true },
                });

                if (expiredOrders.length === 0) return 0;

                const chunkSize = 100;
                let processedCount = 0;
                
                const cacheKeysToClear = new Set<string>();
                let hasInventoryChanges = false;

                for (let i = 0; i < expiredOrders.length; i += chunkSize) {
                    const chunk = expiredOrders.slice(i, i + chunkSize);
                    
                    await this.prisma.db.$transaction(async (tx) => {
                        for (const order of chunk) {
                            await tx.order.update({
                                where: { id: order.id },
                                data: { status: OrderStatus.CANCELLED }
                            });

                            cacheKeysToClear.add(`orders_user_${order.userId}`);

                            for (const item of order.orderItems) {
                                if (item.inventoryId) {
                                    hasInventoryChanges = true;
                                    await tx.inventory.update({
                                        where: { id: item.inventoryId },
                                        data: { quantity: { increment: item.quantity } }
                                    });
                                    await tx.inventoryTransaction.create({
                                        data: { type: TransactionType.IN, quantity: item.quantity, inventoryId: item.inventoryId, userId: order.userId },
                                    });
                                }
                            }
                        }
                    });
                    
                    processedCount += chunk.length;
                    this.logger.debug(`Đã xử lý lô ${processedCount}/${expiredOrders.length} đơn hàng.`);
                }

                if (cacheKeysToClear.size > 0) {
                    await this.cacheService.del(...Array.from(cacheKeysToClear));
                }

                if (hasInventoryChanges) {
                    await this.cacheService.del('products_key');
                    await this.cacheService.delByPattern('products:page=*');
                    this.logger.debug('Đã quét sạch cache Sản phẩm do có thay đổi tồn kho.');
                }

                return processedCount;
            }
        );
    }

    @Cron(CronExpression.EVERY_WEEK) 
    async handleSendMailMarketing() {
        return this.executeJob(
            'MAIL_MARKETING', 
            'cron_lock:mail_marketing', 
            60, 
            async () => {
                const users = await this.prisma.db.user.findMany({
                    where: { isVerified: true },
                    select: { id: true, email: true, fullName: true },
                });
                
                const topProducts = await this.prisma.db.product.findMany({
                    take: 3,
                    orderBy: { createdAt: 'desc' }, 
                });

                if (users.length === 0 || topProducts.length === 0) return 0;

                const jobs = users.map(user => ({
                    name: 'marketing-mail',
                    data: {
                        email: user.email,
                        fullName: user.fullName,
                        userId: user.id,
                        products: topProducts, 
                    },
                    opts: { removeOnComplete: true, attempts: 3 }
                }));

                await this.mailQueue.addBulk(jobs);
                
                return users.length; 
            }
        );
    }
}