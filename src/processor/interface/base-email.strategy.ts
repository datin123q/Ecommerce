import { MailerService } from "@nestjs-modules/mailer";
import { EmailStrategy, BaseEmailPayload } from "./email-strategy.interface";
import * as fs from 'fs';
import * as path from 'path';
import * as hbs from 'handlebars';

export abstract class BaseEmailStrategy<T extends BaseEmailPayload> implements EmailStrategy<T> {
    constructor(protected readonly mailerService: MailerService) {}

    protected renderTemplate(templateName: string, context: Record<string, any>): string {
        const filePath = path.join(process.cwd(), 'dist', 'processor', 'templates', `${templateName}.hbs`);
        const source = fs.readFileSync(filePath, 'utf8');
        return hbs.compile(source)(context);
    }

    abstract send(payload: T): Promise<void>;
}