import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client-core';
import { OrdersService } from '../../orders/orders.service';
import { PaymentsService } from '../../payments/payments.service';
import { InventoryService } from '../../inventory/inventory.service';
import { UsersService } from '../../users/users.service';
import { ProductsService } from '../../products/products.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

type DateRange = {
  from: Date;
  to: Date;
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly paymentsService: PaymentsService,
    private readonly inventoryService: InventoryService,
    private readonly usersService: UsersService,
    private readonly productsService: ProductsService,
  ) {}

  private getRange(query: DashboardQueryDto): DateRange {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from >= to
    ) {
      throw new BadRequestException(
        '`from` phải nhỏ hơn `to` và cả hai phải là ngày hợp lệ.',
      );
    }

    return { from, to };
  }

  async getOverview(query: DashboardQueryDto) {
    const { from, to } = this.getRange(query);
    const [orderSummary, paymentSummary, newCustomers, totalProducts] =
      await Promise.all([
        this.ordersService.getDashboardSummary(from, to),
        this.paymentsService.getDashboardSummary(from, to),
        this.usersService.getDashboardNewCustomerCount(from, to),
        this.productsService.getDashboardActiveProductCount(),
      ]);

    const ordersByStatus = Object.fromEntries(
      Object.values(OrderStatus).map((status) => [status, 0]),
    ) as Record<OrderStatus, number>;

    for (const row of orderSummary.ordersByStatus) {
      ordersByStatus[row.status] = row._count._all;
    }

    const nonCancelledOrderCount = orderSummary.orderValue._count._all;
    const totalOrderValue = orderSummary.orderValue._sum.totalAmount ?? 0;

    return {
      period: { from, to },
      totalOrders: orderSummary.totalOrders,
      ordersByStatus,
      totalOrderValue,
      paidRevenue: paymentSummary.paidRevenue,
      codPendingAmount: paymentSummary.codPendingAmount,
      averageOrderValue:
        nonCancelledOrderCount > 0
          ? Math.round(totalOrderValue / nonCancelledOrderCount)
          : 0,
      newCustomers,
      totalProducts,
    };
  }

  async getRevenue(query: DashboardQueryDto) {
    const { from, to } = this.getRange(query);
    const interval = query.interval ?? 'day';
    const data = await this.paymentsService.getDashboardRevenue(
      from,
      to,
      interval,
    );

    return { period: { from, to, interval }, data };
  }

  async getTopProducts(query: DashboardQueryDto) {
    const { from, to } = this.getRange(query);
    const rows = await this.ordersService.getDashboardTopProducts(
      from,
      to,
      query.limit ?? 10,
    );

    return {
      period: { from, to },
      data: rows.map((row) => ({
        productName: row.productName,
        sku: row.sku,
        unitsSold: Number(row.unitsSold),
        revenue: Number(row.revenue),
      })),
    };
  }

  getRecentOrders(query: DashboardQueryDto) {
    return this.ordersService.getDashboardRecentOrders(query.limit ?? 10);
  }

  getLowStock(query: DashboardQueryDto) {
    return this.inventoryService.getDashboardLowStock(
      query.threshold ?? 5,
      query.limit ?? 10,
    );
  }
}
