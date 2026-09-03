import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { CreateProductVariantDto } from './dto/create-product.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService, private readonly eventEmitter: EventEmitter2) {}
  //tạo products
  async create(createProductDto: CreateProductDto, adminId: string) {
    const { variants, ...productData } = createProductDto;

    try {
      const newProduct = await this.prisma.product.create({
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
      this.eventEmitter.emit('product.created', {
        id: adminId,
        action: 'CREATE',
        entity: 'Product',
        entityId: newProduct.id,
        oldValue: null,        
        newValue: newProduct,   
        tx: this.prisma
      });
      return newProduct;
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

    this.eventEmitter.emit('product.update', {
      id: adminId,
      action: 'UPDATE',
      entity: 'Product',
      entityId: id,
      oldValue: oldProduct,        
      newValue: newProduct,   
      tx: this.prisma
    });

    return newProduct;
  }

  async addVariant(productId: string, variantData: CreateProductVariantDto, adminId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm gốc để thêm biến thể');
    }

    try {
      const newVariant = await this.prisma.productVariant.create({
        data: {
          sku: variantData.sku,
          name: variantData.name,
          variant: variantData.variant,
          productId: productId, 
        },
      });
      this.eventEmitter.emit('variant.created', {
        id: adminId,
        action: 'CREATE',
        entity: 'ProductVariant',
        entityId: newVariant.id,
        oldValue: null,        
        newValue: newVariant,   
        tx: this.prisma
      });
      return newVariant;
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

    // 2. Cập nhật dữ liệu mới 
    const newVariant = await this.prisma.productVariant.update({
      where: { id: variantId },
      data: {
        sku: updateVariantDto.sku,
        name: updateVariantDto.name,
        variant: updateVariantDto.variant,
      }
    });

    // 3. Ghi lại Audit Log
    this.eventEmitter.emit('variant.update', {
      id: adminId,
      action: 'UPDATE',
      entity: 'ProductVariant',
      entityId: variantId,
      oldValue: oldVariant,        
      newValue: newVariant,   
      tx: this.prisma
    });
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


  async remove(id: string, adminId: string) {
    const oldProduct = await this.findOne(id); 
    this.eventEmitter.emit('variant.created', {
      id: adminId,
      action: 'DELETE',
      entity: 'Product',
      entityId: id,
      oldValue: oldProduct,        
      newValue: null,   
      tx: this.prisma
    });
    return this.prisma.product.delete({
      where: { id },
    });
  }

  async removeVariant(id: string, adminId: string) {
    const oldVariant = await this.findOneVariant(id);
    this.eventEmitter.emit('variant.created', {
      id: adminId,
      action: 'DELETE',
      entity: 'ProductVariant',
      entityId: id,
      oldValue: oldVariant,        
      newValue: null,   
      tx: this.prisma
    });
    return this.prisma.productVariant.delete({
      where: {id},
    })
  }
}