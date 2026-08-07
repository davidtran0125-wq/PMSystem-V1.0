# API — NestJS + Prisma
#
# Prisma cần OpenSSL cả lúc sinh client lẫn lúc chạy, nên bản slim phải cài thêm.
# Ảnh cuối chỉ mang dist, node_modules production, schema Prisma và thư mục font.

FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN npm run build

FROM node:22-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
# Font tiếng Việt cho PDF đơn hàng. Thiếu thư mục này thì PDF không xuất được,
# và lỗi chỉ lộ ra lúc người dùng bấm tải — nên nó nằm trong ảnh, không phải volume.
COPY assets ./assets
COPY package*.json ./

# File đính kèm khi STORAGE_DRIVER=local. Gắn volume vào đúng đường dẫn này.
RUN mkdir -p /app/storage

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD curl -fsS "http://localhost:${PORT:-4000}/api/health" -o /dev/null || exit 1

# migrate deploy chỉ áp dụng migration đã có sẵn, không bao giờ tự sinh hay xoá.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
