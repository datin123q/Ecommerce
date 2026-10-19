import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client-core';
import { IsEnum } from 'class-validator';

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus, example: OrderStatus.AWAITING_DELIVERY })
  @IsEnum(OrderStatus)
  status: OrderStatus;
}
