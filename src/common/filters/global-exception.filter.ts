import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch() // Để trống @Catch() nghĩa là bắt TẤT CẢ mọi loại lỗi
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    // 1. Phân loại lỗi
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR; // Lỗi 500 (Sập server)

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Lỗi hệ thống nội bộ, vui lòng thử lại sau!';

    // 2. Ghi Log chi tiết cho Backend đọc
    this.logger.error(
      `[${request.method}] ${request.url} - Status: ${status}`,
      exception instanceof Error ? exception.stack : 'Unknown Error',
    );

    // 3. Format chuẩn JSON trả về cho Frontend
    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      // Rút trích message sao cho gọn gàng nhất
      message: typeof message === 'object' && message['message'] 
        ? message['message'] 
        : message,
    });
  }
}