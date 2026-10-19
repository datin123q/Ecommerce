import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RedisCacheService } from '../../redis/redisCache.service';
import { CatalogCategoryClientService } from '../catalog/category/catalog-category-client.service';
import {
  CatalogCategoryWithCount,
  CatalogCategoryWithProducts,
} from '../catalog/category/catalog-category.types';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

export type CategoryWithCount = CatalogCategoryWithCount;
export type CategoryWithProducts = CatalogCategoryWithProducts;

@Injectable()
export class CategoriesService {
  private readonly CACHE_KEY_ALL = 'categories_all';

  constructor(
    private readonly catalogClient: CatalogCategoryClientService,
    private readonly eventEmitter: EventEmitter2,
    private readonly cacheService: RedisCacheService,
  ) {}

  private getCategoryCacheKey(id: string): string {
    return `category_${id}_v`;
  }

  private async clearCategoryCaches(categoryId?: string, isDelete = false) {
    const keysToDelete = [this.CACHE_KEY_ALL];
    if (categoryId) keysToDelete.push(this.getCategoryCacheKey(categoryId));

    if (isDelete) {
      keysToDelete.push('products_key');
      await this.cacheService.delByPattern('products:page=*');
      await this.cacheService.delByPattern('product_*_v');
      await this.cacheService.delByPattern('variant_*_v');
    }

    await this.cacheService.del(...keysToDelete);
  }

  async create(dto: CreateCategoryDto, adminId: string) {
    const newCategory = await this.catalogClient.createCategory(dto);
    this.eventEmitter.emit('category.created', {
      id: adminId,
      action: 'CREATE',
      entity: 'Category',
      entityId: newCategory.id,
      oldValue: null,
      newValue: newCategory,
    });
    await this.clearCategoryCaches();
    return newCategory;
  }

  async findAll(): Promise<CategoryWithCount[]> {
    const cached = await this.cacheService.get<CategoryWithCount[]>(
      this.CACHE_KEY_ALL,
    );
    if (cached !== null) return cached;

    const categories = await this.catalogClient.getCategories();
    await this.cacheService.set(this.CACHE_KEY_ALL, categories);
    return categories;
  }

  async findOne(id: string): Promise<string> {
    const cacheKey = this.getCategoryCacheKey(id);
    const cached = await this.cacheService.getRaw(cacheKey);
    if (cached) return cached;

    const category = await this.catalogClient.getCategory(id);
    await this.cacheService.set(cacheKey, category);
    return JSON.stringify(category);
  }

  async update(id: string, dto: UpdateCategoryDto, adminId: string) {
    const oldCategory = await this.findOne(id);
    const newCategory = await this.catalogClient.updateCategory(id, dto);

    this.eventEmitter.emit('category.update', {
      id: adminId,
      action: 'UPDATE',
      entity: 'Category',
      entityId: id,
      oldValue: oldCategory,
      newValue: newCategory,
    });
    await this.clearCategoryCaches(id);
    return newCategory;
  }

  async remove(id: string, adminId: string) {
    const oldCategory = await this.findOne(id);
    const deletedCategory = await this.catalogClient.removeCategory(id);

    this.eventEmitter.emit('category.delete', {
      id: adminId,
      action: 'DELETE',
      entity: 'Category',
      entityId: id,
      oldValue: oldCategory,
      newValue: null,
    });
    await this.clearCategoryCaches(id, true);
    return deletedCategory;
  }
}
