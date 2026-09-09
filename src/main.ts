import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import session from 'express-session';
import { WinstonModule, utilities as nestWinstonModuleUtilities } from 'nest-winston'; 
import * as winston from 'winston';
import helmet from 'helmet';
import DailyRotateFile from 'winston-daily-rotate-file'; 
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { TransformInterceptor } from './common/interceptors/tranform.interceptor';

async function bootstrap() {
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

  const app = await NestFactory.create(AppModule, { 
    rawBody: true,
    logger: winstonLogger, 
  });
  app.use(helmet());
  app.enableCors({
    origin: process.env.NODE_ENV === 'production' 
      ? ['https://my-domain.com', 'https://admin.my-domain.com'] 
      : ['http://localhost:3000'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, 
  });
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, 
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
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
  app.use(
    session({
      secret: 'twitter-session-secret', 
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 60000 }, 
    }),
  );
  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  logger.log(`Server is running at: http://localhost:${port}/api/v1`);
  logger.log(`Swagger UI is available at: http://localhost:${port}/api`);
}
bootstrap();