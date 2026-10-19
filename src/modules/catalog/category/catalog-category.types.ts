import { CatalogProduct } from '../product/catalog-product.types';

export interface CatalogCategory {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CatalogCategoryWithCount extends CatalogCategory {
  _count: { products: number };
}

export interface CatalogCategoryWithProducts extends CatalogCategory {
  products: CatalogProduct[];
}
