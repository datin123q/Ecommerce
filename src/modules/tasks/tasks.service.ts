import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "src/database/prisma.service";
import { OrderStatus, TransactionType } from '@prisma/client';

@Injectable()
export class TasksService {
    private readonly logger = new Logger(TasksService.name);
    constructor(private readonly prisma : PrismaService){}

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

            return { success: true, recordsAffected, message: successMsg };

        } catch (error) {
            console.log('================ LỖI THẬT SỰ CỦA PRISMA ================');
      console.log(error); 
      console.log('========================================================');
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

            if(expiredOrders === 0)  return 0;

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
}
