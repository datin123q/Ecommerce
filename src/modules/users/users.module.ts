import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { DatabaseModule } from '../../database/database.module';
import { UploadModule } from '../upload/upload.module';
import { UsersResolver } from './graphql/users.resolver';


@Module({
  imports: [ DatabaseModule, UploadModule,],
  providers: [UsersService, UsersResolver],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
