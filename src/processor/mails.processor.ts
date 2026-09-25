import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EmailStrategyFactory } from './email-strategy.factory';

@Processor('mail-queue', { concurrency: 10 })
export class MailProcessor extends WorkerHost {
    private readonly logger = new Logger(MailProcessor.name);

    constructor(private readonly emailStrategyFactory: EmailStrategyFactory) {
        super();
    }

    async process(job: Job<any, void, string>): Promise<void> {
        try {
            await this.executeJob(job);
        } catch (error) { 
            this.handleJobError(job, error as Error);
        }
    }

    private async executeJob(job: Job<any, void, string>): Promise<void> {
        this.logger.log(`Bắt đầu xử lý Job: ${job.name}`);
        const emailStrategy = this.emailStrategyFactory.create(job.name);
        await emailStrategy.send(job.data);
        this.logger.log(`Xử lý Job: ${job.name} thành công!`);
    }

    private handleJobError(job: Job<any, void, string>, error: Error): never {
        this.logger.error(`Job ${job.name} thất bại: ${error.message}`);
        throw error; 
    }
}