import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RedisCacheService } from '../../redis/redisCache.service';

@Injectable()
export class CartsService {
  constructor(private readonly prisma: PrismaService, private readonly eventEmitter: EventEmitter2, private readonly cacheService: RedisCacheService ) {}

  async getMyCart(userId: string) {
    const cacheKey = `cart_${userId}_v`;
    const cachedCarts = await this.cacheService.get<any>(cacheKey);
    if (cachedCarts) {
      return cachedCarts;
    }
    let cart = await this.prisma.db.cart.findFirst({
      where: { userId },
      include: {
        cartItems: {
          include: {
            variant: {
              include: { product: true }, 
            },
          },
        },
      },
    });

    if (!cart) {
      cart = await this.prisma.db.cart.create({
        data: { userId },
        include: { cartItems: { include: { variant: { include: { product: true } } } } },
      });
    }
    await this.cacheService.set(cacheKey, cart);
    return cart;
  }

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
    const cacheKey = `cart_${userId}_v`;
    await this.cacheService.del(cacheKey);
    return cartItem;
  }

  async removeCartItem(userId: string, cartItemId: string) {
    const cart = await this.getMyCart(userId);    
    const item = await this.prisma.db.cartItem.findFirst({
      where: { id: cartItemId, cartId: cart.id }, include: {variant:true}
    });

    if (!item) throw new NotFoundException('Không tìm thấy sản phẩm trong giỏ của bạn');
    this.eventEmitter.emit('cartItem.delete', {
      userId: userId,
      content: `Xóa ${item.variant.name} khỏi giỏ hàng`
    });
    const cacheKey = `cart_${userId}_v`;
    await this.cacheService.del(cacheKey);
    return this.prisma.db.cartItem.delete({
      where: { id: cartItemId },
    });
  }
}