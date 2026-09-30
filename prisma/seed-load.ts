import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
  Role,
  TransactionType,
} from '@prisma/client';
import * as argon2 from 'argon2';

type SeedConfig = {
  batch: string;
  users: number;
  categories: number;
  products: number;
  variantsPerProduct: number;
  warehouses: number;
  orders: number;
  notifications: number;
};

function readCount(name: string, fallback: number, maximum: number): number {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new Error(`${name} phải là số nguyên từ 0 đến ${maximum}`);
  }
  return value;
}

function readConfig(): SeedConfig {
  const batch = (process.env.LOAD_SEED_BATCH ?? 'api-load-v1')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 24);
  if (!batch) throw new Error('LOAD_SEED_BATCH không hợp lệ');

  return {
    batch,
    users: readCount('LOAD_SEED_USERS', 5_000, 50_000),
    categories: readCount('LOAD_SEED_CATEGORIES', 50, 500),
    products: readCount('LOAD_SEED_PRODUCTS', 2_000, 20_000),
    variantsPerProduct: readCount('LOAD_SEED_VARIANTS_PER_PRODUCT', 3, 10),
    warehouses: readCount('LOAD_SEED_WAREHOUSES', 10, 100),
    orders: readCount('LOAD_SEED_ORDERS', 10_000, 100_000),
    notifications: readCount('LOAD_SEED_NOTIFICATIONS', 10_000, 200_000),
  };
}

