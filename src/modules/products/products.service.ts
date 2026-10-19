import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RedisCacheService } from '../../redis/redisCache.service';
import { CatalogProductClientService } from '../catalog/product/catalog-product-client.service';
import {
  CatalogProduct,
  CatalogProductsPage,
  CatalogVariant,
} from '../catalog/product/catalog-product.types';
import { CreateProductDto, CreateProductVariantDto } from './dto/create-product.dto';
import { GetProductsDto } from './dto/get-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';

export type ProductWithRelations = CatalogProduct;
export type VariantWithProduct = CatalogVariant;

@Injectable()
export class ProductsService {
  constructor(
    private readonly catalogClient: CatalogProductClientService,
    private readonly eventEmitter: EventEmitter2,
    private readonly cacheService: RedisCacheService,
  ) {}

  getDashboardActiveProductCount(): Promise<number> {
    return this.catalogClient.getActiveProductCount();
  }

  private getProductCacheKey(id: string) { return `product_${id}_v`; }
  private getVariantCacheKey(id: string) { return `variant_${id}_v`; }
  private getCategoryCacheKey(id: string) { return `category_${id}_v`; }

  private getPaginatedCacheKey(query: GetProductsDto) {
    const { page = 1, limit = 1, sortBy = 'name', sortOrder = 'asc' } = query;
    return `products:page=${page}:limit=${limit}:sortBy=${sortBy}:sortOrder=${sortOrder}`;
  }

  private async invalidateProductCaches(
    productId?: string,
    categoryId?: string,
    variantId?: string,
  ) {
    const keysToDelete = ['products_key'];
    await this.cacheService.delByPattern('products:page=*');

    if (productId) keysToDelete.push(this.getProductCacheKey(productId));
    if (categoryId) keysToDelete.push(this.getCategoryCacheKey(categoryId));
    if (variantId) keysToDelete.push(this.getVariantCacheKey(variantId));
    await this.cacheService.del(...keysToDelete);
  }

  async create(dto: CreateProductDto, adminId: string) {
    const newProduct = await this.catalogClient.createProduct(dto);

    this.eventEmitter.emit('product.created', {
      id: adminId,
      action: 'CREATE',
      entity: 'Product',
      entityId: newProduct.id,
      oldValue: null,
      newValue: newProduct,
    });
    await this.invalidateProductCaches(newProduct.id, newProduct.categoryId);
    return newProduct;
  }

  async updateProduct(id: string, dto: UpdateProductDto, adminId: string) {
    const oldProduct = await this.catalogClient.getProduct(id);
    const newProduct = await this.catalogClient.updateProduct(id, dto);

    this.eventEmitter.emit('product.update', {
      id: adminId,
      action: 'UPDATE',
      entity: 'Product',
      entityId: id,
      oldValue: oldProduct,
      newValue: newProduct,
    });
    await this.invalidateProductCaches(newProduct.id, newProduct.categoryId);
    return newProduct;
  }

  async addVariant(
    productId: string,
    dto: CreateProductVariantDto,
    adminId: string,
  ) {
    const newVariant = await this.catalogClient.addVariant(productId, dto);

    this.eventEmitter.emit('variant.created', {
      id: adminId,
      action: 'CREATE',
      entity: 'ProductVariant',
      entityId: newVariant.id,
      oldValue: null,
      newValue: newVariant,
    });
    await this.invalidateProductCaches(productId, undefined, newVariant.id);
    return newVariant;
  }

  async updateVariant(
    id: string,
    dto: UpdateProductVariantDto,
    adminId: string,
  ) {
    const oldVariant = await this.catalogClient.getVariant(id);
    const newVariant = await this.catalogClient.updateVariant(id, dto);

    this.eventEmitter.emit('variant.update', {
      id: adminId,
      action: 'UPDATE',
      entity: 'ProductVariant',
      entityId: id,
      oldValue: oldVariant,
      newValue: newVariant,
    });
    await this.invalidateProductCaches(
      newVariant.productId,
      undefined,
      newVariant.id,
    );
    return newVariant;
  }

  async remove(id: string, adminId: string) {
    const oldProduct = await this.catalogClient.getProduct(id);
    const deletedProduct = await this.catalogClient.removeProduct(id);

    this.eventEmitter.emit('product.deleted', {
      id: adminId,
      action: 'DELETE',
      entity: 'Product',
      entityId: id,
      oldValue: oldProduct,
      newValue: null,
    });
    await this.invalidateProductCaches(oldProduct.id, oldProduct.categoryId);
    return deletedProduct;
  }

  async removeVariant(id: string, adminId: string) {
    const oldVariant = await this.catalogClient.getVariant(id);
    const deletedVariant = await this.catalogClient.removeVariant(id);

    this.eventEmitter.emit('variant.deleted', {
      id: adminId,
      action: 'DELETE',
      entity: 'ProductVariant',
      entityId: id,
      oldValue: oldVariant,
      newValue: null,
    });
    await this.invalidateProductCaches(
      oldVariant.productId,
      undefined,
      oldVariant.id,
    );
    return deletedVariant;
  }

  async findAll(query: GetProductsDto): Promise<string> {
    const cacheKey = this.getPaginatedCacheKey(query);
    const result = await this.getCachedOrLoad<CatalogProductsPage>(
      cacheKey,
      () => this.catalogClient.getProducts(query),
    );
    return JSON.stringify(result);
  }

  async findOne(id: string): Promise<string> {
    const product = await this.getCachedOrLoad<ProductWithRelations>(
      this.getProductCacheKey(id),
      () => this.catalogClient.getProduct(id),
    );
    return JSON.stringify(product);
  }

  findOneVariant(id: string): Promise<VariantWithProduct> {
    return this.getCachedOrLoad<VariantWithProduct>(
      this.getVariantCacheKey(id),
      () => this.catalogClient.getVariant(id),
    );
  }

  // Chống nhiều request cùng truy vấn Catalog khi một cache key bị miss.
  private async getCachedOrLoad<T extends object>(
    cacheKey: string,
    loadFromCatalog: () => Promise<T>,
  ): Promise<T> {
    const lockKey = `lock:${cacheKey}`;
    const deadline = Date.now() + 5_000;

    while (Date.now() < deadline) {
      const cached = await this.cacheService.get<T>(cacheKey);
      if (cached !== null) return cached;

      const token = await this.cacheService.acquireLock(lockKey, 15_000);
      if (token) {
        try {
          const cachedAfterLock = await this.cacheService.get<T>(cacheKey);
          if (cachedAfterLock !== null) return cachedAfterLock;

          const value = await loadFromCatalog();
          await this.cacheService.set(cacheKey, value);
          return value;
        } finally {
          await this.cacheService.releaseLock(lockKey, token);
        }
      }

      await new Promise((resolve) =>
        setTimeout(resolve, 50 + Math.floor(Math.random() * 26)),
      );
    }

    throw new ServiceUnavailableException('Đang tải dữ liệu, vui lòng thử lại');
  }
}
