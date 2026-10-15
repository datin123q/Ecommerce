import { Module } from "@nestjs/common";
import { TasksService } from "./tasks.service";
import { DatabaseModule } from "../../database/database.module";
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from "@bull-board/nestjs";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";

@Module({
    imports: [DatabaseModule, BullModule.registerQueue({name: 'mail-queue'}),    
        BullBoardModule.forFeature({
          name: 'mail-queue',
          adapter: BullMQAdapter, 
        }),],
    providers: [TasksService],
    exports: [TasksService],
}) export class TasksModule{}
