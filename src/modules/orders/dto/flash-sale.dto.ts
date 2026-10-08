import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsInt, Min } from 'class-validator';

export class StartFlashSaleDto {
  @ApiPropertyOptional({ example: '00038355-50b0-4542-ab72-1cd2e1c13365', })
  @IsString()
  variantId: string;

  @ApiPropertyOptional({ example: 1})
  @IsInt()
  @Min(1)
  quantity: number;
}