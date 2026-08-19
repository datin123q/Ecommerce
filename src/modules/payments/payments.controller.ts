import { Controller, Post, Body, UseGuards, Get, Query } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Payments (Thanh toán)')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // 1. Người dùng gọi API này để lấy Link thanh toán
  @Post('create-url')
  @UseGuards(JwtAuthGuard) // Phải đăng nhập
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo đường dẫn thanh toán (VNPay/MoMo)' })
  createPaymentUrl(@CurrentUser() user: any, @Body() dto: CreatePaymentDto) {
    return this.paymentsService.createPaymentUrl(user.id, dto);
  }

  @Get('webhook')
  @ApiOperation({ summary: 'Webhook' })
  handleWebhook(@Query() payload: any) {
    return this.paymentsService.handleWebhook(payload);
  }
}