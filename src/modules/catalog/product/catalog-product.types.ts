export interface CatalogProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  categoryId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  category?: Record<string, unknown>;
  variants?: CatalogVariantSummary[];
}

export interface CatalogProductsPage {
  data: CatalogProduct[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface CatalogVariant {
  id: string;
  sku: string;
  name: string;
  variant: string;
  productId: string;
  deletedAt: string | null;
  product: CatalogProduct;
}

export type CatalogVariantSummary = Omit<CatalogVariant, 'product'>;
