import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CatalogVariant {
  id: string;
  sku: string;
  name: string;
  variant: string;
  productId: string;
  product: {
    id: string;
    name: string;
    price: number;
    categoryId: string;
  };
}

interface LookupVariantsResponse {
  data: CatalogVariant[];
  notFoundIds: string[];
}

@Injectable()
export class CatalogClientService {
  constructor(private readonly config: ConfigService) {}

  async lookupVariants(variantIds: string[]): Promise<LookupVariantsResponse> {
    const baseUrl = this.config.get<string>('CATALOG_SERVICE_URL');
    const token = this.config.get<string>('CATALOG_SERVICE_TOKEN');

    if (!baseUrl || !token) {
      throw new ServiceUnavailableException(
        'Commerce chưa cấu hình URL hoặc token của Catalog service',
      );
    }

    let response: Response;

    try {
      response = await fetch(
        `${baseUrl}/api/v1/internal/catalog/variants/lookup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-service-token': token,
          },
          body: JSON.stringify({ variantIds }),
          signal: AbortSignal.timeout(3000),
        },
      );
    } catch {
      throw new ServiceUnavailableException(
        'Không kết nối được tới Catalog service',
      );
    }

    if (!response.ok) {
      throw new BadGatewayException(
        `Catalog service trả về HTTP ${response.status}`,
      );
    }

    return (await response.json()) as LookupVariantsResponse;
  }
}
