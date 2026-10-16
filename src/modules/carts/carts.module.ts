import { Module } from '@nestjs/common';
import { CartsService } from './carts.service';
import { CartsController } from './carts.controller';
import { DatabaseModule } from '../../database/database.module';
import { CatalogClientModule } from '../catalog/catalog-client.module';

@Module({
  imports: [DatabaseModule, CatalogClientModule],
  controllers: [CartsController],
  providers: [CartsService],
  exports:[CartsService]
})
export class CartsModule {}