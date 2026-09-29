import { Controller, Post, Body, Req, Headers, UseGuards, BadRequestException ,UseInterceptors, HttpCode, HttpStatus} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor';
import { ApiHeader } from '@nestjs/swagger';

import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';

interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}

@ApiTags('Payments (Thanh toán)')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create-intent')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo phiên thanh toán (Stripe / COD)' })
  @ApiHeader({
    name: 'x-idempotency-key',
    description: 'Mã định danh duy nhất để chống trùng lặp giao dịch (VD: uuid)',
    required: true, // Đặt true để Swagger bắt buộc phải nhập mới cho bấm Send
  })
  @UseInterceptors(IdempotencyInterceptor)
  async createIntent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePaymentDto,
    @Headers('x-idempotency-key') idempotencyKey: string,
  ) {
    return this.paymentsService.createPaymentIntent(user.id, dto, idempotencyKey);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
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