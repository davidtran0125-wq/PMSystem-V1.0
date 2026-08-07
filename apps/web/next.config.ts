import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Gom đúng những file cần chạy vào .next/standalone, để ảnh Docker không
  // phải mang theo cả node_modules.
  output: 'standalone',

  // Có hai package-lock.json (gốc repo và apps/web) nên Next đoán nhầm thư mục
  // gốc là gốc repo. Chỉ đích danh để bản build standalone gom đúng file.
  outputFileTracingRoot: path.join(__dirname),

  // Gói icon xuất hàng nghìn biểu tượng; chỉ nạp đúng cái được dùng thay vì cả gói.
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
