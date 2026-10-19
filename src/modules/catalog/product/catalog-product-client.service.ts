import { Injectable } from '@nestjs/common';
import { CreateProductDto, CreateProductVariantDto } from '../../products/dto/create-product.dto';
import { GetProductsDto } from '../../products/dto/get-products.dto';
import { UpdateProductDto } from '../../products/dto/update-product.dto';
import { UpdateProductVariantDto } from '../../products/dto/update-product-variant.dto';
import { CatalogHttpClient } from '../shared/catalog-http.client';
import { CatalogProduct, CatalogProductsPage, CatalogVariant } from './catalog-product.types';

@Injectable()
export class CatalogProductClientService {
  constructor(private readonly http: CatalogHttpClient) {}

  getProducts(query: GetProductsDto): Promise<CatalogProductsPage> {
    const params = new URLSearchParams({
      page: String(query.page ?? 1),
      limit: String(query.limit ?? 5),
      sortBy: query.sortBy ?? 'name',
      sortOrder: query.sortOrder ?? 'asc',
    });
    return this.http.request(`/products?${params.toString()}`);
  }

  getLatestProducts(limit: number): Promise<CatalogProductsPage> {
    const params = new URLSearchParams({
      page: '1', limit: String(limit), sortBy: 'createdAt', sortOrder: 'desc',
    });
    return this.http.request(`/products?${params.toString()}`);
  }

  getProduct(id: string): Promise<CatalogProduct> {
    return this.http.request(`/products/${encodeURIComponent(id)}`);
  }

  getActiveProductCount(): Promise<number> {
    return this.http.request('/products/count');
  }

  createProduct(dto: CreateProductDto): Promise<CatalogProduct> {
    return this.http.request('/products', 'POST', dto);
  }

  updateProduct(id: string, dto: UpdateProductDto): Promise<CatalogProduct> {
    return this.http.request(`/products/${encodeURIComponent(id)}`, 'PATCH', dto);
  }

  removeProduct(id: string): Promise<CatalogProduct> {
    return this.http.request(`/products/${encodeURIComponent(id)}`, 'DELETE');
  }

  addVariant(productId: string, dto: CreateProductVariantDto): Promise<CatalogVariant> {
    return this.http.request(`/products/${encodeURIComponent(productId)}/variants`, 'POST', dto);
  }

  getVariant(id: string): Promise<CatalogVariant> {
    return this.http.request(`/products/variants/${encodeURIComponent(id)}`);
  }

  updateVariant(id: string, dto: UpdateProductVariantDto): Promise<CatalogVariant> {
    return this.http.request(`/products/variants/${encodeURIComponent(id)}`, 'PATCH', dto);
  }

  removeVariant(id: string): Promise<CatalogVariant> {
    return this.http.request(`/products/variants/${encodeURIComponent(id)}`, 'DELETE');
  }
}
