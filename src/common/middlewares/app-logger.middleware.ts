import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { asyncLocalStorage } from '../Logger/async-storage'; 

@Injectable()
export class AppLoggerMiddleware implements NestMiddleware {
  private logger = new Logger('HTTP');

  use(request: Request, response: Response, next: NextFunction): void {
    const { method, originalUrl } = request;
    
    const requestId = (request.headers['x-request-id'] as string) || uuidv4();
    response.setHeader('x-request-id', requestId);

    const startTime = Date.now();

    asyncLocalStorage.run({ requestId }, () => {
      
      this.logger.log(`[REQ] ${method} ${originalUrl}`);

      response.on('finish', () => {
        const { statusCode } = response;
        const duration = Date.now() - startTime;
        
        if (statusCode >= 400) {
          this.logger.error(`[RES] ${method} ${originalUrl} - ${statusCode} - ${duration}ms`);
        } else {
          this.logger.log(`[RES] ${method} ${originalUrl} - ${statusCode} - ${duration}ms`);
        }
      });

      next();
    });
  }
}
