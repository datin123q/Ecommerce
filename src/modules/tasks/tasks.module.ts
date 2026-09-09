import { Module } from "@nestjs/common";
import { TasksService } from "./tasks.service";
import { DatabaseModule } from "src/database/database.module";
import { TasksController } from "./tasks.controller";


@Module({
    imports: [DatabaseModule],
    providers: [TasksService],
    controllers: [TasksController],
}) export class TasksModule{}