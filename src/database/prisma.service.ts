/* eslint-disable @typescript-eslint/unbound-method */
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import {
  applySoftDeleteFilters,
  isSoftDeleteModel,
} from './soft-delete.helpers';

type SoftDeleteDelegate = {
  update(args: { where: unknown; data: { deletedAt: Date } }): Promise<unknown>;
  updateMany(args: {
    where: unknown;
    data: { deletedAt: Date };
  }): Promise<unknown>;
};

type ReplicaReadDelegate = {
  findMany(args: unknown): Promise<unknown>;
  findFirst(args: unknown): Promise<unknown>;
  findUnique(args: unknown): Promise<unknown>;
  count(args: unknown): Promise<unknown>;
};

type SoftDeleteClient = Omit<PrismaClient, '$on'>;

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  public readonly masterClient: PrismaClient<Prisma.PrismaClientOptions, 'query' >;
  public readonly replicaClient: PrismaClient<Prisma.PrismaClientOptions, 'query' >;
  public readonly db: SoftDeleteClient;

  constructor() {
    const masterPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
    });
    masterPool.on('error', (err) => {
      console.error('Lỗi kết nối ngầm ở Master DB:', err.message);
    });
    this.masterClient = new PrismaClient({ adapter: new PrismaPg(masterPool), log: [ { emit: 'event', level: 'query' } ], });

    const replicaPool = new Pool({
      connectionString: process.env.DATABASE_REPLICA_URL,
      max: 20,
    });
    replicaPool.on('error', (err) => {
      console.error('Lỗi kết nối ngầm ở Slave DB:', err.message);
    });
    this.replicaClient = new PrismaClient({ adapter: new PrismaPg(replicaPool), log: [ { emit: 'event', level: 'query' } ], });
    const master = this.masterClient;
    const replica = this.replicaClient;
    this.masterClient.$on('query', (e: Prisma.QueryEvent) => {
      console.log(`[MASTER DB] Query: ${e.query} | Params: ${e.params}`);
    });

    this.replicaClient.$on('query', (e: Prisma.QueryEvent) => {
      console.log(`[REPLICA DB] Query: ${e.query} | Params: ${e.params}`);
    });
    this.db = master.$extends({
      query: {
        $allModels: {
          async delete({ model, args, query }) {
            if (isSoftDeleteModel(model)) {
              const delegate = master[
                model as keyof PrismaClient
              ] as unknown as SoftDeleteDelegate;
              return delegate.update({
                where: args.where,
                data: { deletedAt: new Date() },
              });
            }
            return query(args);
          },
          async deleteMany({ model, args, query }) {
            if (isSoftDeleteModel(model)) {
              const delegate = master[
                model as keyof PrismaClient
              ] as unknown as SoftDeleteDelegate;
              return delegate.updateMany({
                where: args.where,
                data: { deletedAt: new Date() },
              });
            }
            return query(args);
          },

          async findMany({ model, args }) {
            applySoftDeleteFilters(model, args);
            const delegate = replica[
              model as keyof PrismaClient
            ] as unknown as ReplicaReadDelegate;
            return delegate.findMany(args);
          },
          async findFirst({ model, args }) {
            applySoftDeleteFilters(model, args);
            const delegate = replica[
              model as keyof PrismaClient
            ] as unknown as ReplicaReadDelegate;
            return delegate.findFirst(args);
          },
          async findUnique({ model, args }) {
            if (isSoftDeleteModel(model)) {
              applySoftDeleteFilters(model, args);
              const delegate = replica[
                model as keyof PrismaClient
              ] as unknown as ReplicaReadDelegate;
              return delegate.findFirst(args); 
            }

            const delegate = replica[
              model as keyof PrismaClient
            ] as unknown as ReplicaReadDelegate;
            return delegate.findUnique(args);
          },
          async count({ model, args }) {
            if (isSoftDeleteModel(model)) {
              applySoftDeleteFilters(model, args);
            }
            const delegate = replica[
              model as keyof PrismaClient
            ] as unknown as ReplicaReadDelegate;
            return delegate.count(args);
          },
        },
      },
    }) as unknown as SoftDeleteClient;
  }

  async onModuleInit() {
    await Promise.all([
      this.masterClient.$connect(),
      this.replicaClient.$connect(),
    ]);
  }

  async onModuleDestroy() {
    await Promise.all([
      this.masterClient.$disconnect(),
      this.replicaClient.$disconnect(),
    ]);
  }
}