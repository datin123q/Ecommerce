import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

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
}
