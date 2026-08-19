import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateWarehouseDto {
  @ApiProperty({ example: 'Kho số 1', description: 'Tên kho' })
  @IsString()
  @IsNotEmpty({ message: 'Tên kho không được để trống' })
  name: string;

  @ApiPropertyOptional({ example: 'Hà Nội', description: 'Địa điểm' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Địa điểm không được để trống' })
  location: string;
}