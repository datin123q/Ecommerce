import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import * as path from 'path';

// Import các class bạn vừa tạo
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
          host: configService.get<string>('MAIL_HOST'),
          port: configService.get<number>('MAIL_PORT'), 
          secure: configService.get<boolean>('MAIL_SECURE', false),
          auth: {
            user: configService.get<string>('MAIL_USER'),
            pass: configService.get<string>('MAIL_PASS'),
          },
        },
        defaults: {
          from: configService.get<string>('MAIL_FROM'),
        },
        template: {
          dir: path.join(process.cwd(), 'dist', 'processor', 'templates'),
          adapter: new HandlebarsAdapter(),
          options: {
            strict: true,
          },
        },
      }),
    }),
  ],
  providers: [
    EmailStrategyFactory,
    ForgotPasswordStrategy, 
    VerifyAccountStrategy,
    MarketingStrategy,
    MailProcessor,
  ],
})
export class ProcessorModule {}