import { Inject, Injectable } from "@nestjs/common";
import Redis from "ioredis";

@Injectable()
export class RedisCacheService{
    constructor(@Inject('REDIS_CLIENT') private readonly redisClient: Redis){}

    async get<T>(key: string): Promise<T | null> {
        const data = await this.redisClient.get(key);
        if (!data) return null;
        try {
        return JSON.parse(data) as T;
        } catch (e) {
        return data as any; 
        }
    }
    async set(key: string, value: any, ttlMs: number = 600000): Promise<void> {
        const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;
        await this.redisClient.set(key, stringValue, 'PX', ttlMs);
    }
    async del(...keys: string[]): Promise<void> {
        if (keys.length > 0) {
        await this.redisClient.del(...keys);
        }
    }
}