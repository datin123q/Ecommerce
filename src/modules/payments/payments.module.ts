import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { DatabaseModule } from '../../database/database.module';
import { PAYMENT_PROVIDER } from './adapters/payment-provider.interface';
import { StripeAdapter } from './adapters/stripe.adapter';
@Module({ 
  imports: [DatabaseModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    {
      provide: PAYMENT_PROVIDER,
      useClass: StripeAdapter, 
    }
  ],
})
export class PaymentsModule {}