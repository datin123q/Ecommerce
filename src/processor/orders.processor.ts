import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { RedisCacheService } from '../redis/redisCache.service';
import { InventoryAllocation } from 'src/modules/orders/domain/inventory-allocation';
import { OrdersService } from 'src/modules/orders/orders.service';
import { InventoryService } from 'src/modules/inventory/inventory.service';
import { CartsService } from 'src/modules/carts/carts.service'; 

@Processor('order-queue',{concurrency: 5,})
export class OrderProcessor extends WorkerHost {
  private readonly logger = new Logger(OrderProcessor.name);
    
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: RedisCacheService,
    private readonly ordersService: OrdersService,
    private readonly inventoryService: InventoryService,
    private readonly cartsService: CartsService 
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
        this.logger.log(`[Worker] Bắt đầu ghi DB Flash Sale - User: ${job.data.userId}`);
        const { userId, pricing, cartId } = job.data;
        
        try {
          const cart = await this.cartsService.getCartForCheckout(userId);
          if (!cart || cart.cartItems.length === 0) {
            throw new Error(`Giỏ hàng ${cartId} trống hoặc không tồn tại`);
          }

          const variantIds = cart.cartItems.map(item => item.variantId);
          const inventories = await this.inventoryService.getInventoriesByVariantIds(variantIds);
          
          const allocatedItems = InventoryAllocation.allocate(cart.cartItems, inventories);
          
          const itemsSnapshot = this.ordersService.buildOrderItemsSnapshot(
            cart, 
            allocatedItems
          );

          const newOrder = await this.ordersService.executeOrderTransaction(userId, pricing, itemsSnapshot);
          
          await this.ordersService.postOrderCreation({ id: newOrder.id, userId }, cartId);

          this.logger.log(`[Worker] Đồng bộ THÀNH CÔNG! OrderID: ${newOrder.id}`);
        } catch (error) {
          this.logger.error(`[Worker] Lỗi đồng bộ DB: ${error.message}`);
          throw error; 
        }
        break;
      }
    }
  }
}