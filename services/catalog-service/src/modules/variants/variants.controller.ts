import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LookupVariantsDto } from './dto/lookup-variants.dto';
import { ServiceTokenGuard } from './service-token.guard';
import { VariantsService } from './variants.service';

@ApiTags('Internal Catalog')
@Controller('internal/catalog/variants')
@UseGuards(ServiceTokenGuard)
export class VariantsController {
  constructor(private readonly variantsService: VariantsService) {}

  @Post('lookup')
  @ApiOperation({ summary: 'Tra cứu hàng loạt biến thể cho service nội bộ' })
  @ApiHeader({ name: 'x-service-token', required: true })
  lookup(@Body() body: LookupVariantsDto) {
    return this.variantsService.lookup(body.variantIds);
  }
}
