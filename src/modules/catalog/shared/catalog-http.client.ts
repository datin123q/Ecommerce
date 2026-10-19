import {
  BadGatewayException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CatalogHttpClient {
  constructor(private readonly config: ConfigService) {}

  async request<T>(
    path: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const baseUrl = this.config.get<string>('CATALOG_SERVICE_URL');
    if (!baseUrl) {
      throw new ServiceUnavailableException(
        'Commerce chưa cấu hình URL của Catalog service',
      );
    }

    const headers = new Headers(extraHeaders);
    if (body !== undefined) headers.set('Content-Type', 'application/json');

    let response: Response;
    try {
      response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Không kết nối được tới Catalog service',
      );
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const message =
        payload && typeof payload === 'object' && 'message' in payload
          ? (payload as { message: string | string[] }).message
          : `Catalog service trả về HTTP ${response.status}`;

      if (response.status === 404) throw new NotFoundException(message);
      if (response.status === 409) throw new ConflictException(message);
      if (response.status >= 400 && response.status < 500) {
        throw new HttpException(message, response.status);
      }
      throw new BadGatewayException(message);
    }

    return (await response.json()) as T;
  }
}
