import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.use(helmet());
  app.enableCors({
    origin: config
      .get<string>('CORS_ORIGIN', 'http://localhost:3000')
      .split(','),
    credentials: true,
  });

  // `/` được miễn tiền tố để RootController trả lời được ở địa chỉ gốc.
  app.setGlobalPrefix(config.get<string>('API_PREFIX', 'api'), {
    exclude: [{ path: '/', method: RequestMethod.GET }],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger phơi bày toàn bộ hình dạng API; chỉ bật ngoài môi trường production.
  const swaggerEnabled =
    config.get<string>('NODE_ENV', 'development') !== 'production' ||
    config.get<string>('SWAGGER_ENABLED') === 'true';

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Procurement Management System API')
    .setDescription(
      'REST API for purchase requests, RFQ, quotations, suppliers, contracts and certificates.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  if (swaggerEnabled) {
    SwaggerModule.setup(
      'docs',
      app,
      SwaggerModule.createDocument(app, swaggerConfig),
    );
  }

  // Cho phép Nest chạy hook onModuleDestroy khi nhận SIGTERM, tránh cắt ngang
  // request đang xử lý lúc deploy.
  app.enableShutdownHooks();

  // Railway, Render, Fly và phần lớn nền tảng container tự cấp cổng qua biến
  // PORT và không cho chọn. Ưu tiên nó, rồi mới tới cấu hình của dự án.
  const port =
    config.get<number>('PORT') ?? config.get<number>('API_PORT', 4000);
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
  if (swaggerEnabled) {
    console.log(`Swagger docs on http://localhost:${port}/docs`);
  }
}

void bootstrap();