function assertSafeTarget(): string {
  if (process.env.LOAD_TEST_SEED_CONFIRM !== 'YES') {
    throw new Error(
      'Đặt LOAD_TEST_SEED_CONFIRM=YES để xác nhận đang nạp dữ liệu test.',
    );
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Từ chối chạy seed khi NODE_ENV=production.');
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl)
    throw new Error('Cần truyền DATABASE_URL rõ ràng trong terminal.');

  const url = new URL(databaseUrl);
  const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', 'postgres']);
  if (!allowedHosts.has(url.hostname)) {
    throw new Error(
      `Chỉ cho phép database local; host hiện tại là ${url.hostname}.`,
    );
  }

  return decodeURIComponent(url.pathname.replace(/^\//, ''));
}

function stableId(batch: string, kind: string, key: string): string {
  const hex = createHash('sha256')
    .update(`commerce-load-seed:${batch}:${kind}:${key}`)
    .digest('hex')
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function numberFor(key: string, maximum: number): number {
  const digest = createHash('sha256').update(key).digest();
  return digest.readUInt32BE(0) % maximum;
}

async function insertInBatches<T>(
  rows: T[],
  insert: (batch: T[]) => Promise<{ count: number }>,
): Promise<number> {
  let inserted = 0;
  for (let offset = 0; offset < rows.length; offset += 500) {
    const result = await insert(rows.slice(offset, offset + 500));
    inserted += result.count;
    if ((offset + 500) % 5_000 === 0 || offset + 500 >= rows.length) {
      console.log(`  ${Math.min(offset + 500, rows.length)}/${rows.length}`);
    }
  }
  return inserted;
}

async function main(): Promise<void> {
  const databaseName = assertSafeTarget();
  const config = readConfig();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const password = await argon2.hash('LoadTest123!');
    const userRows = Array.from({ length: config.users }, (_, index) => ({
      id: stableId(config.batch, 'user', String(index)),
      email: `load-${config.batch}-${String(index).padStart(6, '0')}@example.test`,
      password,
      fullName: `Load Test User ${index}`,
      role:
        index === 0
          ? Role.ADMIN
          : index === 1
            ? Role.WAREHOUSE_MANAGER
            : Role.CUSTOMER,
      isVerified: true,
    }));

    console.log(`Database local: ${databaseName}; batch: ${config.batch}`);
    console.log('Tạo users...');
    await insertInBatches(userRows, (data) =>
      prisma.user.createMany({ data, skipDuplicates: true }),
    );

    const categoryRows = Array.from(
      { length: config.categories },
      (_, index) => ({
        id: stableId(config.batch, 'category', String(index)),
        name: `[LOAD ${config.batch}] Category ${String(index).padStart(4, '0')}`,
        description: 'Dữ liệu được tạo tự động để kiểm thử API.',
      }),
    );
    console.log('Tạo categories...');
    await insertInBatches(categoryRows, (data) =>
      prisma.category.createMany({ data, skipDuplicates: true }),
    );

    const productRows = Array.from({ length: config.products }, (_, index) => ({
      id: stableId(config.batch, 'product', String(index)),
      name: `[LOAD ${config.batch}] Product ${String(index).padStart(6, '0')}`,
      description: 'Dữ liệu được tạo tự động để kiểm thử API.',
      price: 50_000 + numberFor(`${config.batch}:price:${index}`, 2_000_000),
      categoryId: categoryRows[index % categoryRows.length].id,
    }));
    console.log('Tạo products...');
    await insertInBatches(productRows, (data) =>
      prisma.product.createMany({ data, skipDuplicates: true }),
    );

    const variantRows = productRows.flatMap((product, productIndex) =>
      Array.from({ length: config.variantsPerProduct }, (_, variantIndex) => ({
        id: stableId(
          config.batch,
          'variant',
          `${productIndex}:${variantIndex}`,
        ),
        sku: `LOAD-${config.batch}-${String(productIndex).padStart(6, '0')}-${variantIndex}`,
        name: `Variant ${variantIndex + 1}`,
        variant: `Option ${variantIndex + 1}`,
        productId: product.id,
      })),
    );
    console.log('Tạo variants...');
    await insertInBatches(variantRows, (data) =>
      prisma.productVariant.createMany({ data, skipDuplicates: true }),
    );

    const warehouseRows = Array.from(
      { length: config.warehouses },
      (_, index) => ({
        id: stableId(config.batch, 'warehouse', String(index)),
        name: `[LOAD ${config.batch}] Warehouse ${index + 1}`,
        location: `Test zone ${index + 1}`,
      }),
    );
    console.log('Tạo warehouses...');
    await insertInBatches(warehouseRows, (data) =>
      prisma.warehouse.createMany({ data, skipDuplicates: true }),
    );

    const inventoryRows = warehouseRows.flatMap((warehouse, warehouseIndex) =>
      variantRows.map((variant, variantIndex) => ({
        id: stableId(
          config.batch,
          'inventory',
          `${warehouseIndex}:${variantIndex}`,
        ),
        warehouseId: warehouse.id,
        variantId: variant.id,
        quantity:
          10 +
          numberFor(
            `${config.batch}:stock:${warehouseIndex}:${variantIndex}`,
            500,
          ),
      })),
    );
    console.log(`Tạo inventories (${inventoryRows.length})...`);
    await insertInBatches(inventoryRows, (data) =>
      prisma.inventory.createMany({ data, skipDuplicates: true }),
    );

    const cartUserRows = userRows.slice(0, Math.floor(userRows.length * 0.7));
    const cartRows = cartUserRows.map((user, index) => ({
      id: stableId(config.batch, 'cart', String(index)),
      userId: user.id,
    }));
    console.log('Tạo carts...');
    await insertInBatches(cartRows, (data) =>
      prisma.cart.createMany({ data, skipDuplicates: true }),
    );

    const cartItemRows = cartRows.flatMap((cart, cartIndex) => {
      const itemCount =
        1 + numberFor(`${config.batch}:cart-count:${cartIndex}`, 3);
      return Array.from({ length: itemCount }, (_, itemIndex) => ({
        id: stableId(config.batch, 'cart-item', `${cartIndex}:${itemIndex}`),
        cartId: cart.id,
        variantId:
          variantRows[(cartIndex * 7 + itemIndex) % variantRows.length].id,
        quantity:
          1 +
          numberFor(`${config.batch}:cart-qty:${cartIndex}:${itemIndex}`, 5),
      }));
    });
    console.log(`Tạo cart items (${cartItemRows.length})...`);
    await insertInBatches(cartItemRows, (data) =>
      prisma.cartItem.createMany({ data, skipDuplicates: true }),
    );

    const orderStatuses = [
      OrderStatus.PENDING,
      OrderStatus.PAID,
      OrderStatus.AWAITING_DELIVERY,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
    ];
    const orderRows = Array.from({ length: config.orders }, (_, index) => ({
      id: stableId(config.batch, 'order', String(index)),
      userId: userRows[index % userRows.length].id,
      status: orderStatuses[index % orderStatuses.length],
      totalAmount: 0,
    }));
    const orderItemRows: Array<{
      id: string;
      orderId: string;
      variantId: string;
      inventoryId: string;
      quantity: number;
      price: number;
      productName: string;
      sku: string;
    }> = [];

    for (let orderIndex = 0; orderIndex < orderRows.length; orderIndex++) {
      const order = orderRows[orderIndex];
      const itemCount =
        1 + numberFor(`${config.batch}:order-count:${orderIndex}`, 4);
      let totalAmount = 0;
      for (let itemIndex = 0; itemIndex < itemCount; itemIndex++) {
        const variantIndex =
          (orderIndex * 11 + itemIndex * 17) % variantRows.length;
        const variant = variantRows[variantIndex];
        const productIndex = Math.floor(
          variantIndex / config.variantsPerProduct,
        );
        const product = productRows[productIndex];
        const warehouseIndex = (orderIndex + itemIndex) % warehouseRows.length;
        const quantity =
          1 +
          numberFor(`${config.batch}:order-qty:${orderIndex}:${itemIndex}`, 4);
        const price = product.price;
        totalAmount += price * quantity;
        orderItemRows.push({
          id: stableId(
            config.batch,
            'order-item',
            `${orderIndex}:${itemIndex}`,
          ),
          orderId: order.id,
          variantId: variant.id,
          inventoryId:
            inventoryRows[warehouseIndex * variantRows.length + variantIndex]
              .id,
          quantity,
          price,
          productName: `${product.name} - ${variant.name}`,
          sku: variant.sku,
        });
      }
      order.totalAmount = totalAmount;
    }

    console.log('Tạo orders...');
    await insertInBatches(orderRows, (data) =>
      prisma.order.createMany({ data, skipDuplicates: true }),
    );
    console.log(`Tạo order items (${orderItemRows.length})...`);
    await insertInBatches(orderItemRows, (data) =>
      prisma.orderItem.createMany({ data, skipDuplicates: true }),
    );

    const paymentRows = orderRows.map((order, index) => ({
      id: stableId(config.batch, 'payment', String(index)),
      orderId: order.id,
      amount: order.totalAmount,
      method: index % 2 === 0 ? PaymentMethod.COD : PaymentMethod.STRIPE,
      status:
        order.status === OrderStatus.PENDING
          ? PaymentStatus.PENDING
          : order.status === OrderStatus.CANCELLED
            ? PaymentStatus.FAILED
            : PaymentStatus.SUCCESS,
      transactionId: index % 2 === 0 ? null : `load-${config.batch}-${index}`,
    }));
    console.log('Tạo payments...');
    await insertInBatches(paymentRows, (data) =>
      prisma.payment.createMany({ data, skipDuplicates: true }),
    );

    const notificationRows = Array.from(
      { length: config.notifications },
      (_, index) => ({
        id: stableId(config.batch, 'notification', String(index)),
        userId: userRows[index % userRows.length].id,
        content: `[LOAD ${config.batch}] Notification ${index}`,
        isRead: index % 2 === 0,
      }),
    );
    console.log('Tạo notifications...');
    await insertInBatches(notificationRows, (data) =>
      prisma.notification.createMany({ data, skipDuplicates: true }),
    );

    const transactionRows = inventoryRows.map((inventory, index) => ({
      id: stableId(config.batch, 'inventory-transaction', String(index)),
      type: TransactionType.IN,
      quantity: inventory.quantity,
      inventoryId: inventory.id,
      userId: userRows[index % userRows.length].id,
    }));
    console.log(`Tạo inventory transactions (${transactionRows.length})...`);
    await insertInBatches(transactionRows, (data) =>
      prisma.inventoryTransaction.createMany({ data, skipDuplicates: true }),
    );

    console.log('\nSeed hoàn tất. Không có dữ liệu nào bị xóa.');
    console.log(`Batch: ${config.batch}`);
    console.log(
      `Tài khoản admin test: load-${config.batch}-000000@example.test / LoadTest123!`,
    );
    console.log(
      `Rows dự kiến: users=${userRows.length}, categories=${categoryRows.length}, products=${productRows.length}, variants=${variantRows.length}, warehouses=${warehouseRows.length}, inventories=${inventoryRows.length}, orders=${orderRows.length}, orderItems=${orderItemRows.length}, payments=${paymentRows.length}, carts=${cartRows.length}, cartItems=${cartItemRows.length}, notifications=${notificationRows.length}, inventoryTransactions=${transactionRows.length}`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
