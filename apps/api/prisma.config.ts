import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Cấu hình Prisma.
 *
 * Thay cho khối `prisma` trong `package.json` — khối đó đã bị đánh dấu ngừng
 * dùng và sẽ biến mất ở Prisma 7, kèm cảnh báo hiện ra mỗi lần chạy lệnh.
 *
 * Chuỗi kết nối lấy từ biến môi trường, không ghi thẳng vào file này: file này
 * nằm trong git, còn `DATABASE_URL` chứa mật khẩu database.
 *
 * `import 'dotenv/config'` ở dòng đầu là bắt buộc. Khi có file cấu hình, Prisma
 * CLI **không còn tự nạp `.env`** như trước, nên thiếu dòng này thì mọi lệnh
 * prisma ở máy đều dừng với "Missing required environment variable:
 * DATABASE_URL". Trên Railway thì biến do nền tảng cấp sẵn nên không lộ ra.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',

  migrations: {
    // Dự án chạy bằng ts-node. Tài liệu của Prisma lấy ví dụ bằng bun; dùng
    // nguyên ví dụ đó thì lệnh seed không chạy được ở đây.
    seed: 'ts-node --compiler-options {"module":"CommonJS"} prisma/seed.ts',
  },

  datasource: {
    url: env('DATABASE_URL'),
  },
});
