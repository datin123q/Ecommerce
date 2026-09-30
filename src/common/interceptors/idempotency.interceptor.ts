import {
  BadRequestException,
  ConflictException,
  ExecutionContext,
  CallHandler,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { Observable, of } from 'rxjs';
import { catchError, concatMap } from 'rxjs/operators';

type IdempotencyStatus = 'PROCESSING' | 'COMPLETED';

interface IdempotencyRecord {
  status: IdempotencyStatus;
  payloadHash: string;
  requestMethod: string;
  requestPath: string;
  response?: unknown;
}

type AuthenticatedRequest = Request & {
  user?: { id?: string };
};

function isIdempotencyRecord(value: unknown): value is IdempotencyRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    (record.status === 'PROCESSING' || record.status === 'COMPLETED') &&
    typeof record.payloadHash === 'string' &&
    typeof record.requestMethod === 'string' &&
    typeof record.requestPath === 'string'
  );
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject('REDIS_CLIENT') private readonly redisClient: Redis) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers['x-idempotency-key'];
    const idempotencyKey = Array.isArray(header) ? header[0] : header;

    if (!idempotencyKey) return next.handle();

    const userId = request.user?.id;
    if (!userId) throw new BadRequestException('Yêu cầu đăng nhập');

    const cacheKey = `idempotency:${userId}:${idempotencyKey}`;
    const payloadHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(request.body ?? {}))
      .digest('hex');
    const recordMetadata: IdempotencyRecord = {
      status: 'PROCESSING',
      payloadHash,
      requestMethod: request.method,
      requestPath: request.url,
    };

    const lockResult = await this.redisClient.set(
      cacheKey,
      JSON.stringify(recordMetadata),
      'PX',
      86_400_000,
      'NX',
    );

    if (lockResult !== 'OK') {
      const existingRaw = await this.redisClient.get(cacheKey);
      if (!existingRaw) {
        throw new ConflictException(
          'Giao dịch đang được xử lý, vui lòng thử lại.',
        );
      }

      let existingRecord: unknown;
      try {
        existingRecord = JSON.parse(existingRaw);
      } catch {
        throw new ConflictException('Dữ liệu idempotency không hợp lệ.');
      }

      if (!isIdempotencyRecord(existingRecord)) {
        throw new ConflictException('Dữ liệu idempotency không hợp lệ.');
      }
      if (
        existingRecord.payloadHash !== payloadHash ||
        existingRecord.requestMethod !== request.method ||
        existingRecord.requestPath !== request.url
      ) {
        throw new BadRequestException(
          'Idempotency key này đã được sử dụng cho một payload khác.',
        );
      }
      if (existingRecord.status === 'COMPLETED') {
        return of(existingRecord.response);
      }

      throw new ConflictException(
        'Giao dịch đang được xử lý, xin vui lòng đợi!',
      );
    }

    return next.handle().pipe(
      concatMap(async (response: unknown) => {
        const completedRecord: IdempotencyRecord = {
          ...recordMetadata,
          status: 'COMPLETED',
          response,
        };
        await this.redisClient.set(
          cacheKey,
          JSON.stringify(completedRecord),
          'PX',
          86_400_000,
        );
        return response;
      }),
      catchError(async (error: unknown) => {
        await this.redisClient.del(cacheKey);
        throw error;
      }),
    );
  }
}
