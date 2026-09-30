import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import {
  applySoftDeleteFilters,
  isSoftDeleteModel,
  type SoftDeleteQueryArgs,
} from './soft-delete.helpers';

type SoftDeleteDelegate = {
  update(args: { where: unknown; data: { deletedAt: Date } }): Promise<unknown>;
  updateMany(args: {
    where: unknown;
    data: { deletedAt: Date };
  }): Promise<unknown>;
};

type SoftDeleteClient = Omit<PrismaClient, '$on'>;

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly baseClient: PrismaClient;

  public readonly db: SoftDeleteClient;

  constructor() {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    const adapter = new PrismaPg(pool);
    const base = new PrismaClient({ adapter });
    this.baseClient = base;

    this.db = base.$extends({
      query: {
        $allModels: {
          async delete({ model, args, query }) {
            if (isSoftDeleteModel(model)) {
              const delegate = base[model] as unknown as SoftDeleteDelegate;
              return delegate.update({
                where: args.where,
                data: { deletedAt: new Date() },
              });
            }

            return query(args);
          },
          async deleteMany({ model, args, query }) {
            if (isSoftDeleteModel(model)) {
              const delegate = base[model] as unknown as SoftDeleteDelegate;
              return delegate.updateMany({
                where: args.where,
                data: { deletedAt: new Date() },
              });
            }

            return query(args);
          },
          async findMany({ model, args, query }) {
            applySoftDeleteFilters(model, args);
            return query(args);
          },
          async findFirst({ model, args, query }) {
            applySoftDeleteFilters(model, args);
            return query(args);
          },
          async findUnique({ model, args, query }) {
            applySoftDeleteFilters(model, args);
            return query(args);
          },
          async count({ model, args, query }) {
            if (isSoftDeleteModel(model)) {
              args.where = {
                ...args.where,
                deletedAt: null,
              };
            }

            return query(args);
          },
        },
      },
    }) as unknown as SoftDeleteClient;
  }

  async onModuleInit() {
    await this.baseClient.$connect();
  }

  async onModuleDestroy() {
    await this.baseClient.$disconnect();
  }
}
