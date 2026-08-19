import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createCategoryDto: CreateCategoryDto) {
    // 1. Kiểm tra xem tên danh mục đã tồn tại chưa (tránh lỗi trùng unique)
    const existingCategory = await this.prisma.category.findUnique({
      where: { name: createCategoryDto.name },
    });
    
    if (existingCategory) {
      throw new ConflictException('Tên danh mục này đã tồn tại');
    }

    // 2. Tạo mới danh mục
    return this.prisma.category.create({
      data: createCategoryDto,
    });
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

  async update(id: string, updateCategoryDto: UpdateCategoryDto) {
    await this.findOne(id); // Kiểm tra tồn tại trước khi sửa
    return this.prisma.category.update({
      where: { id },
      data: updateCategoryDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id); // Kiểm tra tồn tại trước khi xóa
    return this.prisma.category.delete({
      where: { id },
    });
  }
}