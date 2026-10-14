import { Module } from '@nestjs/common';
import { OrdersModule } from '../../orders/orders.module';
import { PaymentsModule } from '../../payments/payments.module';
import { InventoryModule } from '../../inventory/inventory.module';
import { UsersModule } from '../../users/users.module';
import { ProductsModule } from '../../products/products.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    OrdersModule,
    PaymentsModule,
    InventoryModule,
    UsersModule,
    ProductsModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
