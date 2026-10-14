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
  aggregate(args: unknown): Promise<unknown>;
  groupBy(args: unknown): Promise<unknown>;
};

type SoftDeleteClient = Omit<PrismaClient, '$on'>;

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  public readonly masterClient: PrismaClient<Prisma.PrismaClientOptions, 'query' >;
  public readonly replicaClients: PrismaClient<Prisma.PrismaClientOptions, 'query' >[] = [];
  public readonly db: SoftDeleteClient;

  private currentReplicaIndex = 0;

  constructor() {
    const masterPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
    });
    masterPool.on('error', (err) => {
      console.error('Lỗi kết nối ngầm ở Master DB:', err.message);
    });
    this.masterClient = new PrismaClient({ adapter: new PrismaPg(masterPool), log: [ { emit: 'event', level: 'query' } ], });
    this.masterClient.$on('query', (e: Prisma.QueryEvent) => {
      console.log(`[MASTER DB] Query: ${e.query} | Params: ${e.params}`);
    });

    const replicaUrls = (
      process.env.DATABASE_REPLICA_URLS ||
      process.env.DATABASE_REPLICA_URL ||
      ''
    )
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean);
    replicaUrls.forEach((url, index) => {
      const replicaPool = new Pool({
        connectionString: url.trim(),
        max: 20,
      });
      replicaPool.on('error', (err) => {
        console.error(`Lỗi kết nối ngầm ở Replica DB ${index + 1}:`, err.message);
      });
      const client = new PrismaClient({ 
        adapter: new PrismaPg(replicaPool), 
        log: [{ emit: 'event', level: 'query' }], 
      });

      client.$on('query', (e: Prisma.QueryEvent) => {
        console.log(`[REPLICA DB ${index + 1}] Query: ${e.query} | Params: ${e.params}`);
      });

      this.replicaClients.push(client);
    });

    const master = this.masterClient;
    
    const getNextReplica = () => {
      if (this.replicaClients.length === 0) return master; 
      const client = this.replicaClients[this.currentReplicaIndex];
      this.currentReplicaIndex = (this.currentReplicaIndex + 1) % this.replicaClients.length;
      return client;
    };

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
            const replica = getNextReplica();
            const delegate = replica[
              model as keyof PrismaClient
            ] as unknown as ReplicaReadDelegate;
            return delegate.findMany(args);
          },
          async findFirst({ model, args }) {
            applySoftDeleteFilters(model, args);
            const replica = getNextReplica();
            const delegate = replica[
              model as keyof PrismaClient
            ] as unknown as ReplicaReadDelegate;
            return delegate.findFirst(args);
          },
          async findUnique({ model, args }) {
            if (isSoftDeleteModel(model)) {
              applySoftDeleteFilters(model, args);
            }
            const replica = getNextReplica();
            const delegate = replica[
              model as keyof PrismaClient
            ] as unknown as ReplicaReadDelegate;
            return delegate.findUnique(args);
          },
          async count({ model, args }) {
            if (isSoftDeleteModel(model)) {
              applySoftDeleteFilters(model, args);
            }
            const replica = getNextReplica();
            const delegate = replica[
              model as keyof PrismaClient
            ] as unknown as ReplicaReadDelegate;
            return delegate.count(args);
          },
          async aggregate({ model, args }) {
            if (isSoftDeleteModel(model)) {
              applySoftDeleteFilters(model, args);
            }
            const replica = getNextReplica();
            const delegate = replica[
              model as keyof PrismaClient
            ] as unknown as ReplicaReadDelegate;
            return delegate.aggregate(args);
          },
          async groupBy({ model, args }) {
            if (isSoftDeleteModel(model)) {
              applySoftDeleteFilters(model, args);
            }
            const replica = getNextReplica();
            const delegate = replica[
              model as keyof PrismaClient
            ] as unknown as ReplicaReadDelegate;
            return delegate.groupBy(args);
          },
        },
      },
    }) as unknown as SoftDeleteClient;
  }

  async onModuleInit() {
    await Promise.all([
      this.masterClient.$connect(),
      ...this.replicaClients.map(client => client.$connect()),
    ]);
  }

  async onModuleDestroy() {
    await Promise.all([
      this.masterClient.$disconnect(),
      ...this.replicaClients.map(client => client.$connect()),
    ]);
  }
}
