import { Injectable,Inject, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../database/prisma.service";
import { OrderStatus, TransactionType } from '@prisma/client';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import Redis from 'ioredis';


@Injectable()
export class TasksService {
    private readonly logger = new Logger(TasksService.name);

    constructor(
        private readonly prisma: PrismaService, 
        @InjectQueue('mail-queue') private readonly mailQueue: Queue,
        @Inject('REDIS_CLIENT') private readonly redisClient: Redis
    ) {}

    private async executeJob(
        jobName: string,
        jobLogic: () => Promise<number>,
        ) {
        this.logger.log(`🕒 [${jobName}] Bắt đầu chạy...`);
        try {
            const recordsAffected = await jobLogic();
            const successMsg = `Chạy thành công. Xử lý ${recordsAffected} bản ghi.`;
            await this.prisma.db.scheduledJobLog.create({
            data: { jobName, status: 'SUCCESS', message: successMsg, recordsAffected },
            });
            this.logger.log(`[${jobName}] thành công!`);
            return { success: true, recordsAffected, message: successMsg };
        } catch (error) {
            const errorMsg = `Lỗi hệ thống: ${error.message}`;
            await this.prisma.db.scheduledJobLog.create({
            data: { jobName, status: 'FAILED', message: errorMsg, recordsAffected: 0 },
            });
            throw new Error(`Job ${jobName} thất bại.`);
        }
    }


    @Cron(CronExpression.EVERY_HOUR)
    async handleCancelOrders() {
        const lockKey = 'cron_lock:cancel_orders';
        const acquired = await this.redisClient.set(lockKey, 'locked', 'EX', 1800, 'NX');
        if (!acquired) {
            this.logger.log('Server khác đang xử lý Cancel Orders. Bỏ qua...');
            return;
        }

        return this.executeJob('AUTO_CANCEL_ORDERS', async () => {
            const aDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const expiredOrders = await this.prisma.db.order.findMany({
                where: { status: OrderStatus.PENDING, createdAt: { lt: aDayAgo } },
                include: { orderItems: true },
            });

            if (expiredOrders.length === 0) return 0;

            const chunkSize = 100;
            let processedCount = 0;

            for (let i = 0; i < expiredOrders.length; i += chunkSize) {
                const chunk = expiredOrders.slice(i, i + chunkSize);
                await this.prisma.db.$transaction(async (tx) => {
                    for (const order of chunk) {
                        await tx.order.update({
                            where: { id: order.id },
                            data: { status: OrderStatus.CANCELLED }
                        });

                        for (const item of order.orderItems) {
                            if (item.inventoryId) {
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

            return processedCount;
        });
    }

    @Cron(CronExpression.EVERY_WEEK) 
    async handleSendMailMarketing() {
        const lockKey = 'cron_lock:mail_marketing';
        const acquired = await this.redisClient.set(lockKey, 'locked', 'EX', 3600, 'NX');

        if (!acquired) {
            return; 
        }

        this.logger.log('Bắt đầu chuẩn bị chiến dịch Mail Marketing...');

        try {
            const users = await this.prisma.db.user.findMany({
                where: { isVerified: true },
                select: { id: true, email: true, fullName: true },
            });

            const topProducts = await this.prisma.db.product.findMany({
                take: 3,
                orderBy: { createdAt: 'desc' },
            });

            if (users.length === 0 || topProducts.length === 0) return;

            const jobs = users.map(user => ({
                name: 'marketing-mail',
                data: {
                    email: user.email,
                    fullName: user.fullName,
                    userId: user.id,
                    products: topProducts,
                },
                opts: {
                    removeOnComplete: true,
                    attempts: 3,
                }
            }));

            // Đẩy toàn bộ vào Redis trong 1 lệnh duy nhất 
            await this.mailQueue.addBulk(jobs);

            this.logger.log(`Đã đẩy thành công ${users.length} email vào hàng đợi.`);
        } catch (error) {
            this.logger.error('Lỗi khi chạy CronJob Marketing:', error);
        }
    }
}