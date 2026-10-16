import { Module } from '@nestjs/common';
import { CatalogClientService } from './catalog-client.service';

@Module({
  providers: [CatalogClientService],
  exports: [CatalogClientService],
})
export class CatalogClientModule {}