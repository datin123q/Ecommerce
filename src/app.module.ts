import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';
import { BullModule } from '@nestjs/bullmq';
import * as Joi from 'joi';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        PORT: Joi.number().default(3000),
        DATABASE_URL: Joi.string().required(),
        
        // Bắt buộc phải có khóa bí mật cho JWT
        JWT_ACCESS_SECRET: Joi.string().required(),
        JWT_REFRESH_SECRET: Joi.string().required(),
        JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
        
        // Các keys quan trọng khác
        STRIPE_SECRET_KEY: Joi.string().required(),
        STRIPE_WEBHOOK_SECRET: Joi.string().required(),
      }),
    }),
    // Đăng ký Cache kết nối Redis toàn cục tại đây
    CacheModule.registerAsync({
      isGlobal: true, 
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        store: await redisStore({
          socket: {
            host: configService.get<string>('REDIS_HOST') || 'localhost',
            port: configService.get<number>('REDIS_PORT') || 6379,
          },
          ttl:60000,
        }),
      }),
      inject: [ConfigService],
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST') || 'localhost',
          port: configService.get<number>('REDIS_PORT') || 6379,
        },
      }),
      inject: [ConfigService],
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