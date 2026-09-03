import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
const request = require('supertest');
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma.service';
import { DbHelper } from './helpers/test-helpers';
import { TransformInterceptor } from 'src/common/interceptors/tranform.interceptor';
import {Glob}

describe('Order Flow & Validation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dbHelper: DbHelper;

  let accessToken: string;
  let variantId: string;
  const testUser = {
    email: 'e2e_tester_full@example.com',
    password: 'Password123!',
    fullName: 'E2E Full Tester',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new GlobalExceptionFilter());
    
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    dbHelper = new DbHelper(prisma);

    await dbHelper.clearDatabase(testUser.email);
    const store = await dbHelper.seedStorefront();
    variantId = store.variantId;
  });

  afterAll(async () => {
    await app.close();
  });

  it('Bước 1: Đăng ký tài khoản mới', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send(testUser)
      .expect(201); 
    
    // Đã thay đổi: response.body -> response.body.data
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('id');
  });

  it('Bước 2: Đăng nhập', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testUser.email, password: testUser.password })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('accessToken');
    accessToken = response.body.data.accessToken; // Lấy từ .data
  });

  it('Bước 3: Thêm sản phẩm vào giỏ hàng', async () => {
    await request(app.getHttpServer())
      .post('/carts/add')
      .set('Authorization', `Bearer ${accessToken}`) 
      .send({ variantId, quantity: 1 })
      .expect(201);
  });

  it('Bước 4: Tiến hành tạo đơn hàng (Checkout)', async () => {
    const response = await request(app.getHttpServer())
      .post('/orders/checkout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('id');
    expect(response.body.data.totalAmount).toBe(150000); // Check trong .data
  });
});