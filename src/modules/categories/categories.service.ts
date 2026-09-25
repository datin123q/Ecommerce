import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { RedisCacheService } from '../../redis/redisCache.service';

export type CategoryWithCount = Prisma.CategoryGetPayload<{
  include: { _count: { select: { products: true } } }
}>;

export type CategoryWithProducts = Prisma.CategoryGetPayload<{
  include: { products: { include: { variants: true } } }
}>;

@Injectable()
export class CategoriesService {
  private readonly CACHE_KEY_ALL = 'categories_all';

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly cacheService: RedisCacheService,
  ) {}

  private getCategoryCacheKey(id: string): string {
    return `category_${id}_v`;
  }

  private async clearCategoryCaches(categoryId?: string, isDelete: boolean = false) {
    const keysToDelete = [this.CACHE_KEY_ALL];
    
    if (categoryId) {
      keysToDelete.push(this.getCategoryCacheKey(categoryId));
    }

    if (isDelete) {
      keysToDelete.push('products_key');
      await this.cacheService.delByPattern('products:page=*');
    }

    await this.cacheService.del(...keysToDelete);
  }

  async create(createCategoryDto: CreateCategoryDto, adminId: string) {
    try {
      const newCategory = await this.prisma.db.category.create({
        data: createCategoryDto,
      });

      this.eventEmitter.emit('category.created', {
        id: adminId, action: 'CREATE', entity: 'Category', entityId: newCategory.id,
        oldValue: null, newValue: newCategory, tx: this.prisma
      });

      await this.clearCategoryCaches();
      return newCategory;

    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Tên danh mục này đã tồn tại (hoặc nằm trong thùng rác)');
      }
      throw error;
    }
  }

  async findAll(): Promise<CategoryWithCount[]> {
    const cachedCategories = await this.cacheService.get<CategoryWithCount[]>(this.CACHE_KEY_ALL);
    if (cachedCategories) return cachedCategories;

    const categories = await this.prisma.db.category.findMany({
      include: { _count: { select: { products: true } } }
    });
        
    await this.cacheService.set(this.CACHE_KEY_ALL, categories);
    return categories;
  }

  async findOne(id: string): Promise<CategoryWithProducts> {
    const cacheKey = this.getCategoryCacheKey(id);

    // Đổi tên biến cho chuẩn (1 danh mục thì dùng số ít: cachedCategory)
    const cachedCategory = await this.cacheService.get<CategoryWithProducts>(cacheKey);
    if (cachedCategory) return cachedCategory;

    const category = await this.prisma.db.category.findUnique({
      where: { id },
      include: { products: { include: { variants: true } } }
    });

    if (!category) throw new NotFoundException('Không tìm thấy danh mục');

    await this.cacheService.set(cacheKey, category);
    return category as CategoryWithProducts;
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto, adminId: string) {
    const oldCategory = await this.findOne(id);

    try {
      const newCategory = await this.prisma.db.category.update({
        where: { id },
        data: updateCategoryDto,
      });

      this.eventEmitter.emit('category.update', {
        id: adminId, action: 'UPDATE', entity: 'Category', entityId: id,
        oldValue: oldCategory, newValue: newCategory, tx: this.prisma
      });

      await this.clearCategoryCaches(id);
      return newCategory;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Tên danh mục này đã được sử dụng');
      }
      throw error;
    }
  }

  async remove(id: string, adminId: string) {
    const oldCategory = await this.findOne(id);
    
    // Sửa tên biến: productsInCart -> productsInCategory
    const productsInCategory = await this.prisma.db.product.findMany({
      where: { categoryId: id },
      select: { id: true },
    });

    const productIds = productsInCategory.map(p => p.id);
    
    const deletedCategory = await this.prisma.db.$transaction(async (tx) => {
      if (productIds.length > 0) {
        await tx.productVariant.deleteMany({
          where: { productId: { in: productIds } }
        });
      }
      await tx.product.deleteMany({
        where: { categoryId: id }
      });

      return tx.category.delete({
        where: { id },
      });
    });

    this.eventEmitter.emit('category.delete', {
      id: adminId, action: 'DELETE', entity: 'Category', entityId: id,
      oldValue: oldCategory, newValue: null, tx: this.prisma
    });

    await this.clearCategoryCaches(id, true);
    
    return deletedCategory;
  }
}