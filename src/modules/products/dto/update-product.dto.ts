import { PartialType, PickType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';

export class UpdateProductDto extends PartialType(
  PickType(CreateProductDto, ['name', 'description'] as const)
) {}