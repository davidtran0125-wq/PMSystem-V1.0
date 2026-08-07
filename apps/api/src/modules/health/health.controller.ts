import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../../common/decorators';

/**
 * Điểm kiểm tra sức khỏe cho nền tảng chạy container (Railway, Docker
 * healthcheck, load balancer).
 *
 * Phải công khai vì bộ kiểm tra không có token, và phải thật sự chạm tới
 * database: một tiến trình còn sống nhưng mất kết nối database thì vẫn hỏng
 * với người dùng, mà kiểm tra hời hợt lại báo là khỏe.
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Trạng thái ứng dụng và kết nối cơ sở dữ liệu' })
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      // Chi tiết lỗi đi vào log, không trả ra ngoài cho người gọi ẩn danh.
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'unreachable',
      });
    }

    return {
      status: 'ok',
      database: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
