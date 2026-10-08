import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { DatabaseModule } from '../../database/database.module';
import { VouchersModule } from '../vouchers/vouchers.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CartsModule } from '../carts/carts.module';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [DatabaseModule, VouchersModule, InventoryModule, CartsModule,BullModule.registerQueue({ name: 'order-queue'}),], 
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService]
})
export class OrdersModule {}