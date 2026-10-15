import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RedisCacheService } from '../redis/redisCache.service';

type HealthStatus = 'up' | 'down';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisCache: RedisCacheService,
  ) {}

  async check() {
    const databaseClients = [
      ['postgres_master', this.prisma.masterClient] as const,
      ...this.prisma.replicaClients.map(
        (client, index) => [`postgres_replica_${index + 1}`, client] as const,
      ),
    ];

    const databaseChecks = await Promise.all(
      databaseClients.map(async ([name, client]) => {
        const status = await this.checkDependency(() =>
          client.$queryRaw`SELECT 1`,
        );
        return [name, status] as const;
      }),
    );

    const redisStatus = await this.checkDependency(() => this.redisCache.ping());
    const checks = Object.fromEntries([
      ...databaseChecks,
      ['redis', redisStatus] as const,
    ]) as Record<string, HealthStatus>;
    const healthy = Object.values(checks).every((status) => status === 'up');

    return {
      status: healthy ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  // Giới hạn thời gian kiểm tra để health endpoint không bị treo theo kết nối phụ thuộc.
  private async checkDependency(operation: () => Promise<unknown>): Promise<HealthStatus> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Health check timed out')), 2_000);
        }),
      ]);
      return 'up';
    } catch {
      return 'down';
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
