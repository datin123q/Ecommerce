import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client-product';
import { PrismaService } from '../../database/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.db.category.findMany({
      where: { deletedAt: null },
      include: {
        _count: { select: { products: { where: { deletedAt: null } } } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.db.category.findFirst({
      where: { id, deletedAt: null },
      include: {
        products: {
          where: { deletedAt: null },
          include: { variants: { where: { deletedAt: null } } },
        },
      },
    });
    if (!category) throw new NotFoundException('Không tìm thấy danh mục');
    return category;
  }

  async create(dto: CreateCategoryDto) {
    try {
      return await this.prisma.db.category.create({ data: dto });
    } catch (error) {
      this.rethrowUniqueConflict(
        error,
        'Tên danh mục này đã tồn tại (hoặc nằm trong thùng rác)',
      );
    }
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const existing = await this.prisma.db.category.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Không tìm thấy danh mục');

    try {
      return await this.prisma.db.category.update({
        where: { id },
        data: dto,
      });
    } catch (error) {
      this.rethrowUniqueConflict(error, 'Tên danh mục này đã được sử dụng');
    }
  }

  async remove(id: string) {
    const category = await this.prisma.db.category.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('Không tìm thấy danh mục');

    return this.prisma.db.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: { categoryId: id, deletedAt: null },
        select: { id: true },
      });
      const productIds = products.map((product) => product.id);
      const deletedAt = new Date();

      if (productIds.length > 0) {
        await tx.productVariant.updateMany({
          where: { productId: { in: productIds }, deletedAt: null },
          data: { deletedAt },
        });
      }
      await tx.product.updateMany({
        where: { categoryId: id, deletedAt: null },
        data: { deletedAt },
      });
      return tx.category.update({ where: { id }, data: { deletedAt } });
    });
  }

  private rethrowUniqueConflict(error: unknown, message: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(message);
    }
    throw error;
  }
}
