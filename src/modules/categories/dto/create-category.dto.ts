import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Áo thun nam', description: 'Tên danh mục' })
  @IsString()
  @IsNotEmpty({ message: 'Tên danh mục không được để trống' })
  name: string;

  @ApiPropertyOptional({ example: 'Các loại áo thun cộc tay, dài tay...', description: 'Mô tả danh mục' })
  @IsOptional()
  @IsString()
  description?: string;
}