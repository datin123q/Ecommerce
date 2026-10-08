import { Injectable, OnModuleInit, BadRequestException } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisInventoryService implements OnModuleInit {
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }

  async onModuleInit() {
    this.redis.defineCommand('deductStock', {
      numberOfKeys: 1,
      lua: `
        local currentStock = tonumber(redis.call('GET', KEYS[1]))
        local deductAmount = tonumber(ARGV[1])

        -- Trả về -1 nếu Redis không tìm thấy sản phẩm này (Chưa được đồng bộ)
        if currentStock == nil then 
          return -1 
        end

        -- Nếu số lượng tồn kho >= số lượng cần mua -> Thực hiện trừ luôn
        if currentStock >= deductAmount then
          redis.call('DECRBY', KEYS[1], deductAmount)
          return 1 -- Thành công
        else
          return -2 -- Trả về -2 nếu số lượng tồn kho không đủ (Hết hàng)
        end
      `,
    });
  }

  async executeDeduct(variantId: string, quantity: number): Promise<void> {
    const key = `inventory:variant:${variantId}`;
    
    const result = await (this.redis as any).deductStock(key, quantity);

    if (result === -1) {
      throw new BadRequestException('Sản phẩm chưa được mở bán trên hệ thống Flash Sale.');
    }
    if (result === -2) {
      throw new BadRequestException('Sản phẩm đã bán hết.');
    }
  }

  async setInitialStock(variantId: string, quantity: number): Promise<void> {
    const key = `inventory:variant:${variantId}`;
    await this.redis.set(key, quantity);
  }

  async checkIfFlashSaleActive(variantIds: string[]): Promise<boolean> {
    if (!variantIds || variantIds.length === 0) return false;

    const key = `inventory:variant:${variantIds[0]}`;

    const exists = await this.redis.exists(key);
    
    return exists === 1;
  }
}