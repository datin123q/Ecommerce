import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class ServiceTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const configuredToken = process.env.CATALOG_SERVICE_TOKEN;
    if (!configuredToken) {
      throw new InternalServerErrorException('Catalog service chưa cấu hình service token');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const suppliedToken = request.header('x-service-token');
    if (suppliedToken !== configuredToken) {
      throw new UnauthorizedException('Service token không hợp lệ');
    }
    return true;
  }
}
