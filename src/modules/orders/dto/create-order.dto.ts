import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateOrderDto {
  @ApiPropertyOptional({ 
    example: 'GIAM50K', 
    description: 'Nhập mã giảm giá (bỏ trống nếu không có)' 
  })
  @IsOptional()
  @IsString()
  voucherCode?: string;
}