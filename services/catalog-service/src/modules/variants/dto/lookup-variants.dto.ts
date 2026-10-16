import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString, IsUUID } from 'class-validator';

export class LookupVariantsDto {
  @ApiProperty({ type: [String], example: ['6f3f6d4c-18f3-4011-ac09-3857e6d37e77'] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @IsUUID('all', { each: true })
  variantIds!: string[];
}
