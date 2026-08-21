import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { JwtAuthGuard } from './../src/common/guards/jwt-auth.guard';

describe('Notifications API (e2e)', () => {
  let app: INestApplication;

  // 1. Tạo "Database giả" để bảo vệ Database thật
  const mockPrismaService = {
    notification: {
      findMany: jest.fn().mockResolvedValue([
        { id: '1', content: 'Đơn hàng 123 đã xác nhận', isRead: false }
      ]),
    },
  };

  // Chạy 1 lần duy nhất trước khi bắt đầu test
  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule], // Nạp nguyên con server
    })
      .overrideProvider(PrismaService) // Đánh tráo Prisma thật
      .useValue(mockPrismaService)     // Bằng Prisma giả

      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          // Lấy request ra
          const req = context.switchToHttp().getRequest();
          // Nhét 1 cục User ảo vào để đánh lừa Controller (Phục vụ cho @CurrentUser)
          req.user = { id: 'user-123', email: 'test@gmail.com', role: 'USER' }; 
          return true; // Cho phép đi qua rào!
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    
    // 2. BẮT BUỘC: Phải tái tạo lại các cấu hình giống hệt main.ts
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    
    await app.init();
  });

  afterAll(async () => {
    await app.close(); // Test xong thì tắt server
  });

  // BẮT ĐẦU TEST CÁC ENDPOINT
  
  describe('GET /api/v1/notifications', () => {
    it('phải trả về status 200 và danh sách thông báo', () => {
      // Dùng Supertest đóng giả làm trình duyệt/Postman
      return request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', 'Bearer token_gia_ne') 
        .expect(200) // Khẳng định API không bị sập (trả về HTTP 200)
        .expect((res) => {
          // Khẳng định Body trả về đúng chuẩn JSON
          expect(res.body).toBeInstanceOf(Array);
          expect(res.body[0].content).toEqual('Đơn hàng 123 đã xác nhận');
        });
    });

    it('phải trả về lỗi 404 nếu gọi sai URL', () => {
      return request(app.getHttpServer())
        .get('/api/v1/notifications-sai-link')
        .expect(404);
    });
  });
});