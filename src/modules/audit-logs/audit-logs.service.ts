import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditAction } from '@prisma/client';
import { Prisma } from '@prisma/client';
@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  // 1. Hàm dùng chung để ghi log
  async logAction(
    userId: string,
    action: AuditAction,
    entity: string,
    entityId: string,
    oldValues?: any,
    newValues?: any,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx || this.prisma;
    return db.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        oldValues: oldValues ? JSON.parse(JSON.stringify(oldValues)) : null,
        newValues: newValues ? JSON.parse(JSON.stringify(newValues)) : null,
      },
    });
  }

  // 2. Lấy danh sách nhật ký (Dành cho Admin)
  async getLogs() {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { email: true, role: true } }, // Kèm thông tin người thực hiện
      },
    });
  }
}