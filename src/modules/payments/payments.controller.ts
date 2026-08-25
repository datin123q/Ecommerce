import { Controller, Post, Body, Req, Headers, UseGuards, BadRequestException ,UseInterceptors, HttpCode} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor';

import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

@ApiTags('Payments (Thanh toán)')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create-intent')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo phiên thanh toán (Stripe / COD)' })
  @UseInterceptors(IdempotencyInterceptor)
  async createIntent(
    @CurrentUser() user: any,
    @Body() dto: CreatePaymentDto
  ) {
    return this.paymentsService.createPaymentIntent(user.id, dto);
  }

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Stripe Webhook (Hệ thống tự động gọi)' })
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>
  ) {
    if (!signature) {
      throw new BadRequestException('Thiếu chữ ký Stripe');
    }
    const payload = req.rawBody || Buffer.from(JSON.stringify(req.body));

    return this.paymentsService.handleStripeWebhook(signature, payload);
  }
}