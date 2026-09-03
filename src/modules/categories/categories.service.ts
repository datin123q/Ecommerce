import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { type Cache } from 'cache-manager';

@Injectable()
export class CategoriesService {
  // Khai báo hằng số cho key và thời gian sống của cache (Vd: 1 giờ)
  private readonly CACHE_KEY_ALL = 'categories_all';
  private readonly CACHE_TTL = 3600000; // milliseconds

  constructor(
    private readonly prisma: PrismaService, 
    private readonly eventEmitter: EventEmitter2,
    @Inject(CACHE_MANAGER) private cacheManager: Cache 
  ) {}

  async create(createCategoryDto: CreateCategoryDto, adminId: string) {
    // 1. Kiểm tra xem tên danh mục đã tồn tại chưa
    const existingCategory = await this.prisma.category.findUnique({
      where: { name: createCategoryDto.name },
    });
    
    if (existingCategory) {
      throw new ConflictException('Tên danh mục này đã tồn tại');
    }

    // 2. Tạo mới danh mục
    const newCategory = await this.prisma.category.create({
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

    // 3. Xóa cache danh sách vì đã có thêm danh mục mới
    await this.clearCategoryCaches();

    return newCategory;
  }

  async findAll() {
    // 1. Tìm trong Redis trước
    const cachedCategories = await this.cacheManager.get(this.CACHE_KEY_ALL);
    if (cachedCategories) {
      return cachedCategories; 
    }

    // 2. Nếu chưa có, query DB
    const categories = await this.prisma.category.findMany({
      include: {
        _count: {
          select: { products: true }
        }
      }
    });

    // 3. Lưu lại vào Redis để các request sau dùng
    await this.cacheManager.set(this.CACHE_KEY_ALL, categories, this.CACHE_TTL);

    return categories;
  }

  async findOne(id: string) {
    const cacheKey = `category_${id}`;

    // 1. Tìm trong Redis
    const cachedCategory = await this.cacheManager.get(cacheKey);
    if (cachedCategory) {
      return cachedCategory;
    }

    // 2. Query DB
    const category = await this.prisma.category.findUnique({
      where: { id },
    });
    if (!category) throw new NotFoundException('Không tìm thấy danh mục');

    // 3. Lưu vào Redis
    await this.cacheManager.set(cacheKey, category, this.CACHE_TTL);

    return category;
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto, adminId: string) {
    const oldCategory = await this.findOne(id); 
    const newCategory = await this.prisma.category.update({
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

    // Xóa cache (cả cache danh sách tổng lẫn cache chi tiết của ID này)
    await this.clearCategoryCaches(id);

    return newCategory;
  }

  async remove(id: string, adminId: string) {
    const oldCategory = await this.findOne(id); 
    this.eventEmitter.emit('category.delete', {
      id: adminId,
      action: 'DELETE',
      entity: 'Category',
      entityId: id,
      oldValue: oldCategory,        
      newValue: null,   
      tx: this.prisma
    });

    const deletedCategory = await this.prisma.category.delete({
      where: { id },
    });

    // Xóa cache sau khi delete thành công
    await this.clearCategoryCaches(id);

    return deletedCategory;
  }

  // ==========================================
  // HÀM TIỆN ÍCH: Xóa mồi các cache
  // ==========================================
  private async clearCategoryCaches(categoryId?: string) {
    await this.cacheManager.del(this.CACHE_KEY_ALL);
    if (categoryId) {
      await this.cacheManager.del(`category_${categoryId}`);
    }
  }
}