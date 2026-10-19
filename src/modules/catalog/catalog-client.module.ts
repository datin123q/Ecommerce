import { Module } from '@nestjs/common';
import { CatalogCategoryClientService } from './category/catalog-category-client.service';
import { CatalogProductClientService } from './product/catalog-product-client.service';
import { CatalogProductVariantClientService } from './productvariant/catalog-productvariant-client.service';
import { CatalogHttpClient } from './shared/catalog-http.client';

@Module({
  providers: [
    CatalogHttpClient,
    CatalogCategoryClientService,
    CatalogProductClientService,
    CatalogProductVariantClientService,
  ],
  exports: [
    CatalogCategoryClientService,
    CatalogProductClientService,
    CatalogProductVariantClientService,
  ],
})
export class CatalogClientModule {}
