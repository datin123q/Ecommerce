import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client-product';
import { PrismaService } from '../../database/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { GetProductsDto } from './dto/get-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  countActive() {
    return this.prisma.db.product.count({ where: { deletedAt: null } });
  }

  async findAll(query: GetProductsDto) {
    const { page = 1, limit = 5, sortBy = 'name', sortOrder = 'asc' } = query;
    const where = { deletedAt: null };
    const skip = (page - 1) * limit;
    const products = await this.prisma.db.product.findMany({
      where,
      skip,
      take: limit,
      include: { variants: { where: { deletedAt: null } } },
      orderBy: { [sortBy]: sortOrder },
    });
    const total = await this.prisma.db.product.count({ where });
    const totalPages = Math.ceil(total / limit);

    return {
      data: products,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async findOne(id: string) {
    const product = await this.prisma.db.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: true,
        variants: { where: { deletedAt: null } },
      },
    });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');
    return product;
  }

  async findOneVariant(id: string) {
    const variant = await this.prisma.db.productVariant.findFirst({
      where: { id, deletedAt: null },
      include: { product: true },
    });
    if (!variant) throw new NotFoundException('Không tìm thấy biến thể sản phẩm');
    return variant;
  }

  async create(dto: CreateProductDto) {
    try {
      return await this.prisma.db.product.create({
        data: {
          name: dto.name,
          description: dto.description,
          price: dto.price,
          categoryId: dto.categoryId,
          variants: { create: dto.variants },
        },
        include: { category: true, variants: true },
      });
    } catch (error) {
      this.rethrowWriteError(error, 'Mã SKU của biến thể đã tồn tại, vui lòng kiểm tra lại!');
    }
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    const oldProduct = await this.prisma.db.product.findFirst({
      where: { id, deletedAt: null },
    });
    if (!oldProduct) throw new NotFoundException('Không tìm thấy sản phẩm');

    return this.prisma.db.product.update({
      where: { id },
      data: { name: dto.name, description: dto.description },
    });
  }

  async addVariant(productId: string, dto: CreateProductVariantDto) {
    const product = await this.prisma.db.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm gốc để thêm biến thể');
    }

    try {
      return await this.prisma.db.productVariant.create({
        data: { ...dto, productId },
      });
    } catch (error) {
      this.rethrowWriteError(error, 'Mã SKU của biến thể này đã tồn tại!');
    }
  }

  async updateVariant(id: string, dto: UpdateProductVariantDto) {
    const variant = await this.prisma.db.productVariant.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!variant) {
      throw new NotFoundException(`Không tìm thấy biến thể với ID: ${id}`);
    }

    try {
      return await this.prisma.db.productVariant.update({
        where: { id },
        data: { sku: dto.sku, name: dto.name, variant: dto.variant },
      });
    } catch (error) {
      this.rethrowWriteError(error, 'Mã SKU của biến thể này đã tồn tại!');
    }
  }

  async remove(id: string) {
    const oldProduct = await this.prisma.db.product.findFirst({
      where: { id, deletedAt: null },
    });
    if (!oldProduct) throw new NotFoundException('Không tìm thấy sản phẩm');

    return this.prisma.db.$transaction(async (tx) => {
      const deletedAt = new Date();
      await tx.productVariant.updateMany({
        where: { productId: id, deletedAt: null },
        data: { deletedAt },
      });
      return tx.product.update({ where: { id }, data: { deletedAt } });
    });
  }

  async removeVariant(id: string) {
    const variant = await this.prisma.db.productVariant.findFirst({
      where: { id, deletedAt: null },
    });
    if (!variant) {
      throw new NotFoundException(`Không tìm thấy biến thể với ID: ${id}`);
    }
    return this.prisma.db.productVariant.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private rethrowWriteError(error: unknown, conflictMessage: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(conflictMessage);
    }
    throw error;
  }
}
