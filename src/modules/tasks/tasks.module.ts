import { Module } from "@nestjs/common";
import { TasksService } from "./tasks.service";
import { DatabaseModule } from "../../database/database.module";
import { BullModule } from '@nestjs/bullmq';

@Module({
    imports: [DatabaseModule, BullModule.registerQueue({name: 'mail-queue'})],
    providers: [TasksService],
    exports: [TasksService],
}) export class TasksModule{}
