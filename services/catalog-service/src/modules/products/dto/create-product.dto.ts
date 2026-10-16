import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateProductVariantDto } from './create-product-variant.dto';

export class CreateProductDto {
  @ApiProperty({ example: 'Áo thun nam basic' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: 'Chất liệu cotton 100%, co giãn 4 chiều' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 150000 })
  @IsNumber()
  @IsInt()
  @IsNotEmpty()
  price!: number;

  @ApiProperty({ example: 'id-cua-danh-muc' })
  @IsString()
  @IsNotEmpty()
  categoryId!: string;

  @ApiProperty({ type: [CreateProductVariantDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductVariantDto)
  variants!: CreateProductVariantDto[];
}
