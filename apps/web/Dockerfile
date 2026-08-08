# Web — Next.js 15, bản standalone
#
# NEXT_PUBLIC_* được Next nhúng thẳng vào mã JavaScript gửi xuống trình duyệt,
# nên phải có mặt lúc BUILD. Đặt lúc chạy là không có tác dụng — đây là lỗi hay
# gặp nhất khi đưa Next lên Docker.

FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Dừng ngay thay vì build ra một bản web gọi nhầm localhost:4000. Sai chỗ này
# không lộ ra lúc build mà lúc người dùng bấm đăng nhập và không có gì xảy ra.
RUN test -n "$NEXT_PUBLIC_API_URL" || { \
      echo ""; \
      echo "  Thiếu NEXT_PUBLIC_API_URL."; \
      echo ""; \
      echo "  Next nhúng biến này thẳng vào mã JavaScript gửi xuống trình"; \
      echo "  duyệt, ngay lúc build — nên nó phải có mặt ở đây, đặt lúc chạy"; \
      echo "  không có tác dụng."; \
      echo ""; \
      echo "  Trên Railway: mở service WEB (không phải api) →  tab Variables"; \
      echo "  →  thêm:"; \
      echo ""; \
      echo "      NEXT_PUBLIC_API_URL=https://api.pmsystem.io.vn/api"; \
      echo ""; \
      echo "  Nếu tên miền api chưa trỏ DNS xong, dùng tạm địa chỉ Railway của"; \
      echo "  service api: https://<api>.up.railway.app/api"; \
      echo ""; \
      echo "  Rồi bấm Redeploy — Restart không đủ, phải build lại ảnh."; \
      echo ""; \
      echo "  Build tại máy:"; \
      echo "      docker build --build-arg NEXT_PUBLIC_API_URL=... -t pms-web ."; \
      echo ""; \
      exit 1; \
    }

RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD curl -fsS "http://localhost:${PORT:-3000}/login" -o /dev/null || exit 1

CMD ["node", "server.js"]
