import { BadRequestException } from '@nestjs/common';
import type { Inventory } from '@prisma/client';
import type { CartWithItems } from '../orders.service';

export class InventoryAllocation {
  static allocate(cartItems: CartWithItems['cartItems'], inventories: Inventory[]) {
    const stockMap = new Map<string, number>();
    for (const inv of inventories) {
      const currentTotal = stockMap.get(inv.variantId) || 0;
      stockMap.set(inv.variantId, currentTotal + inv.quantity);
    }

    for (const item of cartItems) {
      const totalAvailable = stockMap.get(item.variantId) || 0;
      if (totalAvailable < item.quantity) {
        throw new BadRequestException(`Sản phẩm ${item.variant.name} không đủ tồn kho trên toàn hệ thống!`);
      }
    }

    const orderItemsData: { variantId: string; inventoryId: string; quantity: number; price: number }[] = [];
    const mutableInventories = inventories.map(inv => ({ ...inv }));

    for (const item of cartItems) {
      let remainingNeeded = item.quantity;
      const productPrice = item.variant.product.price;

      for (const inv of mutableInventories) {
        if (inv.variantId === item.variantId && inv.quantity > 0) {
          const takeFromThisWarehouse = Math.min(inv.quantity, remainingNeeded);

          // Đẩy trực tiếp vào mảng OrderItem
          orderItemsData.push({
            variantId: item.variantId,
            inventoryId: inv.id,      
            quantity: takeFromThisWarehouse, 
            price: productPrice           
          });

          inv.quantity -= takeFromThisWarehouse; 
          remainingNeeded -= takeFromThisWarehouse;

          if (remainingNeeded === 0) break; 
        }
      }
    }

    return orderItemsData; 
  }
}