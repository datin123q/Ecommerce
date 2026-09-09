import { ConflictException, Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis'; 

@Injectable()
export class CategoriesService {
  private readonly CACHE_KEY_ALL = 'categories_all';
  private readonly CACHE_TTL = 600000; 

  constructor(
    private readonly prisma: PrismaService, 
    private readonly eventEmitter: EventEmitter2,
    @Inject('REDIS_CLIENT') private readonly redisClient: Redis 
  ) {}

  async create(createCategoryDto: CreateCategoryDto, adminId: string) {
    try {
      const newCategory = await this.prisma.db.category.create({
        data: createCategoryDto,
      });

      this.eventEmitter.emit('category.created', {
        id: adminId,
        action: 'CREATE',
        entity: 'Category',
        entityId: newCategory.id,
        oldValue: null,        
        newValue: newCategory,   
        tx: this.prisma
      });

      // Xóa mồi cache vì dữ liệu đã thay đổi
      await this.clearCategoryCaches();
      return newCategory;

    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Tên danh mục này đã tồn tại (hoặc nằm trong thùng rác)');
      }
      throw error;
    }
  }

  async findAll() {
    // 1. Lấy chuỗi JSON từ Redis
    const cachedStr = await this.redisClient.get(this.CACHE_KEY_ALL);
    if (cachedStr) {
      return JSON.parse(cachedStr); 
    }

    // 2. Nếu không có, query DB
    const categories = await this.prisma.db.category.findMany({
      include: { _count: { select: { products: true } } }
    });

    await this.redisClient.set(
      this.CACHE_KEY_ALL, 
      JSON.stringify(categories), 
      'PX', 
      this.CACHE_TTL
    );

    return categories;
  }

  async findOne(id: string) {
    const cacheKey = `category_${id}_v`;
    
    const cachedStr = await this.redisClient.get(cacheKey);
    if (cachedStr) {
      return JSON.parse(cachedStr);
    }

    const category = await this.prisma.db.category.findUnique({
      where: { id },
      include: {products: {include:{variants:true}}}
    });
    
    if (!category) throw new NotFoundException('Không tìm thấy danh mục');

    await this.redisClient.set(
      cacheKey, 
      JSON.stringify(category), 
      'PX', 
      this.CACHE_TTL
    );

    return category;
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto, adminId: string) {
    const oldCategory = await this.findOne(id); 
    
    try {
      const newCategory = await this.prisma.db.category.update({
        where: { id },
        data: updateCategoryDto,
      });

      this.eventEmitter.emit('category.update', {
        id: adminId,
        action: 'UPDATE',
        entity: 'Category',
        entityId: id,
        oldValue: oldCategory,        
        newValue: newCategory,   
        tx: this.prisma
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
    const productsInCat = await this.prisma.db.product.findMany({
      where: { categoryId: id },
      select: { id: true },
    });
    
    const productIds = productsInCat.map(p => p.id);
    const deletedCategory = await this.prisma.db.$transaction(async (tx) => {
      
      if (productIds.length > 0) {
        await tx.productVariant.deleteMany({
          where: { productId: { in: productIds } }
        });
        
        //await tx.cartItem.deleteMany({ where: { variantId: { in: variantIds } } });
      }
      await tx.product.deleteMany({
        where: { categoryId: id }
      });

      return tx.category.delete({
        where: { id },
      });
    });

    this.eventEmitter.emit('category.delete', {
      id: adminId,
      action: 'DELETE',
      entity: 'Category',
      entityId: id,
      oldValue: oldCategory,        
      newValue: null,   
      tx: this.prisma
    });

    await this.clearCategoryCaches(id);
    return deletedCategory;
  }

  private async clearCategoryCaches(categoryId?: string) {
    await this.redisClient.del(this.CACHE_KEY_ALL);
    if (categoryId) {
      await this.redisClient.del(`category_${categoryId}`);
    }
  }
}