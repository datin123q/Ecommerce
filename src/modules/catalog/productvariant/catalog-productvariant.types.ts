import { CatalogProduct, CatalogVariant } from '../product/catalog-product.types';

export type LookupCatalogVariant = Omit<CatalogVariant, 'product'> & {
  product: Pick<CatalogProduct, 'id' | 'name' | 'price' | 'categoryId'>;
};

export interface LookupVariantsResponse {
  data: LookupCatalogVariant[];
  notFoundIds: string[];
}
