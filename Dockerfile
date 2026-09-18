# 1. Chọn môi trường Node.js
FROM node:18-alpine

WORKDIR /app

# 2. Cài đặt thư viện
COPY package*.json ./
RUN npm install

# 3. Copy toàn bộ code
COPY . .

# 4. Sinh mã Prisma (Không cần file .env giả nữa vì schema.prisma của bạn đã có URL)
RUN npx prisma generate

# 5. Build code
RUN npm run build

# 6. Khởi chạy
CMD ["npm", "run", "start:prod"]