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

    // 1. Kiểm tra xem biến thể có tồn tại không
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new NotFoundException('Sản phẩm không tồn tại');

    // 2. Đảm bảo user đã có giỏ hàng
    const cart = await this.getMyCart(userId);

    // 3. Kiểm tra xem mặt hàng này đã có trong giỏ chưa
    const existingCartItem = await this.prisma.cartItem.findFirst({
      where: { cartId: cart.id, variantId },
    });

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
      where: { id: cartItemId, cartId: cart.id },
    });

    if (!item) throw new NotFoundException('Không tìm thấy sản phẩm trong giỏ của bạn');

    return this.prisma.cartItem.delete({
      where: { id: cartItemId },
    });
  }
}