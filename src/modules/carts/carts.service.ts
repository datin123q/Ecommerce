import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class CartsService {
  constructor(private readonly prisma: PrismaService, private readonly eventEmitter: EventEmitter2 ) {}

  // Lấy giỏ hàng của User 
  async getMyCart(userId: string) {
    let cart = await this.prisma.db.cart.findFirst({
      where: { userId },
      include: {
        cartItems: {
          include: {
            variant: {
              include: { product: true }, // Lấy kèm thông tin tên SP và giá
            },
          },
        },
      },
    });

    // Nếu user chưa có giỏ hàng -> Khởi tạo giỏ hàng rỗng
    if (!cart) {
      cart = await this.prisma.db.cart.create({
        data: { userId },
        include: { cartItems: { include: { variant: { include: { product: true } } } } },
      });
    }
    return cart;
  }

  // Thêm sản phẩm vào giỏ
  async addToCart(userId: string, addToCartDto: AddToCartDto) {
    const { variantId, quantity } = addToCartDto;

    const variant = await this.prisma.db.productVariant.findUnique({ where: { id: variantId }, include: {product:true} });
    if (!variant) throw new NotFoundException('Sản phẩm không tồn tại');

    const cart = await this.getMyCart(userId);

    const cartItem = await this.prisma.db.cartItem.upsert({
      where: {
        cartId_variantId: {
          cartId: cart.id,
          variantId,
        },
      },
      update: {
        quantity: {
          increment: quantity,
        },
      },
      create: {
        cartId: cart.id,
        variantId,
        quantity,
      },
    });

    this.eventEmitter.emit('cartItem.created', {
      userId: userId,
      content: `Đã thêm ${variant.name} x ${quantity} vào giỏ hàng`
    });

    return cartItem;
  }

  // Xóa 1 mặt hàng khỏi giỏ
  async removeCartItem(userId: string, cartItemId: string) {
    // Đảm bảo item này thuộc về giỏ hàng của user đang đăng nhập
    const cart = await this.getMyCart(userId);
    
    const item = await this.prisma.db.cartItem.findFirst({
      where: { id: cartItemId, cartId: cart.id }, include: {variant:true}
    });

    if (!item) throw new NotFoundException('Không tìm thấy sản phẩm trong giỏ của bạn');
    this.eventEmitter.emit('cartItem.delete', {
      userId: userId,
      content: `Xóa ${item.variant.name} khỏi giỏ hàng`
    });
    return this.prisma.db.cartItem.delete({
      where: { id: cartItemId },
    });
  }
}