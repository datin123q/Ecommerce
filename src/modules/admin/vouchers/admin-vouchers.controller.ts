import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { VouchersService } from '../../vouchers/vouchers.service';
import { CreateVoucherDto } from '../../vouchers/dto/create-voucher.dto';
import { UpdateVoucherDto } from '../../vouchers/dto/update-voucher.dto';

interface AuthenticatedUser {
  id: string;
}

@ApiTags('Admin Vouchers')
@ApiBearerAuth()
@Controller('admin/vouchers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminVouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo voucher.' })
  create(@Body() dto: CreateVoucherDto, @CurrentUser() admin: AuthenticatedUser) {
    return this.vouchersService.create(dto, admin.id);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách voucher.' })
  findAll() {
    return this.vouchersService.findAll();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật voucher.' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateVoucherDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.vouchersService.updateVoucher(id, dto, admin.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa voucher.' })
  remove(@Param('id') id: string, @CurrentUser() admin: AuthenticatedUser) {
    return this.vouchersService.remove(id, admin.id);
  }
}
