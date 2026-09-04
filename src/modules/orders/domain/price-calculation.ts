import { BadRequestException } from '@nestjs/common';

export class PriceCalculation {
  static calculate(
    cartItems: any[],
    voucher?: { id: string; value: number; limit: number; count: number } | null
  ) {
    let totalAmount = 0;
    
    for (const item of cartItems) {
      const productPrice = item.variant.product.price;
      totalAmount += item.quantity * productPrice;
    }

    if (voucher) {
      if (voucher.count >= voucher.limit) {
        throw new BadRequestException('Mã giảm giá đã hết lượt sử dụng');
      }
      const discount = Math.min(voucher.value, totalAmount);
      totalAmount -= discount;
    }

    return {
      totalAmount,
      appliedVoucherId: voucher?.id,
      voucherLimit: voucher?.limit
    };
  }
}