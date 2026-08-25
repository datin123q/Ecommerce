import { 
  Injectable, 
  NestInterceptor, 
  ExecutionContext, 
  CallHandler, 
  ConflictException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Observable } from 'rxjs';
import { concatMap, catchError } from 'rxjs/operators';
import * as argon2 from 'argon2';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const idempotencyKey = request.headers['x-idempotency-key'];

    if (!idempotencyKey) {
      return next.handle();
    }

    const userId = request.user?.id; 
    if (!userId) {
      throw new BadRequestException('Yêu cầu đăng nhập');
    }

    const cacheKey = `idempotency:${userId}:${idempotencyKey}`;
    const payloadString = JSON.stringify(request.body || {});
    const payloadHash = await argon2.hash(payloadString);
    const requestMethod = request.method;
    const requestPath = request.url;

    const recordMetadata = {
      status: 'PROCESSING',
      payloadHash,
      requestMethod,
      requestPath,
    };
    const redisClient = (this.cacheManager.stores as any).client;
    const isLocked = await redisClient.set(cacheKey, JSON.stringify(recordMetadata), {
      NX: true,
      PX: 86400000 
    });

    // KEY ĐÃ TỒN TẠI
    if (!isLocked) {
      const existingRaw = await this.cacheManager.get<string>(cacheKey)
      const existingRecord = JSON.parse(existingRaw as string);
      // Kiểm tra Fingerprint 
      if (
        existingRecord.payloadHash !== payloadHash ||
        existingRecord.requestMethod !== requestMethod ||
        existingRecord.requestPath !== requestPath
      ) {
        throw new BadRequestException('Idempotency key này đã được sử dụng cho một payload khác.');
      }

      if (existingRecord.status === 'COMPLETED') {
        return existingRecord.response;
      }
      
      if (existingRecord.status === 'PROCESSING') {
        throw new ConflictException('Giao dịch đang được xử lý, xin vui lòng đợi!');
      }
    }

    return next.handle().pipe(
      concatMap(async (response) => {
        const completedRecord = { ...recordMetadata, status: 'COMPLETED', response };
        // lưu(bỏ nx)
        await this.cacheManager.set(cacheKey, JSON.stringify(completedRecord), 86400000);
        return response; 
      }),
      
      catchError(async (error) => {
        await this.cacheManager.del(cacheKey);
        throw error;
      })
    );
  }
}