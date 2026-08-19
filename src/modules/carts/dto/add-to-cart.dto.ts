import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class AddToCartDto {
  
  @ApiProperty({ example: 'id-cua-bien-the' })
  @IsString()
  @IsNotEmpty()
  variantId: string;

  @ApiProperty({ example: 100, description: 'Số lượng nhập vào' })
  @IsInt()
  @Min(1, { message: 'Số lượng nhập phải lớn hơn 0' })
  quantity: number;
}