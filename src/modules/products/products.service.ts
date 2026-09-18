import { Injectable,Inject, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { GetProductsDto } from './dto/get-products.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { CreateProductVariantDto } from './dto/create-product.dto';
import { EventEmitter2 } from '@nestjs/event-emitter'; 
import { RedisCacheService } from '../../redis/redisCache.service';


@Injectable()
export class ProductsService {
  private readonly CACHE_TTL = 600000; 
  constructor(private readonly prisma: PrismaService, private readonly eventEmitter: EventEmitter2, private readonly cacheService: RedisCacheService ) {}

  async create(createProductDto: CreateProductDto, adminId: string) {
    const { variants, ...productData } = createProductDto;
    const cacheKey = 'products_key';
    try {
      const newProduct = await this.prisma.db.product.create({
        data: {
          ...productData,
          variants: {
            create: variants, 
          },
        },
        include: {
          category: true, 
          variants: true, 
        },
      });
      this.eventEmitter.emit('product.created', {
        id: adminId,
        action: 'CREATE',
        entity: 'Product',
        entityId: newProduct.id,
        oldValue: null,        
        newValue: newProduct,   
        tx: this.prisma
      });
      await this.cacheService.del(cacheKey,`category_${newProduct.categoryId}_v` );
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
      id: adminId,
      action: 'UPDATE',
      entity: 'Product',
      entityId: id,
      oldValue: oldProduct,        
      newValue: newProduct,   
      tx: this.prisma
    });
    await this.cacheService.del('products_key',`products_${id}_v`,`category_${newProduct.categoryId}_v`  );
    return newProduct;
  }

  async addVariant(productId: string, variantData: CreateProductVariantDto, adminId: string) {
    const product = await this.prisma.db.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm gốc để thêm biến thể');
    }

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
        id: adminId,
        action: 'CREATE',
        entity: 'ProductVariant',
        entityId: newVariant.id,
        oldValue: null,        
        newValue: newVariant,   
        tx: this.prisma
      });
    await this.cacheService.del('products_key', `product_${productId}_v`,`variant_${newVariant.id}_v` );
      return newVariant;
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('Mã SKU của biến thể này đã tồn tại!');
      }
      throw error;
    }
  }

  async updateVariant(variantId: string, updateVariantDto: UpdateProductVariantDto, adminId: string) {
    // 1. Kiểm tra xem biến thể có tồn tại không
    const oldVariant = await this.prisma.db.productVariant.findUnique({ 
      where: { id: variantId } 
    });

    if (!oldVariant) {
      throw new NotFoundException(`Không tìm thấy biến thể với ID: ${variantId}`);
    }

    // 2. Cập nhật dữ liệu mới 
    const newVariant = await this.prisma.db.productVariant.update({
      where: { id: variantId },
      data: {
        sku: updateVariantDto.sku,
        name: updateVariantDto.name,
        variant: updateVariantDto.variant,
      }
    });

    // 3. Ghi lại Audit Log
    this.eventEmitter.emit('variant.update', {
      id: adminId,
      action: 'UPDATE',
      entity: 'ProductVariant',
      entityId: variantId,
      oldValue: oldVariant,        
      newValue: newVariant,   
      tx: this.prisma
    });
    await this.cacheService.del('products_key', `product_${newVariant.productId}_v`, `variant_${newVariant.id}_v`);
    return newVariant;
  }


  async findAll(query: GetProductsDto) {
    const {
      page = 1,
      limit = 10,
      sortBy = 'name',
      sortOrder = 'asc',
    } = query;
    const skip = (page - 1) * limit;
    const cacheKey = `products:page=${page}:limit=${limit}:sortBy=${sortBy}:sortOrder=${sortOrder}`;
    const cachedProducts = await this.cacheService.get<any>(cacheKey);
    if (cachedProducts) {
      return cachedProducts;
    }
    const [products, total] = await Promise.all([
      this.prisma.db.product.findMany({
        skip,
        take: limit,
        include: {
          variants: true,
        },
        orderBy: {
          [sortBy]: sortOrder,
        },
      }),
      this.prisma.db.product.count(),
    ]);

  const result = {
    data: products,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page < Math.ceil(total / limit),
      hasPreviousPage: page > 1,
    },
  };

  await this.cacheService.set(cacheKey, result);

  return result;
}

  async findOne(id: string) {
    const cacheKey = `product_${id}_v`;
    const cachedCarts = await this.cacheService.get<any>(cacheKey);
    if (cachedCarts) {
      return cachedCarts;
    }
    const product = await this.prisma.db.product.findUnique({
      where: { id },
      include: { category: true, variants: true },
    });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');
    await this.cacheService.set(cacheKey, product);
    return product;
  }

  async findOneVariant(id: string) {
    const cacheKey =  `variant_${id}_v`;
    const cachedCarts = await this.cacheService.get<any>(cacheKey);
    if (cachedCarts) {
      return cachedCarts;
    }
    const variant = await this.prisma.db.productVariant.findUnique({
      where: { id },
      include: { product:true },
    });
    if (!variant) throw new NotFoundException('Không tìm thấy sản phẩm');
    await this.cacheService.set(cacheKey, variant);
    return variant;
  }


  async remove(id: string, adminId: string) {
    const oldProduct = await this.findOne(id); 
    const deletedProduct = await this.prisma.db.$transaction(async (tx) => {
      await tx.productVariant.deleteMany({
        where: { productId: id }
      });

      return tx.product.delete({
        where: { id },
      });
    });

    this.eventEmitter.emit('product.deleted', {
      id: adminId,
      action: 'DELETE',
      entity: 'Product',
      entityId: id,
      oldValue: oldProduct,        
      newValue: null,   
      tx: this.prisma
    });
    await this.cacheService.del('products_key',`products_${id}_v`,`category_${oldProduct.categoryId}_v`  );
    return deletedProduct;
  }

  async removeVariant(id: string, adminId: string) {
    const oldVariant = await this.findOneVariant(id);
    this.eventEmitter.emit('variant.deleted', {
      id: adminId,
      action: 'DELETE',
      entity: 'ProductVariant',
      entityId: id,
      oldValue: oldVariant,        
      newValue: null,   
      tx: this.prisma
    });
    await this.cacheService.del('products_key',`product_${oldVariant.productId}_v`,`variant_${oldVariant.id}_v` );
    return this.prisma.db.productVariant.delete({
      where: {id},
    })
  }
}