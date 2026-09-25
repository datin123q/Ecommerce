import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ExceptionResponse {
  message?: string | string[];
  errorCode?: string;
}

function isExceptionResponse(value: unknown): value is ExceptionResponse {
  return typeof value === 'object' && value !== null;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();

    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = exception instanceof HttpException
      ? exception.getResponse()
      : null;

    let message = 'Lỗi hệ thống nội bộ, vui lòng thử lại sau!';

    if (isExceptionResponse(exceptionResponse)) {
      const msg = exceptionResponse.message;

      if (msg !== undefined) {
        message = Array.isArray(msg)
          ? msg.join(', ')
          : msg;
      }
    } else if (exception instanceof Error) {
      if (status !== HttpStatus.INTERNAL_SERVER_ERROR) {
        message = exception.message;
      }
    }

    const errorCode =
      isExceptionResponse(exceptionResponse) &&
      exceptionResponse.errorCode
        ? exceptionResponse.errorCode
        : `ERR_${status}`;

    this.logger.error(
      `[${request.method}] ${request.url} - Status: ${status} - Message: ${message}`,
      exception instanceof Error
        ? exception.stack
        : 'Unknown Error',
    );

    response.status(status).json({
      success: false,
      errorCode,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}