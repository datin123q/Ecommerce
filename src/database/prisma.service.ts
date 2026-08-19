import 'dotenv/config';
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // 1. Khởi tạo Pool kết nối của 'pg'
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    
    // 2. Bọc Pool vào PrismaPg adapter
    const adapter = new PrismaPg(pool);
    
    // 3. Truyền adapter vào PrismaClient
    super({ adapter });
  }

  async onModuleInit() {
    // Kết nối tới database khi NestJS khởi động
    await this.$connect();
  }

  async onModuleDestroy() {
    // Ngắt kết nối khi ứng dụng tắt
    await this.$disconnect();
  }
}
