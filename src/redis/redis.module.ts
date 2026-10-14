import { Module, Global, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisCacheService } from './redisCache.service';

const logger = new Logger('redis');

export const getRedisConnection = (configService: ConfigService) => {
  const isCluster = configService.get<string>('REDIS_CLUSTER_MODE') === 'true';

  if (isCluster) {
    const nodesString = configService.get<string>('REDIS_CLUSTER_NODES') || '';
    const nodes = nodesString.split(',').map((node) => {
      const [host, port] = node.split(':');
      return { host, port: parseInt(port, 10) };
    });

    const natMapString = configService.get<string>('REDIS_CLUSTER_NATMAP');
    const natMap = natMapString ? JSON.parse(natMapString) : undefined;

    logger.log('Đang khởi tạo Redis ở chế độ CLUSTER');
    return new Redis.Cluster(nodes, { natMap });
  }

  logger.log('Đang khởi tạo Redis ở chế độ STANDALONE');
  return new Redis({
    host: configService.get<string>('REDIS_HOST') || 'localhost',
    port: configService.get<number>('REDIS_PORT') || 6379,
    maxRetriesPerRequest: null,
  });
};

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        return getRedisConnection(configService);
      },
      inject: [ConfigService],
    },
    RedisCacheService,
  ],
  exports: ['REDIS_CLIENT', RedisCacheService],
})
export class RedisModule {}