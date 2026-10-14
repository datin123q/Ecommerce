import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { DatabaseModule } from '../../database/database.module';
import { RedisInventoryService } from './redis-inventory.service';

@Module({
  imports: [DatabaseModule],
  providers: [InventoryService, RedisInventoryService],
  exports: [InventoryService, RedisInventoryService]
})
export class InventoryModule {}
