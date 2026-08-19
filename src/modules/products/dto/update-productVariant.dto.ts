import { PartialType } from '@nestjs/swagger';
import { CreateProductVariantDto } from './create-product.dto';

export class UpdateProductVariantDto extends PartialType(CreateProductVariantDto) {}