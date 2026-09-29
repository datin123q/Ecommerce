import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const SOFT_DELETE_MODELS = [
  'User',
  'Product',
  'ProductVariant',
  'Category',
  'Warehouse',
  'Voucher',
] as const;

type SoftDeleteModel =
  (typeof SOFT_DELETE_MODELS)[number];

const SOFT_DELETE_RELATIONS: Record<
  string,
  string[]
> = {
  Product: ['variants'],
  Category: ['products'],
  Warehouse: ['inventories'],
};

function isSoftDeleteModel(
  model: string,
): model is SoftDeleteModel {
  return SOFT_DELETE_MODELS.includes(
    model as SoftDeleteModel,
  );
}

function hasInclude(
  args: object,
): args is {
  include?: Record<string, any>;
} {
  return 'include' in args;
}

function applySoftDeleteToInclude(
  model: string,
  args: {
    include?: Record<string, any>;
  },
): void {
  if (!args.include) {
    return;
  }

  const relations =
    SOFT_DELETE_RELATIONS[model] ?? [];

  if (relations.length === 0) {
    return;
  }

  for (const relation of relations) {
    const relationValue =
      args.include[relation];

    if (relationValue === true) {
      args.include[relation] = {
        where: {
          deletedAt: null,
        },
      };

      continue;
    }

    if (
      relationValue &&
      typeof relationValue === 'object'
    ) {
      args.include[relation] = {
        ...relationValue,

        where: {
          ...relationValue.where,
          deletedAt: null,
        },
      };
    }
  }
}

@Injectable()
export class PrismaService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly baseClient: PrismaClient;

  public readonly db;

  constructor() {

    const pool = new Pool({
      connectionString:
        process.env.DATABASE_URL,
    });

    const adapter = new PrismaPg(pool);

    const base = new PrismaClient({
      adapter,
    });

    this.baseClient = base;

    this.db = base.$extends({
      query: {
        $allModels: {

          async delete({
            model,
            args,
            query,
          }) {
            if (isSoftDeleteModel(model)) {
              return (base as any)[
                model
              ].update({
                where: args.where,

                data: {
                  deletedAt: new Date(),
                },
              });
            }

            return query(args);
          },

          async deleteMany({
            model,
            args,
            query,
          }) {
            if (isSoftDeleteModel(model)) {
              return (base as any)[
                model
              ].updateMany({
                where: args.where,

                data: {
                  deletedAt: new Date(),
                },
              });
            }

            return query(args);
          },

          async findMany({
            model,
            args,
            query,
          }) {
            if (isSoftDeleteModel(model)) {
              args.where = {
                ...args.where,
                deletedAt: null,
              };
            }

            if (hasInclude(args)) {
              applySoftDeleteToInclude(
                model,
                args,
              );
            }

            return query(args);
          },

          async findFirst({
            model,
            args,
            query,
          }) {
            if (isSoftDeleteModel(model)) {
              args.where = {
                ...args.where,
                deletedAt: null,
              };
            }

            if (hasInclude(args)) {
              applySoftDeleteToInclude(
                model,
                args,
              );
            }

            return query(args);
          },

          async findUnique({
            model,
            args,
            query,
          }) {
            if (isSoftDeleteModel(model)) {
              args.where = {
                ...args.where,
                deletedAt: null,
              };
            }

            if (hasInclude(args)) {
              applySoftDeleteToInclude(
                model,
                args,
              );
            }

            return query(args);
          },

          async count({
            model,
            args,
            query,
          }) {
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
    });
  }

  async onModuleInit() {
    await this.baseClient.$connect();
  }

  async onModuleDestroy() {
    await this.baseClient.$disconnect();
  }
}