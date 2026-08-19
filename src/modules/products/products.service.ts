import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createProductDto: CreateProductDto) {
    // Tách riêng mảng variants và các thông tin còn lại của product
    const { variants, ...productData } = createProductDto;

    try {
      // Prisma Nested Write: Tạo Product và tự động map khóa ngoại tạo ProductVariant
      return await this.prisma.product.create({
        data: {
          ...productData,
          variants: {
            create: variants, // Tự động lặp mảng để tạo các bản ghi biến thể
          },
        },
        include: {
          category: true, // Trả về thông tin danh mục
          variants: true, // Trả về danh sách biến thể vừa tạo
        },
      });
    } catch (error) {
      // Mã P2002 của Prisma có nghĩa là vi phạm ràng buộc Unique (ở đây là trùng mã SKU)
      if (error.code === 'P2002') {
        throw new ConflictException('Mã SKU của biến thể đã tồn tại, vui lòng kiểm tra lại!');
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

  // Tạm thời bỏ qua Update vì logic update nested khá dài, ta sẽ bổ sung sau

  async remove(id: string) {
    await this.findOne(id); // Kiểm tra xem có tồn tại không
    // Do file schema có onDelete: Cascade, xóa Product sẽ tự động xóa sạch Variants
    return this.prisma.product.delete({
      where: { id },
    });
  }
}