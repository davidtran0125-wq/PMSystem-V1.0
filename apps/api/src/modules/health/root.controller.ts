import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common/decorators';

/**
 * Trả lời cho `/`.
 *
 * Mọi route của API đều nằm sau tiền tố `api`, nên trước đây mở địa chỉ gốc chỉ
 * nhận được `Cannot GET /` — người đang deploy dễ tưởng là hỏng. Trang này nói
 * rõ đây là service nào và đường dẫn kiểm tra sức khỏe nằm ở đâu.
 *
 * Nó cũng là cách nhanh nhất để biết một tên miền đang trỏ vào API hay vào web:
 * mở lên, nếu thấy JSON này thì đó là API.
 */
@ApiExcludeController()
@Controller()
export class RootController {
  constructor(private readonly config: ConfigService) {}

  @Public()
  @Get()
  index() {
    const prefix = this.config.get<string>('API_PREFIX', 'api');
    return {
      service: 'pms-api',
      message:
        'API của Hệ thống quản lý mua hàng. Giao diện người dùng nằm ở tên miền khác.',
      health: `/${prefix}/health`,
    };
  }
}
