import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { UpdateVoucherDto } from './dto/update-voucher.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';

@Injectable()
export class VouchersService {
  constructor(
    private readonly prisma: PrismaService,   
    private readonly eventEmitter: EventEmitter2
  ) {}

  async create(createVoucherDto: CreateVoucherDto, adminId: string) {
    const existing = await this.prisma.db.voucher.findUnique({
      where: { code: createVoucherDto.code },
    });
    if (existing) throw new ConflictException('Mã voucher này đã tồn tại!');

    const newVoucher = await this.prisma.db.voucher.create({
      data: createVoucherDto, 
    });
    
    this.postAuditEvent('voucher.created', adminId, 'CREATE', newVoucher.id, null, newVoucher);
    return newVoucher;
  }

  findAll() {
    return this.prisma.db.voucher.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async updateVoucher(voucherId: string, updateVoucherDto: UpdateVoucherDto, adminId: string) {
    const oldVoucher = await this.prisma.db.voucher.findUnique({ 
      where: { id: voucherId } 
    });

    if (!oldVoucher) {
      throw new NotFoundException(`Không tìm thấy voucher với id ${voucherId}`);
    }

    const newVoucher = await this.prisma.db.voucher.update({
      where: { id: voucherId },
      data: {
        limit: updateVoucherDto.limit,
        value: updateVoucherDto.value 
      }
    });

    this.postAuditEvent('voucher.update', adminId, 'UPDATE', voucherId, oldVoucher, newVoucher);
    return newVoucher;
  }

  async remove(voucherId: string, adminId: string) {
    const oldVoucher = await this.prisma.db.voucher.findUnique({ 
      where: { id: voucherId } 
    });

    if (!oldVoucher) {
      throw new NotFoundException(`Không tìm thấy voucher với id ${voucherId}`);
    }

    const newVoucher = await this.prisma.db.voucher.update({
      where: { id: voucherId },
      data: { limit: 0 } 
    });

    this.postAuditEvent('voucher.delete', adminId, 'DELETE', voucherId, oldVoucher, newVoucher);
    return newVoucher;
  }

  async validateAndGetVoucher(voucherCode: string) {
    const voucher = await this.prisma.db.voucher.findUnique({ 
      where: { code: voucherCode } 
    });
    
    if (!voucher) {
      throw new NotFoundException('Mã giảm giá không tồn tại hoặc đã hết hạn');
    }

    if (  voucher.count >= voucher.limit) {
      throw new BadRequestException('Mã giảm giá đã hết lượt sử dụng');
    }
        
    return voucher;
  }

  async applyVoucher(tx: Prisma.TransactionClient, voucherId: string, limit: number, userId: string, orderId: string) {

    const updateVoucher = await tx.voucher.updateMany({
      where: { id: voucherId, count: { lt: limit } } ,
      data: { count: { increment: 1 } },
    });
    
    if (updateVoucher.count === 0) {
      throw new BadRequestException('Mã giảm giá không tồn tại hoặc vừa chạm mức giới hạn!');
    }

    await tx.voucherUsage.create({ data: { voucherId, userId, orderId } });
  }

  async restoreVoucher(tx: Prisma.TransactionClient, orderId: string, userId: string) {
    const voucherUsage = await tx.voucherUsage.findFirst({
      where: { orderId, userId },
    });

    if (voucherUsage) {
      await tx.voucher.update({
        where: { id: voucherUsage.voucherId },
        data: { count: { decrement: 1 } },
      });

      await tx.voucherUsage.delete({
        where: { id: voucherUsage.id },
      });
    }
  }

  private postAuditEvent(eventName: string, actorId: string, action: string, entityId: string, oldValue: any, newValue: any) {
    this.eventEmitter.emit(eventName, {
      actorId,
      action,
      entity: 'Voucher',
      entityId,
      oldValue,        
      newValue,   
    });
  }
}