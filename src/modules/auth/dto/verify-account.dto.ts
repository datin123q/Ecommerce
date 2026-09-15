import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class VerifyAccountDto {
  @ApiProperty({example:'82f3904e180a...'})
  @IsString()
  token!: string; 
}