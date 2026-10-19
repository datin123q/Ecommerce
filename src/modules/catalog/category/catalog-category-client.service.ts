import { Injectable } from '@nestjs/common';
import { CreateCategoryDto } from '../../categories/dto/create-category.dto';
import { UpdateCategoryDto } from '../../categories/dto/update-category.dto';
import { CatalogHttpClient } from '../shared/catalog-http.client';
import { CatalogCategory, CatalogCategoryWithCount, CatalogCategoryWithProducts } from './catalog-category.types';

@Injectable()
export class CatalogCategoryClientService {
  constructor(private readonly http: CatalogHttpClient) {}

  getCategories(): Promise<CatalogCategoryWithCount[]> {
    return this.http.request('/categories');
  }

  getCategory(id: string): Promise<CatalogCategoryWithProducts> {
    return this.http.request(`/categories/${encodeURIComponent(id)}`);
  }

  createCategory(dto: CreateCategoryDto): Promise<CatalogCategory> {
    return this.http.request('/categories', 'POST', dto);
  }

  updateCategory(id: string, dto: UpdateCategoryDto): Promise<CatalogCategory> {
    return this.http.request(`/categories/${encodeURIComponent(id)}`, 'PATCH', dto);
  }

  removeCategory(id: string): Promise<CatalogCategory> {
    return this.http.request(`/categories/${encodeURIComponent(id)}`, 'DELETE');
  }
}
