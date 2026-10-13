import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { OrdersService } from 'src/modules/orders/orders.service';
import { RedisInventoryService } from 'src/modules/inventory/redis-inventory.service';

@Processor('order-queue',{concurrency: 5,})
export class OrderProcessor extends WorkerHost {
  private readonly logger = new Logger(OrderProcessor.name);
    
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly redisInventoryService: RedisInventoryService,
    
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'cleanup-cart': {
        const { orderId, cartId } = job.data;
        this.logger.log(`[Worker] Đang xử lý dọn dẹp giỏ hàng cho đơn ${orderId}`);
        await this.prisma.db.cartItem.deleteMany({
          where: { cartId: cartId }
        });
        break; 
      }
      
      case 'process-flash-sale-db': {
        const {
          userId,
          cartId,
          pricing,
          itemsSnapshot,
          flashReservation,
        } = job.data;

        let order;

        try {
          order = await this.ordersService.executeOrderTransaction(
            userId,
            pricing,
            itemsSnapshot,
          );
        } catch (error) {
          const maxAttempts = job.opts.attempts ?? 1;
          const finalAttempt = job.attemptsMade + 1 >= maxAttempts;

          if (finalAttempt) {
            await this.redisInventoryService.restoreStock(
              flashReservation.variantId,
              flashReservation.quantity,
            );
          }

          throw error;
        }

        try {
          await this.ordersService.postOrderCreation(
            { id: order.id, userId },
            cartId,
          );
        } catch (error) {
          this.logger.error(`Tạo đơn thành công nhưng dọn giỏ lỗi: ${error.message}`);
        }

        return order;
      }
        break;
      }
    }
}