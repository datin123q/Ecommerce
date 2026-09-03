import { BadRequestException } from '@nestjs/common';

export class InventoryAllocation {
  static allocate(cartItems: any[], inventories: any[]) {
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

    const inventoryDeductions: { inventoryId: string; quantity: number }[] = [];
    const mutableInventories = inventories.map(inv => ({ ...inv }));

    for (const item of cartItems) {
      let remainingNeeded = item.quantity;
      for (const inv of mutableInventories) {
        if (inv.variantId === item.variantId && inv.quantity > 0) {
          const takeFromThisWarehouse = Math.min(inv.quantity, remainingNeeded);

          inventoryDeductions.push({
            inventoryId: inv.id,          
            quantity: takeFromThisWarehouse, 
          });

          inv.quantity -= takeFromThisWarehouse; 
          remainingNeeded -= takeFromThisWarehouse;

          if (remainingNeeded === 0) break; 
        }
      }
    }

    return inventoryDeductions;
  }
}