import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { DatabaseModule } from '../../database/database.module';
import { VouchersModule } from '../vouchers/vouchers.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CartsModule } from '../carts/carts.module';

@Module({
  imports: [DatabaseModule, VouchersModule, InventoryModule, CartsModule], 
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}