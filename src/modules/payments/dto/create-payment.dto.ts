import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreatePaymentDto {
  @ApiProperty({ example: 'id-cua-don-hang' })
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.VNPAY })
  @IsEnum(PaymentMethod)
  @IsNotEmpty()
  method: PaymentMethod;
}