import { 
  Injectable, 
  NestInterceptor, 
  ExecutionContext, 
  CallHandler, 
  ConflictException, 
  Inject 
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Observable, of, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    // Inject Redis Cache Manager thay vì Prisma
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    
    // Đọc Key từ Header (Frontend sinh ra và gửi lên)
    const idempotencyKey = request.headers['x-idempotency-key'];

    // Nếu API không yêu cầu Idempotency (không gửi key), cho qua bình thường
    if (!idempotencyKey) {
      return next.handle();
    }

    // Tiền tố để tránh trùng lặp với các cache khác trong Redis
    const cacheKey = `idempotency:${idempotencyKey}`;

    // 1. KIỂM TRA TRẠNG THÁI TRONG REDIS (Tốc độ < 1ms)
    const existingRecord: any = await this.cacheManager.get(cacheKey);

    if (existingRecord) {
      if (existingRecord.status === 'COMPLETED') {
        // Giao dịch đã xong: Trả luôn kết quả cũ, chặn không cho chạy vào Service
        return of(existingRecord.response);
      }
      
      if (existingRecord.status === 'PROCESSING') {
        // Giao dịch đang chạy: Chặn đứng hành vi bấm đúp
        throw new ConflictException('Giao dịch đang được xử lý, xin vui lòng đợi!');
      }
    }

    // ==========================================
    // 2. NẾU LÀ REQUEST MỚI -> KHÓA LẠI (Lock)
    // ==========================================
    // Lưu trạng thái PROCESSING với thời gian sống (TTL) là 24 giờ (86,400,000 ms)
    await this.cacheManager.set(cacheKey, { status: 'PROCESSING' }, 86400000);

    // ==========================================
    // 3. XỬ LÝ KẾT QUẢ TỪ CONTROLLER / SERVICE
    // ==========================================
    return next.handle().pipe(
      
      // TRƯỜNG HỢP A: THÀNH CÔNG (Hàm tap sẽ chạy)
      tap(async (response) => {
        // Cập nhật trạng thái thành COMPLETED và nhét kết quả vào để lưu
        await this.cacheManager.set(
          cacheKey, 
          { status: 'COMPLETED', response: response }, 
          86400000 // Vẫn giữ TTL 24h, sau 24h Redis tự động xóa rác
        );
      }),

      // TRƯỜNG HỢP B: LỖI (Hàm catchError sẽ chạy)
      catchError(async (error) => {
        // RẤT QUAN TRỌNG: Nếu code lỗi (hết tiền, sập mạng...), phải XÓA KEY đi
        // để khách hàng có thể bấm nút thử thanh toán lại.
        await this.cacheManager.del(cacheKey);
        
        // Ném lỗi đi tiếp để Global Exception Filter xử lý (hiện 400, 500)
        throw error;
      })
      
    );
  }
}