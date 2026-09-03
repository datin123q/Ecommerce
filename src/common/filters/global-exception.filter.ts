import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch() 
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // 1. Phân loại lỗi và Status Code
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : null;

    // 2. Trích xuất Message 
    let message = 'Lỗi hệ thống nội bộ, vui lòng thử lại sau!';
    if (exceptionResponse && typeof exceptionResponse === 'object' && 'message' in exceptionResponse) {
      const msg = (exceptionResponse as any).message;
      message = Array.isArray(msg) ? msg.join(', ') : msg;
    } else if (exception instanceof Error) {
      // Chỉ lấy message gốc nếu không phải lỗi 500 (tránh lộ thông tin nhạy cảm)
      if (status !== HttpStatus.INTERNAL_SERVER_ERROR) {
        message = exception.message;
      }
    }

    // 3. errorCode 
    const errorCode = 
      exceptionResponse && typeof exceptionResponse === 'object' && 'errorCode' in exceptionResponse
        ? (exceptionResponse as any).errorCode 
        : `ERR_${status}`;

    // 4. Ghi Log chi tiết 
    this.logger.error(
      `[${request.method}] ${request.url} - Status: ${status} - Message: ${message}`,
      exception instanceof Error ? exception.stack : 'Unknown Error',
    );

    // 5. Format chuẩn JSON (Error Contract) trả về cho Frontend
    response.status(status).json({
      success: false,         
      errorCode: errorCode,   
      message: message,       
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}