# --- STAGE 1: Build Môi trường Nháp ---
FROM node:20-alpine AS builder

WORKDIR /app
RUN apk add --no-cache openssl build-base python3

# Copy cả package.json và package-lock.json
COPY package*.json ./

# Cài đặt chính xác bằng Lockfile 
RUN npm ci

COPY . .
RUN npx prisma generate

RUN npm run build

# --- STAGE 2: Môi trường Chạy thật (Production) ---
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:prod"]