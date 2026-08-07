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
RUN test -n "$NEXT_PUBLIC_API_URL" \
    || (echo "Thiếu build arg NEXT_PUBLIC_API_URL" && exit 1)
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
