import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RedisCacheService } from '../../redis/redisCache.service';
import { Prisma } from '@prisma/client-core';
import { CatalogProductVariantClientService } from '../catalog/productvariant/catalog-productvariant-client.service';

const cartWithItemsInclude = {
  cartItems: {
    include: { variant: { include: { product: true } } },
  },
} satisfies Prisma.CartInclude;

export type CartWithItems = Prisma.CartGetPayload<{
  include: typeof cartWithItemsInclude;
}>;

export const checkoutCartSelect = {
  id: true,
  userId: true,
  
  cartItems: {
    select: {
      variantId: true,
      quantity: true,
      variant: {
        select: {
          sku: true,
          name: true,
          product: {
            select: { name: true , price: true}
          }
        }
      }
    }
  }
} satisfies Prisma.CartSelect; 

export type CheckoutCartPayload = Prisma.CartGetPayload<{
  select: typeof checkoutCartSelect
}>;

@Injectable()
export class CartsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly cacheService: RedisCacheService,
    private readonly catalogClient: CatalogProductVariantClientService,
  ) {}

  public getCacheKey(userId: string): string {
    return `cart_${userId}_v`;
  }

async getMyCart(userId: string): Promise<CartWithItems> {
    const cacheKey = this.getCacheKey(userId);
    const recentWriteKey = `cart_recently_updated:${userId}`;

    const cachedCart = await this.cacheService.get<CartWithItems>(cacheKey);
    if (cachedCart) return cachedCart;

    const justUpdated = await this.cacheService.get<string>(recentWriteKey);

    let cart: CartWithItems;

    if (justUpdated) {
      cart = (await this.prisma.masterClient.cart.findFirst({
        where: { userId },
        include: cartWithItemsInclude,
      })) as CartWithItems;
    } else {
      cart = (await this.prisma.db.cart.findFirst({
        where: { userId },
        include: cartWithItemsInclude,
      })) as CartWithItems;
    }

    if (!cart) {
      cart = await this.getOrCreateCartInDB(userId);
    }

    await this.cacheService.set(cacheKey, cart);
    return cart;
  }

  private async getOrCreateCartInDB(userId: string): Promise<CartWithItems> {
    const cart = await this.prisma.db.cart.upsert({
      where: { userId },
      update: {},
      create: { userId },
      include: { cartItems: true },
    });

    return cart as unknown as CartWithItems;
  }

  async addToCart(userId: string, { variantId, quantity }: AddToCartDto) {
    const variant = await this.prisma.db.productVariant.findUnique({
      where: { id: variantId },
      select: {
        id: true,
        name: true,
        product: {
          select: {
            name: true
          }
        }
      }
    });

    if (!variant) 
      throw new NotFoundException('Sản phẩm không tồn tại');

    const cacheKey = this.getCacheKey(userId);
    
    let cachedCart = await this.cacheService.get<CartWithItems>(cacheKey);

    if (!cachedCart) {
      cachedCart = await this.getOrCreateCartInDB(userId);
    }

    const existingItemIndex = cachedCart.cartItems.findIndex(
      (item) => item.variantId === variantId
    );

    if (existingItemIndex !== -1) {
      cachedCart.cartItems[existingItemIndex].quantity += quantity;
    } else {
      cachedCart.cartItems.push({
        id: `temp-${Date.now()}`, 
        quantity: quantity,
        cartId: cachedCart.id,
        variantId: variantId,
      } as unknown as CartWithItems['cartItems'][0]);
    }

    await this.cacheService.set(cacheKey, cachedCart, 3600000);
    await this.cacheService.setNumber(`cart_recently_updated:${userId}`, 1, 3000);

    this.emitCartEvent(
      'cartItem.created',
      userId,
      `Đã thêm ${variant.product.name} - ${variant.name} x ${quantity} vào giỏ hàng`
    );

    this.prisma.db.cartItem.upsert({
      where: { cartId_variantId: { cartId: cachedCart.id, variantId } },
      update: { quantity: { increment: quantity } },
      create: { cartId: cachedCart.id, variantId, quantity },
    }).catch(err => console.error('Lỗi đồng bộ DB:', err));

    const returnItem = existingItemIndex !== -1 
      ? cachedCart.cartItems[existingItemIndex] 
      : cachedCart.cartItems[cachedCart.cartItems.length - 1];

    return returnItem;
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
    const cart = await this.prisma.db.cart.findUnique({
      where: { userId },
      select: checkoutCartSelect,
    });

    if (!cart || cart.cartItems.length === 0) {
      throw new BadRequestException('Giỏ hàng của bạn đang trống!');
    }

    return cart as CartWithItems;
  }

  private emitCartEvent(eventName: string, userId: string, content: string): void {
    this.eventEmitter.emit(eventName, { userId, content });
  }
  private async timed<T>(
    name: string,
    action: () => Promise<T>,
  ): Promise<T> {
    const started = performance.now();
    try {
      return await action();
    } finally {
      console.log(
        `[CART_TIMING] ${name}=${(performance.now() - started).toFixed(1)}ms`,
      );
    }
  }
}
