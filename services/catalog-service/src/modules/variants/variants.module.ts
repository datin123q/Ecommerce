import { Module } from '@nestjs/common';
import { ServiceTokenGuard } from './service-token.guard';
import { VariantsController } from './variants.controller';
import { VariantsService } from './variants.service';

@Module({
  controllers: [VariantsController],
  providers: [VariantsService, ServiceTokenGuard],
  exports: [VariantsService],
})
export class VariantsModule {}
