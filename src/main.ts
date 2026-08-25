import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { WinstonModule, utilities as nestWinstonModuleUtilities } from 'nest-winston'; 
import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file'; 
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  // 1. CẤU HÌNH WINSTON LOGGER TRƯỚC
  const winstonLogger = WinstonModule.createLogger({
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          nestWinstonModuleUtilities.format.nestLike('E-Commerce', {
            colors: true,
            prettyPrint: true,
          }),
        ),
      }),
      new DailyRotateFile({
        filename: 'logs/error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        ),
      }),
    ],
  });

  // 2. BƠM WINSTON VÀO APP (Vẫn giữ nguyên rawBody: true của anh)
  const app = await NestFactory.create(AppModule, { 
    rawBody: true,
    logger: winstonLogger, 
  });
  
  app.enableCors();
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api/v1');

  // 3. KÍCH HOẠT GLOBAL EXCEPTION FILTER TẠI ĐÂY
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Kích hoạt Validation Pipe toàn cục (bắt buộc để DTO hoạt động)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Tự động loại bỏ các field thừa không được khai báo trong DTO
      forbidNonWhitelisted: true, // Báo lỗi 400 nếu client cố tình gửi trường không hợp lệ
      transform: true, // Tự động convert kiểu dữ liệu (vd: chuỗi số sang number)
    }),
  );

  // Cấu hình Swagger OpenAPI UI
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