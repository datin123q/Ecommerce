import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AddToCartDto } from './dto/add-to-cart.dto';

@Injectable()
export class CartsService {
  constructor(private readonly prisma: PrismaService) {}

  // Lấy giỏ hàng của User 
  async getMyCart(userId: string) {
    let cart = await this.prisma.cart.findFirst({
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
      cart = await this.prisma.cart.create({
        data: { userId },
        include: { cartItems: { include: { variant: { include: { product: true } } } } },
      });
    }
    return cart;
  }

  // Thêm sản phẩm vào giỏ
  async addToCart(userId: string, addToCartDto: AddToCartDto) {
    const { variantId, quantity } = addToCartDto;

    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId }, include: {product:true} });
    if (!variant) throw new NotFoundException('Sản phẩm không tồn tại');

    const cart = await this.getMyCart(userId);

    const existingCartItem = await this.prisma.cartItem.findFirst({
      where: { cartId: cart.id, variantId },
    });
    await this.prisma.notification.create({
      data: {
        userId: userId,
        content: `Thêm ${variant.product.name} vào giỏ hàng X ${quantity}`,
        isRead: false
      }
    })
    if (existingCartItem) {
      //  Cộng dồn số lượng
      return this.prisma.cartItem.update({
        where: { id: existingCartItem.id },
        data: { quantity: existingCartItem.quantity + quantity },
      });
    } else {
      // Tạo dòng mới
      return this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          variantId,
          quantity,
        },
      });
    }
  }

  // Xóa 1 mặt hàng khỏi giỏ
  async removeCartItem(userId: string, cartItemId: string) {
    // Đảm bảo item này thuộc về giỏ hàng của user đang đăng nhập
    const cart = await this.getMyCart(userId);
    
    const item = await this.prisma.cartItem.findFirst({
      where: { id: cartItemId, cartId: cart.id }, include: {variant:true}
    });

    if (!item) throw new NotFoundException('Không tìm thấy sản phẩm trong giỏ của bạn');
    await this.prisma.notification.create({
      data: {
        userId: userId,
        content: `Xóa ${item.variant.name} khỏi giỏ hàng`,
        isRead: false
      }
    })
    return this.prisma.cartItem.delete({
      where: { id: cartItemId },
    });
  }
}