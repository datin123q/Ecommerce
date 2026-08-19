import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class CreateVoucherDto {
  @ApiProperty({ example: 'GIAM50K', description: 'Mã khách hàng sẽ nhập' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 100, description: 'Tổng số lượt dùng tối đa (limit)' })
  @IsInt()
  @Min(1)
  limit: number;

  @ApiProperty({ example: 50000, description: 'Số tiền được giảm (value)' })
  @IsNumber()
  @Min(1)
  value: number;
}