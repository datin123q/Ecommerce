import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreatePaymentDto {
  @ApiProperty({ example: 'clq123456...', description: 'ID của đơn hàng' })
  @IsNotEmpty()
  @IsString()
  orderId: string;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.STRIPE })
  @IsNotEmpty()
  @IsEnum(PaymentMethod)
  method: PaymentMethod;
}