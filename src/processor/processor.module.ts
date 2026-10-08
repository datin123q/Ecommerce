import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import * as path from 'path';
import { SendMailOptions } from 'nodemailer';
import { OrderProcessor } from './orders.processor';
import { InventoryModule } from 'src/modules/inventory/inventory.module';
import { OrdersModule } from 'src/modules/orders/orders.module';
import { CartsModule } from 'src/modules/carts/carts.module';
import { DatabaseModule } from 'src/database/database.module';

import { EmailStrategyFactory } from './email-strategy.factory';
import { ForgotPasswordStrategy } from './strategy/forgot-password.strategy';
import { MailProcessor } from './mails.processor';
import { VerifyAccountStrategy } from './strategy/verify-account.strategy';
import { MarketingStrategy } from './strategy/marketing.strategy';


@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        transport: {
          host: configService.get<string>('MAIL_HOST') || '',
          port: configService.get<number>('MAIL_PORT') || 587, 
          secure: configService.get<boolean>('MAIL_SECURE', false),
          auth: {
            user: configService.get<string>('MAIL_USER') || '',
            pass: configService.get<string>('MAIL_PASS') || '',
          },
          pool: true, maxConnections: 10, maxMessages: 50,
        },
        defaults: {
          from: configService.get<string>('MAIL_FROM') || 'noreply@domain.com',
        } as SendMailOptions,
        template: {
          dir: path.join(process.cwd(), 'dist', 'processor', 'templates'),
          adapter: new HandlebarsAdapter(),
          options: {
            strict: true,
          },
        },
      }),
    }),
    InventoryModule,
    OrdersModule,
    CartsModule,
    DatabaseModule
  ],
  providers: [
    EmailStrategyFactory,
    ForgotPasswordStrategy, 
    VerifyAccountStrategy,
    MarketingStrategy,
    MailProcessor,
    OrderProcessor
  ],
})
export class ProcessorModule {}