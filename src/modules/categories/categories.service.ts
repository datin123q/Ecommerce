import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService, private readonly auditLogsService: AuditLogsService) {}

  async create(createCategoryDto: CreateCategoryDto, adminId: string) {
    // 1. Kiểm tra xem tên danh mục đã tồn tại chưa (tránh lỗi trùng unique)
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

    await this.auditLogsService.logAction(
      adminId,
      'CREATE',
      'Category',
      newCategory.id,
      null,
      newCategory,
      this.prisma,
    );
    return newCategory;

  }

  async findAll() {
    // Lấy tất cả danh mục, kèm theo số lượng sản phẩm bên trong nó
    return this.prisma.category.findMany({
      include: {
        _count: {
          select: { products: true } // Đếm số sản phẩm trong danh mục
        }
      }
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });
    if (!category) throw new NotFoundException('Không tìm thấy danh mục');
    return category;
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto, adminId) {
    const oldCategory = await this.findOne(id); 
    const newCategory = await this.prisma.category.update({
      where: { id },
      data: updateCategoryDto,
    });
    await this.auditLogsService.logAction(
      adminId,
      'UPDATE',
      'Category',
      id,
      oldCategory,
      newCategory,
      this.prisma,
    );
    return newCategory;
  }

  async remove(id: string, adminId:string) {
    const oldCategory = await this.findOne(id); 
    await this.auditLogsService.logAction(
      adminId,
      'DELETE',
      'Category',
      id,
      oldCategory,
      null,
      this.prisma,
    );

    return this.prisma.category.delete({
      where: { id },
    });
  }
}