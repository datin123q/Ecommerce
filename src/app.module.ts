import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { DatabaseModule } from './database/database.module';
import { CategoriesModule } from './modules/categories/categories.module'; 
import { ProductsModule } from './modules/products/products.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { CartsModule } from './modules/carts/carts.module';
import { VouchersModule } from './modules/vouchers/vouchers.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';
import { DashboardModule } from './modules/admin/dashboard/dashboard.module';

import { BullModule } from '@nestjs/bullmq';
import { EventEmitterModule } from '@nestjs/event-emitter';
import Redis from 'ioredis';
import { getRedisConnection, RedisModule } from './redis/redis.module';
import { AppLoggerMiddleware } from './common/middlewares/app-logger.middleware';
import {ScheduleModule} from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { APP_GUARD } from '@nestjs/core';
import { MailerModule} from '@nestjs-modules/mailer';
import { envValidationSchema } from './config/env.validation';
import { ProcessorModule } from './processor/processor.module';
import { SendMailOptions } from 'nodemailer';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
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
      useFactory: (configService: ConfigService) => ({
        connection: getRedisConnection(configService),
        prefix: configService.get<string>('REDIS_CLUSTER_MODE') === 'true' ? '{my-bullmq}' : 'bull',
      }),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],

      useFactory: (configService: ConfigService) => ({
        throttlers: [
          // {
          //   name: 'short',
          //   ttl: 1000,
          //   limit: 3,
          // },
          // {
          //   name: 'long',
          //   ttl: 60000,
          //   limit: 100,
          // },
        ],

        storage: new ThrottlerStorageRedisService(getRedisConnection(configService) as Redis),
      }),
    }),
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        transport: {
          host: configService.get<string>('MAIL_HOST') || 'smtp.gmail.com',
          port: configService.get<number>('MAIL_PORT') || 587,
          secure: false, 
          auth: {
            user: configService.get<string>('MAIL_USER') || '',
            pass: configService.get<string>('MAIL_PASS') || '',
          },
        },
        pool: true, maxConnections: 1, maxMessages: 100,
        defaults: {
          from: configService.get<string>('MAIL_FROM') || 'noreply@domain.com',
        } as SendMailOptions,
      }),
    }),
    PrometheusModule.register(),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
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
    RedisModule,
    TasksModule,
    ProcessorModule,
    DatabaseModule,
    DashboardModule
  ],
  controllers: [],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard }
  ],
})
export class AppModule implements NestModule { 
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AppLoggerMiddleware) 
      .forRoutes('{*path}');
  }
}