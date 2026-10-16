import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly db: PrismaClient;
  private readonly pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL chưa được cấu hình cho Catalog service');
    }

    this.pool = new Pool({ connectionString, max: 20 });
    this.pool.on('error', (error) => {
      console.error(
        'Lỗi kết nối PostgreSQL của Catalog service:',
        error.message,
      );
    });
    this.db = new PrismaClient({ adapter: new PrismaPg(this.pool) });
  }

  async onModuleInit(): Promise<void> {
    await this.db.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.$disconnect();
    await this.pool.end();
  }
}
