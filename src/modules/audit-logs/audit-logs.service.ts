import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AuditAction, Prisma } from '@prisma/client-core';
import { PrismaService } from '../../database/prisma.service';

interface AuditEventPayload {
  actorId?: string;
  userId?: string;
  id?: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  oldValues?: unknown;
  newValues?: unknown;
  oldValue?: unknown;
  newValue?: unknown;
}

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logAction(
    userId: string,
    action: AuditAction,
    entity: string,
    entityId: string,
    oldValues?: unknown,
    newValues?: unknown,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma.db;

    return db.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        oldValues: oldValues
          ? JSON.parse(JSON.stringify(oldValues))
          : null,
        newValues: newValues
          ? JSON.parse(JSON.stringify(newValues))
          : null,
      },
    });
  }

  async getLogs() {
    return this.prisma.db.auditLog.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  @OnEvent('voucher.*')
  @OnEvent('category.*')
  @OnEvent('product.*')
  @OnEvent('variant.*')
  @OnEvent('warehouse.*')
  @OnEvent('inventory.*')
  async handleEvent(payload: AuditEventPayload) {
    try {
      const userId = payload.actorId ?? payload.userId ?? payload.id;

      if (!userId) {
        this.logger.warn(
          `[AuditLog] Bỏ qua ghi log do không có ID người thực hiện: ${payload.entity}`,
        );
        return;
      }

      await this.logAction(
        userId,
        payload.action,
        payload.entity,
        payload.entityId,
        payload.oldValues ?? payload.oldValue,
        payload.newValues ?? payload.newValue,
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown error';

      this.logger.error(
        `[AuditLog] Lỗi khi ghi log cho ${payload.entity}: ${message}`,
      );
    }
  }
}
