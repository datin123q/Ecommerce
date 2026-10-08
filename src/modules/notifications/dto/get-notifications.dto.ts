import { ApiPropertyOptional } from '@nestjs/swagger';
import {  IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetNotificationsDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 5;
}