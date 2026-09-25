import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProductDto, CreateProductVariantDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { GetProductsDto } from './dto/get-products.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { EventEmitter2 } from '@nestjs/event-emitter'; 
import { RedisCacheService } from '../../redis/redisCache.service';
import { Prisma } from '@prisma/client';

export type ProductWithRelations = Prisma.ProductGetPayload<{
  include: { category: true, variants: true }
}>;

export type VariantWithProduct = Prisma.ProductVariantGetPayload<{
  include: { product: true }
}>;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService, 
    private readonly eventEmitter: EventEmitter2, 
    private readonly cacheService: RedisCacheService 
  ) {}

  // CACHE KEY MANAGEMENT 
  private getProductCacheKey(id: string) { return `product_${id}_v`; }
  private getVariantCacheKey(id: string) { return `variant_${id}_v`; }
  private getCategoryCacheKey(id: string) { return `category_${id}_v`; }
  
  private getPaginatedCacheKey(query: GetProductsDto) {
    const { page = 1, limit = 1, sortBy = 'name', sortOrder = 'asc' } = query;
    return `products:page=${page}:limit=${limit}:sortBy=${sortBy}:sortOrder=${sortOrder}`;
  }

  private async invalidateProductCaches(productId?: string, categoryId?: string, variantId?: string) {
    const keysToDelete: string[] = [];
    
    keysToDelete.push('products_key'); 
    await this.cacheService.delByPattern('products:page=*');

    if (productId) keysToDelete.push(this.getProductCacheKey(productId));
    if (categoryId) keysToDelete.push(this.getCategoryCacheKey(categoryId));
    if (variantId) keysToDelete.push(this.getVariantCacheKey(variantId));

    if (keysToDelete.length > 0) {
      await this.cacheService.del(...keysToDelete);
    }
  }

  //PUBLIC 
  async create(createProductDto: CreateProductDto, adminId: string) {
    const { variants, ...productData } = createProductDto;
    
    try {
      const newProduct = await this.prisma.db.product.create({
        data: {
          ...productData,
          variants: { create: variants },
        },
        include: { category: true, variants: true },
      });

      this.eventEmitter.emit('product.created', {
        id: adminId, action: 'CREATE', entity: 'Product', entityId: newProduct.id,
        oldValue: null, newValue: newProduct,
      });

      await this.invalidateProductCaches(newProduct.id, newProduct.categoryId);
      
      return newProduct;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Mã SKU của biến thể đã tồn tại, vui lòng kiểm tra lại!');
      }
      throw error;
    }
  }

  async updateProduct(id: string, updateProductDto: UpdateProductDto, adminId: string) {
    const oldProduct = await this.findOne(id); 

    const newProduct = await this.prisma.db.product.update({
      where: { id },
      data: {
        name: updateProductDto.name,
        description: updateProductDto.description,
      }
    });

    this.eventEmitter.emit('product.update', {
      id: adminId, action: 'UPDATE', entity: 'Product', entityId: id,
      oldValue: oldProduct, newValue: newProduct,
    });

    await this.invalidateProductCaches(newProduct.id, newProduct.categoryId);
    return newProduct;
  }

  async addVariant(productId: string, variantData: CreateProductVariantDto, adminId: string) {
    const product = await this.prisma.db.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm gốc để thêm biến thể');

    try {
      const newVariant = await this.prisma.db.productVariant.create({
        data: {
          sku: variantData.sku,
          name: variantData.name,
          variant: variantData.variant,
          productId: productId, 
        },
      });

      this.eventEmitter.emit('variant.created', {
        id: adminId, action: 'CREATE', entity: 'ProductVariant', entityId: newVariant.id,
        oldValue: null, newValue: newVariant,
      });

      await this.invalidateProductCaches(productId, undefined, newVariant.id);
      return newVariant;
    } catch (error) {
      if (error.code === 'P2002') throw new ConflictException('Mã SKU của biến thể này đã tồn tại!');
      throw error;
    }
  }

  async updateVariant(variantId: string, updateVariantDto: UpdateProductVariantDto, adminId: string) {
    const oldVariant = await this.prisma.db.productVariant.findUnique({ where: { id: variantId } });
    if (!oldVariant) throw new NotFoundException(`Không tìm thấy biến thể với ID: ${variantId}`);

    const newVariant = await this.prisma.db.productVariant.update({
      where: { id: variantId },
      data: {
        sku: updateVariantDto.sku,
        name: updateVariantDto.name,
        variant: updateVariantDto.variant,
      }
    });

    this.eventEmitter.emit('variant.update', {
      id: adminId, action: 'UPDATE', entity: 'ProductVariant', entityId: variantId,
      oldValue: oldVariant, newValue: newVariant,
    });

    await this.invalidateProductCaches(newVariant.productId, undefined, newVariant.id);
    return newVariant;
  }

  async remove(id: string, adminId: string) {
    const oldProduct = await this.findOne(id); 

    const deletedProduct = await this.prisma.db.$transaction(async (tx) => {
      await tx.productVariant.deleteMany({ where: { productId: id } });
      return tx.product.delete({ where: { id } });
    });

    this.eventEmitter.emit('product.deleted', {
      id: adminId, action: 'DELETE', entity: 'Product', entityId: id,
      oldValue: oldProduct, newValue: null,
    });

    await this.invalidateProductCaches(oldProduct.id, oldProduct.categoryId);
    return deletedProduct;
  }

  async removeVariant(id: string, adminId: string) {
    const oldVariant = await this.findOneVariant(id);

    const deletedVariant = await this.prisma.db.productVariant.delete({ where: { id } });

    this.eventEmitter.emit('variant.deleted', {
      id: adminId, action: 'DELETE', entity: 'ProductVariant', entityId: id,
      oldValue: oldVariant, newValue: null,
    });

    await this.invalidateProductCaches(oldVariant.productId, undefined, oldVariant.id);
    return deletedVariant;
  }

  // QUERIES 
  async findAll(query: GetProductsDto) {
    const cacheKey = this.getPaginatedCacheKey(query);
    
    const cachedProducts = await this.cacheService.get<any>(cacheKey); // Vẫn dùng <any> tạm cho object phân trang
    if (cachedProducts) return cachedProducts;
    
    const { page = 1, limit = 1, sortBy = 'name', sortOrder = 'asc' } = query;
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      this.prisma.db.product.findMany({
        skip, take: limit,
        include: { variants: true },
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.db.product.count(),
    ]);

    const result = {
      data: products,
      meta: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPreviousPage: page > 1,
      },
    };

    await this.cacheService.set(cacheKey, result);
    return result;
  }

  async findOne(id: string): Promise<ProductWithRelations> {
    const cacheKey = this.getProductCacheKey(id);
    
    const cachedProduct = await this.cacheService.get<ProductWithRelations>(cacheKey);
    if (cachedProduct) return cachedProduct;
    
    const product = await this.prisma.db.product.findUnique({
      where: { id },
      include: { category: true, variants: true },
    });
    
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');
    
    await this.cacheService.set(cacheKey, product);
    return product as ProductWithRelations;
  }

  async findOneVariant(id: string): Promise<VariantWithProduct> {
    const cacheKey = this.getVariantCacheKey(id);
    
    const cachedVariant = await this.cacheService.get<VariantWithProduct>(cacheKey);
    if (cachedVariant) return cachedVariant;
    
    const variant = await this.prisma.db.productVariant.findUnique({
      where: { id },
      include: { product: true },
    });
    
    if (!variant) throw new NotFoundException('Không tìm thấy biến thể sản phẩm');
    
    await this.cacheService.set(cacheKey, variant);
    return variant as VariantWithProduct;
  }
}