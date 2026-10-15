import { Inject, Injectable, Logger } from "@nestjs/common";
import Redis, { Cluster } from "ioredis";
import { randomUUID } from "node:crypto";

const TIME_TO_LIVE = 600000

@Injectable()
export class RedisCacheService{
    private readonly logger = new Logger(RedisCacheService.name);
    constructor(@Inject('REDIS_CLIENT') private readonly redisClient: Redis | Cluster) {}

    async get<T>(key: string): Promise<T | null> {
        const data = await this.redisClient.get(key);
        if (data === null) return null;
        try {
        return JSON.parse(data) as T;
        } catch (e) {
        return data as any; 
        }
    }
    async getRaw(key: string): Promise<string | null> {
        return await this.redisClient.get(key);
    }
    async ping(): Promise<string> {
        return this.redisClient.ping();
    }
    async set(key: string, value: object, ttlMs: number = TIME_TO_LIVE): Promise<void> {
        await this.redisClient.set(key, JSON.stringify(value), 'PX', ttlMs);
    }
    async setNumber(key: string, value: number, ttlMs: number = TIME_TO_LIVE): Promise<void> {
        await this.redisClient.set(key, value, 'PX', ttlMs);
    }
    async del(...keys: string[]): Promise<void> {
        if (keys.length > 0) {
        await this.redisClient.del(...keys);
        }
    }
    async delByPattern(pattern: string): Promise<void> {
        try {
        const keysToDelete: string[] = [];

        // Kiểm tra xem đang chạy Cluster hay Standalone
        if (this.redisClient instanceof Redis.Cluster) {
            // Quét trên toàn bộ các node Master của Cluster
            const nodes = this.redisClient.nodes('master');
            for (const node of nodes) {
            await this.scanNode(node, pattern, keysToDelete);
            }
        } else {
            // Quét trên Node đơn bình thường
            await this.scanNode(this.redisClient, pattern, keysToDelete);
        }

        if (keysToDelete.length > 0) {
            const pipeline = this.redisClient.pipeline();
            keysToDelete.forEach((key) => pipeline.del(key));
            await pipeline.exec();
            
            this.logger.log(`Đã dọn dẹp ${keysToDelete.length} keys khớp với pattern: ${pattern}`);
        }
        } catch (error) {
        this.logger.error(`Lỗi khi xóa cache theo pattern [${pattern}]: ${error.message}`);
        }
    }

    private async scanNode(node: Redis | any, pattern: string, resultKeys: string[]) {
        let cursor = '0';
        do {
        const [newCursor, foundKeys] = await node.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = newCursor;
        resultKeys.push(...foundKeys);
        } while (cursor !== '0');
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
    // Chỉ một request lấy được khóa để tải dữ liệu khi cache bị miss.
    async acquireLock(key: string, ttlMs: number): Promise<string | null> {
    const token = randomUUID();
    const result = await this.redisClient.set(
        key,
        token,
        'PX',
        ttlMs,
        'NX',
    );

    return result === 'OK' ? token : null;
    }

    // Chỉ xóa khóa nếu token vẫn thuộc request đã lấy khóa đó.
    async releaseLock(key: string, token: string): Promise<void> {
    const script = `
        if redis.call('get', KEYS[1]) == ARGV[1] then
        return redis.call('del', KEYS[1])
        end
        return 0
    `;

    await this.redisClient.eval(script, 1, key, token);
    }
}
