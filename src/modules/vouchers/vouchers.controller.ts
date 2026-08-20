import { Controller, Get, Post, Body, UseGuards, Param, Query , Patch, Delete} from '@nestjs/common';
import { VouchersService } from './vouchers.service';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { UpdateVoucherDto } from './dto/update-voucher.dto';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Vouchers (Khuyến mãi)')
@Controller('vouchers')
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN) 
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo mã giảm giá mới (Chỉ ADMIN)' })
  create(@Body() createVoucherDto: CreateVoucherDto, @CurrentUser() user: any) {
    return this.vouchersService.create(createVoucherDto, user.id );
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy danh sách tất cả mã giảm giá (Chỉ ADMIN)' })
  findAll() {
    return this.vouchersService.findAll();
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật voucher' })
  updateProduct(
      @Param('id') id: string, 
      @Body() updateVoucherDto: UpdateVoucherDto,
      @CurrentUser() user: any 
    ) {
      return this.vouchersService.updateVoucher(id, updateVoucherDto, user.id);
    }

  //  XÓA VOUCHER
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa voucher (Chỉ ADMIN)' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.vouchersService.remove(id, user.id);
  }

}