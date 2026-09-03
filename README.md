# 🛒 Commerce Core API

Một hệ thống Backend API mạnh mẽ dành cho nền tảng thương mại điện tử, được xây dựng dựa trên kiến trúc Micro-services linh hoạt.

## 🚀 Công nghệ sử dụng
* **Framework:** NestJS (Node.js)
* **Database:** PostgreSQL với ORM Prisma
* **Cache & Queue:** Redis + BullMQ
* **Thanh toán:** Stripe Integration

---

## ⚙️ Hướng dẫn vận hành môi trường Local

1. **Chuẩn bị cấu hình:**
   * Clone dự án về máy.
   * Copy file mẫu `cp .env.example .env` và điền các secret keys thực tế.

2. **Khởi chạy hạ tầng (Database & Cache):**
   ```bash
   docker-compose up -d postgres redis
   ```

3. **Cài đặt & Đồng bộ Database:**
   ```bash
   npm install
   npx prisma generate
   npx prisma migrate dev
   ```

4. **Khởi động ứng dụng:**
   ```bash
   npm run start:dev
   ```
5. ** Test Payment**
   ```bash
   stripe listen --forward-to localhost:3000/api/v1/payments/webhook
   ```
---

## 🐳 Triển khai Production (Docker)
Để chạy toàn bộ hệ sinh thái (App + Postgres + Redis) trên server thực tế:
```bash
docker-compose up -d --build
```
