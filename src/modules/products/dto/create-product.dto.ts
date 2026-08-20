import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// 1. DTO cho từng Biến thể (Variant)
export class CreateProductVariantDto {
  @ApiProperty({ example: 'SP01-RED-L', description: 'Mã SKU duy nhất của biến thể' })
  @IsString()
  @IsNotEmpty()
  sku: string;

  @ApiProperty({ example: 'Áo thun nam - Đỏ - L' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Màu đỏ - Size L' })
  @IsString()
  @IsNotEmpty()
  variant: string;
}

// 2. DTO cho Sản phẩm chính (Product)
export class CreateProductDto {
  @ApiProperty({ example: 'Áo thun nam basic' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Chất liệu cotton 100%, co giãn 4 chiều' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 150000 })
  @IsNumber()
  @IsNotEmpty()
  price: number;

  @ApiProperty({ example: 'id-cua-danh-muc-vua-tao' })
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @ApiProperty({ type: [CreateProductVariantDto], description: 'Danh sách các biến thể của sản phẩm' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductVariantDto)
  variants: CreateProductVariantDto[];
}