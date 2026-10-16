/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class VariantsService {
  constructor(private readonly prisma: PrismaService) {}

  async lookup(variantIds: string[]) {
    const variants = await this.prisma.db.productVariant.findMany({
      where: { id: { in: variantIds }, deletedAt: null },
      include: {
        product: {
          select: { id: true, name: true, price: true, categoryId: true, deletedAt: true },
        },
      },
    });
    const foundIds = new Set(variants.map((variant) => variant.id));
    return {
      data: variants,
      notFoundIds: variantIds.filter((id) => !foundIds.has(id)),
    };
  }
}
