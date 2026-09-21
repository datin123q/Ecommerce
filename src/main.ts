import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// Session & Redis Imports
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import { Redis } from 'ioredis';

// Winston & Tools Imports
import { WinstonModule, utilities as nestWinstonModuleUtilities } from 'nest-winston'; 
import * as winston from 'winston';
import helmet from 'helmet';
import DailyRotateFile from 'winston-daily-rotate-file'; 
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { TransformInterceptor } from './common/interceptors/tranform.interceptor';
import { useContainer } from 'class-validator';

async function bootstrap() {

  const winstonLogger = WinstonModule.createLogger({
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          nestWinstonModuleUtilities.format.nestLike('CommerceCore', {
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

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { 
    rawBody: true,
    logger: winstonLogger, 
  });

  app.set('trust proxy', 1);

  app.use(helmet());
  app.enableCors({
    origin: ['http://localhost:5173'], 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, 
  });
  
  const redisHost = process.env.REDIS_URL || 'redis://localhost:6379';
  const redisClient = new Redis(redisHost);
  
  const redisStore = new RedisStore({
    client: redisClient,
    prefix: 'commerce-session:', 
  });

  app.use(
    session({
      store: redisStore,
      secret: process.env.SESSION_SECRET || 'twitter-session-secret', 
      resave: false,
      saveUninitialized: false,
      cookie: { 
        maxAge: 5 * 60 * 1000, 
        httpOnly: true,
        // secure: process.env.NODE_ENV === 'production', 
      }, 
    }),
  );

  useContainer(app.select(AppModule), {fallbackOnErrors: true});
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
    .setDescription('API Documentation for CommerceCore System')
    .setVersion('1.0')
    .addServer('/') 
    .addBearerAuth() 
    .build();
    
  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      persistAuthorization: true, 
    },
  });

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  
  logger.log(`Server is running internally on port: ${port}`);
  logger.log(`Swagger UI is available at: http://localhost/api`);
}
bootstrap();