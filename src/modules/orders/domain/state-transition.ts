import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

export class StateTransition {
  private static readonly transitions: Record<OrderStatus, OrderStatus[]> = {
    [OrderStatus.PENDING]: [OrderStatus.PAID, OrderStatus.AWAITING_DELIVERY, OrderStatus.CANCELLED],
    [OrderStatus.PAID]: [OrderStatus.AWAITING_DELIVERY, OrderStatus.DELIVERED],
    [OrderStatus.AWAITING_DELIVERY]: [OrderStatus.DELIVERED],
    [OrderStatus.CANCELLED]: [],
    [OrderStatus.DELIVERED]: [],
  };

  static validateTransition(currentStatus: OrderStatus, nextStatus: OrderStatus): void {
    const allowedNextStates = this.transitions[currentStatus] || [];
    if (!allowedNextStates.includes(nextStatus)) {
      throw new BadRequestException(
        `Không thể chuyển đơn hàng từ [${currentStatus}] sang [${nextStatus}]`
      );
    }
  }
}