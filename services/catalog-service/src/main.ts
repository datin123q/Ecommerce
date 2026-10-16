import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Catalog Service API')
    .setDescription('API Category, Product, Variant và lookup nội bộ')
    .setVersion('1.0')
    .build();
  // Service đang có NestJS cài riêng; cast tránh hai bản type NestJS bị coi là khác nhau.
  const document = SwaggerModule.createDocument(app as never, swaggerConfig);
  SwaggerModule.setup('api', app as never, document);

  const port = Number(process.env.PORT || 3006);
  await app.listen(port, '0.0.0.0');
  console.log(`Catalog service: http://localhost:${port}/api/v1`);
  console.log(`Swagger UI: http://localhost:${port}/api`);
}
void bootstrap();
