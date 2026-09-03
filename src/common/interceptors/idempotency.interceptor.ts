import { 
  Injectable, 
  NestInterceptor, 
  ExecutionContext, 
  CallHandler, 
  ConflictException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { concatMap, catchError } from 'rxjs/operators';
import * as crypto from 'crypto';
import Redis from 'ioredis';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject('REDIS_CLIENT') private readonly redisClient: Redis
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
    const payloadHash = crypto.createHash('sha256').update(payloadString).digest('hex');
    const requestMethod = request.method;
    const requestPath = request.url;

    const recordMetadata = {
      status: 'PROCESSING',
      payloadHash,
      requestMethod,
      requestPath,
    };
    const lockResult = await this.redisClient.set(
      cacheKey, 
      JSON.stringify(recordMetadata), 
      'PX', 
      86400000, // 24 giờ
      'NX'
    );

    const isKeyNewlyCreated = lockResult === 'OK';

    if (!isKeyNewlyCreated) {
      const existingRaw = await this.redisClient.get(cacheKey);
      
      if (!existingRaw) {
        throw new ConflictException('Giao dịch đang được xử lý, vui lòng thử lại.');
      }

      const existingRecord = JSON.parse(existingRaw);

      if (
        existingRecord.payloadHash !== payloadHash ||
        existingRecord.requestMethod !== requestMethod ||
        existingRecord.requestPath !== requestPath
      ) {
        throw new BadRequestException('Idempotency key này đã được sử dụng cho một payload khác.');
      }

      if (existingRecord.status === 'COMPLETED') {
        return of(existingRecord.response);
      }
      
      if (existingRecord.status === 'PROCESSING') {
        throw new ConflictException('Giao dịch đang được xử lý, xin vui lòng đợi!');
      }
    }
    return next.handle().pipe(
      concatMap(async (response) => {
        const completedRecord = { ...recordMetadata, status: 'COMPLETED', response };
      
        await this.redisClient.set(
          cacheKey, 
          JSON.stringify(completedRecord), 
          'PX', 
          86400000
        ); 
        
        return response; 
      }),
      
      catchError(async (error) => {
        await this.redisClient.del(cacheKey);
        throw error;
      })
    );
  }
}