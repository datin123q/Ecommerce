import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { UpdateVoucherDto } from './dto/update-voucher.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class VouchersService {
  constructor(private readonly prisma: PrismaService, private readonly auditLogsService: AuditLogsService) {}

  //  Tạo mã giảm giá
  async create(createVoucherDto: CreateVoucherDto, adminId: string) {
    const existing = await this.prisma.voucher.findUnique({
      where: { code: createVoucherDto.code },
    });
    if (existing) throw new ConflictException('Mã voucher này đã tồn tại!');

    const newVoucher = await this.prisma.voucher.create({
      data: createVoucherDto, 
    });
    await this.auditLogsService.logAction(
      adminId,
      'CREATE',
      'Voucher',
      newVoucher.id,
      null,        
      newVoucher,   
      this.prisma,
    );
    return newVoucher;
  }

  //  Xem tất cả mã
  findAll() {
    return this.prisma.voucher.findMany({ orderBy: { createdAt: 'desc' } });
  }

  //  Kiểm tra 
  async checkVoucher(code: string, orderTotal: number) {
    const voucher = await this.prisma.voucher.findUnique({ where: { code } });

    if (!voucher) throw new NotFoundException('Mã giảm giá không hợp lệ hoặc không tồn tại');

    // Kiểm tra số lượt sử dụng
    if (voucher.count >= voucher.limit) {
      throw new BadRequestException('Mã giảm giá đã hết lượt sử dụng');
    }

     // Tiền giảm chính là trường value trong database
      let discountAmount = voucher.value;

    return {
      voucherId: voucher.id,
      code: voucher.code,
      discountAmount,
    };
  }
  async updateVoucher(voucherId: string, updateVoucherDto: UpdateVoucherDto, adminId: string) {
    // 1. Kiểm tra xem biến thể có tồn tại không
    const oldVoucher = await this.prisma.voucher.findUnique({ 
      where: { id: voucherId } 
    });

    if (!oldVoucher) {
      throw new NotFoundException(`Không tìm thấy voucher với id ${voucherId}`);
    }

    // 2. Cập nhật dữ liệu mới 
    const newVoucher = await this.prisma.voucher.update({
      where: { id: voucherId },
      data: {
        limit: updateVoucherDto.limit,
        value: updateVoucherDto.value 
      }
    });

    // 3. Ghi lại Audit Log
    await this.auditLogsService.logAction(
      adminId,
      'UPDATE',
      'Voucher', 
      voucherId,
      oldVoucher,
      newVoucher,
      this.prisma,
    );

    return newVoucher;
  }
  async remove(voucherId: string, adminId:string) {
    const oldVoucher = await this.prisma.voucher.findUnique({ 
      where: { id: voucherId } 
    });

    if (!oldVoucher) {
      throw new NotFoundException(`Không tìm thấy voucher với id ${voucherId}`);
    }

    // 2. Cập nhật dữ liệu mới 
    const newVoucher = await this.prisma.voucher.update({
      where: { id: voucherId },
      data: {
        limit: 0,
        count: 0 
      }
    });

    // 3. Ghi lại Audit Log
    await this.auditLogsService.logAction(
      adminId,
      'UPDATE',
      'Voucher', 
      voucherId,
      oldVoucher,
      newVoucher,
      this.prisma,
    );
    return newVoucher;
  }
}