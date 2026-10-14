import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { CategoriesModule } from '../categories/categories.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { ProductsModule } from '../products/products.module';
import { TasksModule } from '../tasks/tasks.module';
import { UsersModule } from '../users/users.module';
import { VouchersModule } from '../vouchers/vouchers.module';
import { AdminAuditLogsController } from './audit-logs/admin-audit-logs.controller';
import { AdminCategoriesController } from './categories/admin-categories.controller';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';
import { AdminInventoryController } from './inventory/admin-inventory.controller';
import { AdminOrdersController } from './orders/admin-orders.controller';
import { AdminProductsController } from './products/admin-products.controller';
import { AdminTasksController } from './tasks/admin-tasks.controller';
import { AdminUsersController } from './users/admin-users.controller';
import { AdminVouchersController } from './vouchers/admin-vouchers.controller';

@Module({
  imports: [
    AuditLogsModule,
    CategoriesModule,
    InventoryModule,
    OrdersModule,
    PaymentsModule,
    ProductsModule,
    TasksModule,
    UsersModule,
    VouchersModule,
  ],
  controllers: [
    AdminAuditLogsController,
    AdminCategoriesController,
    AdminInventoryController,
    AdminOrdersController,
    AdminProductsController,
    AdminTasksController,
    AdminUsersController,
    AdminVouchersController,
    DashboardController,
  ],
  providers: [DashboardService],
})
export class AdminModule {}
