import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { DatabaseModule } from '../../database/database.module';
import { RedisInventoryService } from './redis-inventory.service';

@Module({
  imports: [DatabaseModule],
  controllers: [InventoryController],
  providers: [InventoryService, RedisInventoryService],
  exports: [InventoryService, RedisInventoryService]
})
export class InventoryModule {}