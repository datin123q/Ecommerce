import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';

@Module({
  imports: [ConfigModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
