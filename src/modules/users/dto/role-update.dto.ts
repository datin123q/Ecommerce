import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { Role } from '@prisma/client-core'; 

export class UpdateRoleDto {
  @ApiProperty({ enum: Role, example: Role.ADMIN, description: 'Quyền của người dùng' })
  @IsNotEmpty()
  @IsEnum(Role)
  role: Role;
}