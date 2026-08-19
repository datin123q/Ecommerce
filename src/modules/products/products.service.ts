import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductVariantDto } from './dto/update-productVariant.dto';
import { CreateProductVariantDto } from './dto/create-product.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService, private readonly auditLogsService: AuditLogsService) {}
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

  async updateProduct(id: string, updateProductDto: UpdateProductDto, adminId: string) {

    const oldProduct = await this.findOne(id); 

    const newProduct = await this.prisma.product.update({
      where: { id },
      data: {
        name: updateProductDto.name,
        description: updateProductDto.description,
      }
    });

    await this.auditLogsService.logAction(
      adminId,
      'UPDATE',
      'Product',
      id,
      oldProduct,
      newProduct
    );

    return newProduct;
  }

  async addVariant(productId: string, variantData: CreateProductVariantDto) {
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
async updateVariant(variantId: string, updateVariantDto: UpdateProductVariantDto, adminId: string) {
    // 1. Kiểm tra xem biến thể có tồn tại không
    const oldVariant = await this.prisma.productVariant.findUnique({ 
      where: { id: variantId } 
    });

    if (!oldVariant) {
      throw new NotFoundException(`Không tìm thấy biến thể với ID: ${variantId}`);
    }

    // 2. Cập nhật dữ liệu mới (Chỉ lấy sku, name, variant)
    const newVariant = await this.prisma.productVariant.update({
      where: { id: variantId },
      data: {
        sku: updateVariantDto.sku,
        name: updateVariantDto.name,
        variant: updateVariantDto.variant,
      }
    });

    // 3. Ghi lại Audit Log
    await this.auditLogsService.logAction(
      adminId,
      'UPDATE',
      'ProductVariant', 
      variantId,
      oldVariant,
      newVariant
    );

    return newVariant;
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

  async findOneVariant(id: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id },
      include: { product:true },
    });
    if (!variant) throw new NotFoundException('Không tìm thấy sản phẩm');
    return variant;
  }


  async remove(id: string) {
    await this.findOne(id); 
    return this.prisma.product.delete({
      where: { id },
    });
  }
}