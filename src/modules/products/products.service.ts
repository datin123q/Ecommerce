import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateProductVariantDto } from './dto/create-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}
  //tạo products
  async create(createProductDto: CreateProductDto) {
    const { variants, ...productData } = createProductDto;

    try {
      return await this.prisma.product.create({
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
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Mã SKU của biến thể đã tồn tại, vui lòng kiểm tra lại!');
      }
      throw error;
    }
  }
  async addVariant(productId: string, variantData: CreateProductVariantDto) {
    // 1. Kiểm tra xem sản phẩm gốc có tồn tại không
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm gốc để thêm biến thể');
    }

    try {
      return await this.prisma.productVariant.create({
        data: {
          sku: variantData.sku,
          name: variantData.name,
          variant: variantData.variant,
          productId: productId, 
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('Mã SKU của biến thể này đã tồn tại!');
      }
      throw error;
    }
  }


  findAll() {
    return this.prisma.product.findMany({
      include: { category: true, variants: true },
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { category: true, variants: true },
    });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');
    return product;
  }


  async remove(id: string) {
    await this.findOne(id); // Kiểm tra xem có tồn tại không
    return this.prisma.product.delete({
      where: { id },
    });
  }
}