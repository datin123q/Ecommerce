import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CatalogHttpClient } from '../shared/catalog-http.client';
import { LookupVariantsResponse } from './catalog-productvariant.types';

@Injectable()
export class CatalogProductVariantClientService {
  constructor(
    private readonly http: CatalogHttpClient,
    private readonly config: ConfigService,
  ) {}

  lookupVariants(variantIds: string[]): Promise<LookupVariantsResponse> {
    const token = this.config.get<string>('CATALOG_SERVICE_TOKEN');
    if (!token) {
      throw new ServiceUnavailableException(
        'Commerce chưa cấu hình service token của Catalog service',
      );
    }
    return this.http.request(
      '/internal/catalog/variants/lookup',
      'POST',
      { variantIds },
      { 'x-service-token': token },
    );
  }
}
