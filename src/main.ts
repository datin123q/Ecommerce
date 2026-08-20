import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {

  const app = await NestFactory.create(AppModule, { rawBody: true });
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api/v1');

  // 3. Kích hoạt Validation Pipe toàn cục (bắt buộc để DTO hoạt động)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Tự động loại bỏ các field thừa không được khai báo trong DTO
      forbidNonWhitelisted: true, // Báo lỗi 400 nếu client cố tình gửi trường không hợp lệ
      transform: true, // Tự động convert kiểu dữ liệu (vd: chuỗi số sang number)
    }),
  );

  // 4. Cấu hình Swagger OpenAPI UI
  const config = new DocumentBuilder()
    .setTitle('EcommerceCore API')
    .setDescription('')
    .setVersion('')
    .addBearerAuth() 
    .build();
    
  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      persistAuthorization: true, 
    },
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  logger.log(`Server is running at: http://localhost:${port}/api/v1`);
  logger.log(`Swagger UI is available at: http://localhost:${port}/api`);
}
bootstrap();