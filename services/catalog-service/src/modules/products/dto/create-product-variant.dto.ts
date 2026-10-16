import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateProductVariantDto {
  @ApiProperty({ example: 'SP01-RED-L', description: 'Mã SKU duy nhất của biến thể' })
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @ApiProperty({ example: 'Áo thun nam - Đỏ - L' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'Màu đỏ - Size L' })
  @IsString()
  @IsNotEmpty()
  variant!: string;
}
