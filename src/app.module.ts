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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    UsersModule,
    AuthModule,
    CategoriesModule, 
    ProductsModule,
    InventoryModule,
    CartsModule,
    VouchersModule,
    OrdersModule
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}