import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RedisCacheService } from '../../redis/redisCache.service';
import { Prisma } from '@prisma/client';

const cartWithItemsInclude = {
  cartItems: {
    include: { variant: { include: { product: true } } },
  },
} satisfies Prisma.CartInclude;

export type CartWithItems = Prisma.CartGetPayload<{
  include: typeof cartWithItemsInclude;
}>;

@Injectable()
export class CartsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly cacheService: RedisCacheService,
  ) {}

  public getCacheKey(userId: string): string {
    return `cart_${userId}_v`;
  }

  async getMyCart(userId: string): Promise<CartWithItems> {
    const cacheKey = this.getCacheKey(userId);

    const cachedCart = await this.cacheService.get<CartWithItems>(cacheKey);
    if (cachedCart) return cachedCart;

    const cart = await this.getOrCreateCartInDB(userId);

    await this.cacheService.set(cacheKey, cart);
    return cart;
  }

  private async getOrCreateCartInDB(userId: string): Promise<CartWithItems> {
    let cart = await this.prisma.db.cart.findFirst({
      where: { userId },
      include: cartWithItemsInclude,
    });

    if (!cart) {
      cart = await this.prisma.db.cart.create({
        data: { userId },
        include: cartWithItemsInclude,
      });
    }

    return cart as CartWithItems;
  }

  async addToCart(userId: string, { variantId, quantity }: AddToCartDto) {
    const variant = await this.prisma.db.productVariant.findUnique({
      where: { id: variantId },
      include: { product: true },
    });
    
    if (!variant) throw new NotFoundException('Sản phẩm không tồn tại');

    const cart = await this.getMyCart(userId);

    const cartItem = await this.prisma.db.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
      update: { quantity: { increment: quantity } },
      create: { cartId: cart.id, variantId, quantity },
    });

    this.emitCartEvent(
      'cartItem.created', 
      userId, 
      `Đã thêm ${variant.product.name} - ${variant.name} x ${quantity} vào giỏ hàng`
    );
    await this.cacheService.del(this.getCacheKey(userId));

    return cartItem;
  }

  async removeCartItem(userId: string, cartItemId: string) {
    const cart = await this.getMyCart(userId);
    
    const item = await this.prisma.db.cartItem.findFirst({
      where: { id: cartItemId, cartId: cart.id },
      include: { variant: { include: { product: true } } },
    });

    if (!item) throw new NotFoundException('Không tìm thấy sản phẩm trong giỏ của bạn');

    const deletedItem = await this.prisma.db.cartItem.delete({
      where: { id: cartItemId },
    });

    this.emitCartEvent(
      'cartItem.delete', 
      userId, 
      `Xóa ${item.variant.product.name} - ${item.variant.name} khỏi giỏ hàng`
    );
    await this.cacheService.del(this.getCacheKey(userId));

    return deletedItem;
  }

  async getCartForCheckout(userId: string): Promise<CartWithItems> {
    const cart = await this.prisma.db.cart.findFirst({
      where: { userId },
      include: cartWithItemsInclude,
    });

    if (!cart || cart.cartItems.length === 0) {
      throw new BadRequestException('Giỏ hàng của bạn đang trống!');
    }

    return cart as CartWithItems;
  }

  private emitCartEvent(eventName: string, userId: string, content: string): void {
    this.eventEmitter.emit(eventName, { userId, content });
  }
}