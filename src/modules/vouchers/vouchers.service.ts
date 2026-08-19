import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateVoucherDto } from './dto/create-voucher.dto';

@Injectable()
export class VouchersService {
  constructor(private readonly prisma: PrismaService) {}

  //  Tạo mã giảm giá
  async create(createVoucherDto: CreateVoucherDto) {
    const existing = await this.prisma.voucher.findUnique({
      where: { code: createVoucherDto.code },
    });
    if (existing) throw new ConflictException('Mã voucher này đã tồn tại!');

    return this.prisma.voucher.create({
      data: createVoucherDto, 
    });
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
}