import { PrismaService } from '../../src/database/prisma.service';

export class DbHelper {
  constructor(private prisma: PrismaService) {}

  async clearDatabase(userEmail?: string) {
    await this.prisma.db.voucherUsage.deleteMany();
    await this.prisma.db.orderItem.deleteMany();
    await this.prisma.db.order.deleteMany();
    await this.prisma.db.cartItem.deleteMany();
    await this.prisma.db.cart.deleteMany();
    await this.prisma.db.inventoryTransaction.deleteMany();
    await this.prisma.db.inventory.deleteMany();
    await this.prisma.db.warehouse.deleteMany();
    await this.prisma.db.productVariant.deleteMany();
    await this.prisma.db.product.deleteMany();
    await this.prisma.db.category.deleteMany();
    if (userEmail) {
      await this.prisma.db.user.deleteMany({ where: { email: userEmail } });
    }
  }

  async seedStorefront() {
    const category = await this.prisma.db.category.create({
      data: { name: 'Áo Nam E2E Full', description: 'Category' },
    });

    const product = await this.prisma.db.product.create({
      data: {
        name: 'Áo thun Full Test',
        description: 'Desc',
        price: 150000,
        categoryId: category.id,
        variants: {
          create: [{ sku: 'E2E-FULL-SKU', name: 'Đỏ', variant: 'Size M' }],
        },
      },
      include: { variants: true },
    });

    const warehouse = await this.prisma.db.warehouse.create({
      data: { name: 'Kho E2E Full', location: 'HN' },
    });

    const variantId = product.variants[0].id;

    await this.prisma.db.inventory.create({
      data: { warehouseId: warehouse.id, variantId, quantity: 100 },
    });

    return { variantId, warehouseId: warehouse.id };
  }
}