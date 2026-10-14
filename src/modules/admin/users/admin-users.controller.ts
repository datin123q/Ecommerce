import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { UpdateRoleDto } from '../../users/dto/role-update.dto';
import { UsersService } from '../../users/users.service';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto';

interface AuthenticatedUser {
  id: string;
  role: Role;
}

@ApiTags('Admin Users')
@ApiBearerAuth()
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách tài khoản, lọc theo email/role và phân trang.' })
  getUsers(@Query() query: AdminUsersQueryDto) {
    return this.usersService.getAdminUsers(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem hồ sơ và 10 đơn gần nhất của người dùng.' })
  @ApiParam({ name: 'id', description: 'UUID của người dùng' })
  getUser(@Param('id', ParseUUIDPipe) userId: string) {
    return this.usersService.getAdminUserById(userId);
  }

  @Patch(':id/role')
  @ApiOperation({ summary: 'Cập nhật role của người dùng.' })
  @ApiParam({ name: 'id', description: 'UUID của người dùng' })
  updateRole(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    if (admin.id === userId && dto.role !== Role.ADMIN) {
      throw new BadRequestException('Không thể tự hạ role của tài khoản admin hiện tại.');
    }
    return this.usersService.updateAdminRole(userId, dto.role);
  }
}
