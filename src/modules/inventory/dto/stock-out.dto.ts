import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class StockOutDto {
  @ApiProperty({ example: 'id-cua-kho-hang' })
  @IsString()
  @IsNotEmpty()
  warehouseId: string;

  @ApiProperty({ example: 'id-cua-bien-the' })
  @IsString()
  @IsNotEmpty()
  variantId: string;

  @ApiProperty({ example: 100, description: 'Số lượng xuất kho' })
  @IsInt()
  @Min(1, { message: 'Số lượng phải lớn hơn 0' })
  quantity: number;
}