import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { DatabaseModule } from './database/database.module';
import { CategoriesModule } from './modules/categories/categories.module'; 
import { ProductsModule } from './modules/products/products.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { CartsModule } from './modules/carts/cart.module';
import { VouchersModule } from './modules/vouchers/vouchers.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payment.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    CategoriesModule, 
    ProductsModule,
    InventoryModule,
    CartsModule,
    VouchersModule,
    OrdersModule,
    PaymentsModule,
    NotificationsModule,
    AuditLogsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}