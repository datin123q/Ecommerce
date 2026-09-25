import { Inject, Injectable, Logger } from "@nestjs/common";
import Redis from "ioredis";

@Injectable()
export class RedisCacheService{
    private readonly logger = new Logger(RedisCacheService.name);
    constructor(@Inject('REDIS_CLIENT') private readonly redisClient: Redis){}

    async get<T>(key: string): Promise<T | null> {
        const data = await this.redisClient.get(key);
        if (data === null) return null;
        try {
        return JSON.parse(data) as T;
        } catch (e) {
        return data as any; 
        }
    }
    async set(key: string, value: object, ttlMs: number = 600000): Promise<void> {
        await this.redisClient.set(key, JSON.stringify(value), 'PX', ttlMs);
    }
    async del(...keys: string[]): Promise<void> {
        if (keys.length > 0) {
        await this.redisClient.del(...keys);
        }
    }
    async delByPattern(pattern: string): Promise<void> {
        try {
        let cursor = '0'; 
        const keysToDelete: string[] = [];

        do {
            const [newCursor, foundKeys] = await this.redisClient.scan(
            cursor,
            'MATCH',
            pattern,
            'COUNT',
            100 
            );
            
            cursor = newCursor;
            keysToDelete.push(...foundKeys);
        } while (cursor !== '0');

        if (keysToDelete.length > 0) {
            await this.redisClient.del(...keysToDelete);
            this.logger.log(`Đã dọn dẹp ${keysToDelete.length} keys khớp với pattern: ${pattern}`);
        }
        
        } catch (error) {
        this.logger.error(`Lỗi khi xóa cache theo pattern [${pattern}]: ${error.message}`);
        }
    }
    async setNX(key: string, value: string, ttlSeconds: number): Promise<boolean> {
        try {
        const result = await this.redisClient.set(key, value, 'EX', ttlSeconds, 'NX');
        return result === 'OK';
        } catch (error) {
        this.logger.error(`Lỗi khi tạo Lock [${key}]: ${error.message}`);
        return false;
        }
    }
}