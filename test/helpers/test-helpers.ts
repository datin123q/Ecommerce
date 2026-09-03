import { PrismaService } from '../../src/database/prisma.service';

export class DbHelper {
  constructor(private prisma: PrismaService) {}

  async clearDatabase(userEmail?: string) {
    await this.prisma.voucherUsage.deleteMany();
    await this.prisma.orderItem.deleteMany();
    await this.prisma.order.deleteMany();
    await this.prisma.cartItem.deleteMany();
    await this.prisma.cart.deleteMany();
    await this.prisma.inventoryTransaction.deleteMany();
    await this.prisma.inventory.deleteMany();
    await this.prisma.warehouse.deleteMany();
    await this.prisma.productVariant.deleteMany();
    await this.prisma.product.deleteMany();
    await this.prisma.category.deleteMany();
    if (userEmail) {
      await this.prisma.user.deleteMany({ where: { email: userEmail } });
    }
  }

  async seedStorefront() {
    const category = await this.prisma.category.create({
      data: { name: 'Áo Nam E2E Full', description: 'Category' },
    });

    const product = await this.prisma.product.create({
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

    const warehouse = await this.prisma.warehouse.create({
      data: { name: 'Kho E2E Full', location: 'HN' },
    });

    const variantId = product.variants[0].id;

    await this.prisma.inventory.create({
      data: { warehouseId: warehouse.id, variantId, quantity: 100 },
    });

    return { variantId, warehouseId: warehouse.id };
  }
}