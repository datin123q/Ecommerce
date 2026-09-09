import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditAction } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

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
    const db = tx || this.prisma.db;
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
    return this.prisma.db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { email: true, role: true } }, 
      },
    });
  }

  // 3. Lắng nghe các event để tự động ghi log
  @OnEvent('voucher.*')
  @OnEvent('category.*')
  @OnEvent('product.*')
  @OnEvent('variant.*')
  @OnEvent('warehouse.*')
  @OnEvent('inventory.*')
  async handleEvent(payload: any) {
    try {
      const userId = payload.actorId || payload.userId;

      if (!userId) {
        this.logger.warn(`[AuditLog] Bỏ qua ghi log do không có ID người thực hiện: ${payload.entity}`);
        return;
      }
      await this.logAction(
        userId,
        payload.action,
        payload.entity,
        payload.entityId,
        payload.oldValues,
        payload.newValues
      );
      
    } catch (error) {
      this.logger.error(`[AuditLog] Lỗi khi ghi log cho ${payload.entity}: ${error.message}`);
    }
  }
}