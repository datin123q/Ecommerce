import { Injectable } from "@nestjs/common";
import { MailerService } from "@nestjs-modules/mailer";
import { BaseEmailPayload } from "../interface/email-strategy.interface";
import { BaseEmailStrategy } from "../interface/base-email.strategy";

export interface MarketingPayload extends BaseEmailPayload {
    email: string
    fullName: string,
    userId: string,
    products: [],
}

@Injectable() 
export class MarketingStrategy extends BaseEmailStrategy<MarketingPayload> {
    constructor( mailerService: MailerService) {super(mailerService)}

    async send(payload: MarketingPayload): Promise<void> {
        console.log(payload);
        await this.mailerService.sendMail({
            to: payload.email, 
            subject: '[E-Commerce] 🔥 Đừng bỏ lỡ bộ sưu tập mới tuần này!',
            html: this.renderTemplate('marketing', { 
                email: payload.email,
                fullName: payload.fullName,
                userId: payload.userId,
                products: payload.products, 
            })
        });
    }
}
