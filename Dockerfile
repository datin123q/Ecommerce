# 1. Base Image (Dùng bản Node.js 22 LTS)
FROM node:22-alpine

# Bổ sung thư viện hệ thống cần thiết cho Prisma trên Alpine
RUN apk add --no-cache openssl libc6-compat

# Đặt thư mục làm việc
WORKDIR /app

# 2. Cài đặt thư viện
COPY package*.json ./
RUN npm install

# 3. Copy toàn bộ mã nguồn
COPY . .

# 4. Sinh mã Prisma (Kèm DATABASE_URL giả vờ để không bị lỗi lúc build)
RUN DATABASE_URL="postgresql://johndoe:randompassword@localhost:5432/mydb?schema=public" npx prisma generate

RUN npm run build

# DEBUG
RUN ls -la /app
RUN ls -la /app/dist
RUN find /app/dist -maxdepth 3 -type f

EXPOSE 3000

CMD ["npm", "run", "start:prod"]