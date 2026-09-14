import { Injectable, Logger , } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "src/database/prisma.service";
import { OrderStatus, TransactionType } from '@prisma/client';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';

@Injectable()
export class TasksService {
    private readonly logger = new Logger(TasksService.name);
    constructor(private readonly prisma : PrismaService, @InjectQueue('mail-queue') private readonly mailQueue: Queue,){}

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
    async handleCancelOrders(){
        return this.executeJob('AUTO_CANCEL_ORDERS', async () => {
            const aDayAgo = new Date(Date.now() - 24*60*60*1000);

            const expiredOrders = await this.prisma.db.order.findMany({
                where: {status : OrderStatus.PENDING, createdAt : {lt: aDayAgo}},
                include: {orderItems : true},
            })

            if(expiredOrders.length === 0)  return 0;

            await this.prisma.db.$transaction( async (tx) => {
                for(const order of expiredOrders){
                    await tx.order.update({
                        where: {id: order.id},
                        data: {status: OrderStatus.CANCELLED}
                    });

                    for(const item of order.orderItems){
                        if(item.inventoryId){
                            await tx.inventory.update({
                                where: {id: item.inventoryId},
                                data: {quantity:{increment: item.quantity}}
                            })
                            await tx.inventoryTransaction.create({
                                data: { type: TransactionType.IN, quantity: item.quantity, inventoryId: item.inventoryId, userId: order.userId },
                            });
                        }
                    } 
                }
            })
        return expiredOrders.length;
        })
    }
    @Cron(CronExpression.EVERY_WEEK) 
    async handleSendMailMarketing() {
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

        if (users.length === 0 || topProducts.length === 0) {
            this.logger.log('Không có user hoặc sản phẩm mới, bỏ qua chiến dịch.');
            return;
        }
        for (const user of users) {
            await this.mailQueue.add(
            'marketing-mail', 
            {
                email: user.email,
                fullName: user.fullName,
                userId: user.id,
                products: topProducts,
            },
            {
                removeOnComplete: true, 
                attempts: 3,         
            }
            );
        }

        this.logger.log(`Đã đẩy thành công ${users.length} email vào hàng đợi.`);
        } catch (error) {
        this.logger.error('Lỗi khi chạy CronJob Marketing:', error);
        }
    }
}
