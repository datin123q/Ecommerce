import 'dotenv/config';
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const SOFT_DELETE_MODELS = ['User', 'Product', 'ProductVariant', 'Category', 'Warehouse', 'Voucher'];

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly baseClient: PrismaClient;
  public readonly db; 

  constructor() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    const base = new PrismaClient({ adapter });
    this.baseClient = base;

    this.db = base.$extends({
      query: {
        // 1. EXTENSION CHO SOFT DELETE (Áp dụng cho các bảng trong mảng)
        $allModels: {
          async delete({ model, args, query }) {
            if (SOFT_DELETE_MODELS.includes(model)) {
              return (base as any)[model].update({ ...args, data: { deletedAt: new Date() } });
            }
            return query(args);
          },
          async deleteMany({ model, args, query }) {
            if (SOFT_DELETE_MODELS.includes(model)) {
                return (base as any)[model].updateMany({ ...args, data: { deletedAt: new Date() } });
              }
              return query(args);
            },
          async findMany({ model, args, query }) {
            if (SOFT_DELETE_MODELS.includes(model)) {
              args.where = { ...args.where, deletedAt: null };
            }
            return query(args);
          },
          async findFirst({ model, args, query }) {
            if (SOFT_DELETE_MODELS.includes(model)) {
              args.where = { ...args.where, deletedAt: null };
            }
            return query(args);
          }
        },
      },
    });
  }

  async onModuleInit() {
    await this.baseClient.$connect();
  }

  async onModuleDestroy() {
    await this.baseClient.$disconnect();
  }
}