import { Module } from "@nestjs/common";
import { TasksService } from "./tasks.service";
import { DatabaseModule } from "../../database/database.module";
import { TasksController } from "./tasks.controller";
import { MailProcessor } from '../../processor/mails.processor';
import { BullModule } from '@nestjs/bullmq';

@Module({
    imports: [DatabaseModule, BullModule.registerQueue({name: 'mail-queue'})],
    providers: [TasksService, MailProcessor],
    controllers: [TasksController],
}) export class TasksModule{}