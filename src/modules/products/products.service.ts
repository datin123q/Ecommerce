import {
  BadGatewayException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RedisCacheService } from '../../redis/redisCache.service';
import { CreateProductDto, CreateProductVariantDto } from './dto/create-product.dto';
import { GetProductsDto } from './dto/get-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';

export interface ProductWithRelations {
  id: string;
  name: string;
  description: string | null;
  price: number;
  categoryId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  category?: Record<string, unknown>;
  variants?: VariantWithProduct[];
}

export interface VariantWithProduct {
  id: string;
  sku: string;
  name: string;
  variant: string;
  productId: string;
  deletedAt: string | null;
  product?: ProductWithRelations;
}

interface ProductsPage {
  data: ProductWithRelations[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly cacheService: RedisCacheService,
  ) {}

  getDashboardActiveProductCount(): Promise<number> {
    return this.callCatalog<number>('GET', '/products/count');
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
    const newProduct = await this.callCatalog<ProductWithRelations>(
      'POST',
      '/products',
      dto,
    );

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
    const oldProduct = await this.callCatalog<ProductWithRelations>(
      'GET',
      `/products/${encodeURIComponent(id)}`,
    );
    const newProduct = await this.callCatalog<ProductWithRelations>(
      'PATCH',
      `/products/${encodeURIComponent(id)}`,
      dto,
    );

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
    const newVariant = await this.callCatalog<VariantWithProduct>(
      'POST',
      `/products/${encodeURIComponent(productId)}/variants`,
      dto,
    );

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
    const oldVariant = await this.callCatalog<VariantWithProduct>(
      'GET',
      `/products/variants/${encodeURIComponent(id)}`,
    );
    const newVariant = await this.callCatalog<VariantWithProduct>(
      'PATCH',
      `/products/variants/${encodeURIComponent(id)}`,
      dto,
    );

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
    const oldProduct = await this.callCatalog<ProductWithRelations>(
      'GET',
      `/products/${encodeURIComponent(id)}`,
    );
    const deletedProduct = await this.callCatalog<ProductWithRelations>(
      'DELETE',
      `/products/${encodeURIComponent(id)}`,
    );

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
    const oldVariant = await this.callCatalog<VariantWithProduct>(
      'GET',
      `/products/variants/${encodeURIComponent(id)}`,
    );
    const deletedVariant = await this.callCatalog<VariantWithProduct>(
      'DELETE',
      `/products/variants/${encodeURIComponent(id)}`,
    );

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
    const result = await this.getCachedOrLoad<ProductsPage>(cacheKey, async () => {
      const params = new URLSearchParams({
        page: String(query.page ?? 1),
        limit: String(query.limit ?? 5),
        sortBy: query.sortBy ?? 'name',
        sortOrder: query.sortOrder ?? 'asc',
      });
      return this.callCatalog<ProductsPage>('GET', `/products?${params.toString()}`);
    });
    return JSON.stringify(result);
  }

  async findOne(id: string): Promise<string> {
    const product = await this.getCachedOrLoad<ProductWithRelations>(
      this.getProductCacheKey(id),
      () => this.callCatalog<ProductWithRelations>(
        'GET',
        `/products/${encodeURIComponent(id)}`,
      ),
    );
    return JSON.stringify(product);
  }

  findOneVariant(id: string): Promise<VariantWithProduct> {
    return this.getCachedOrLoad<VariantWithProduct>(
      this.getVariantCacheKey(id),
      () => this.callCatalog<VariantWithProduct>(
        'GET',
        `/products/variants/${encodeURIComponent(id)}`,
      ),
    );
  }

  private async callCatalog<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const baseUrl = this.config.get<string>('CATALOG_SERVICE_URL');
    if (!baseUrl) {
      throw new ServiceUnavailableException(
        'Commerce chưa cấu hình URL của Catalog service',
      );
    }

    let response: Response;
    try {
      response = await fetch(
        `${baseUrl.replace(/\/$/, '')}/api/v1${path}`,
        {
          method,
          headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(3000),
        },
      );
    } catch {
      throw new ServiceUnavailableException(
        'Không kết nối được tới Catalog service',
      );
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const message =
        payload && typeof payload === 'object' && 'message' in payload
          ? (payload as { message: string | string[] }).message
          : `Catalog service trả về HTTP ${response.status}`;

      if (response.status === 404) throw new NotFoundException(message);
      if (response.status === 409) throw new ConflictException(message);
      if (response.status >= 400 && response.status < 500) {
        throw new HttpException(message, response.status);
      }
      throw new BadGatewayException(message);
    }

    return (await response.json()) as T;
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
