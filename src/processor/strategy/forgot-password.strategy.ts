import { Injectable } from "@nestjs/common";
import { MailerService } from "@nestjs-modules/mailer";
import { BaseEmailPayload } from "../interface/email-strategy.interface";
import { BaseEmailStrategy } from "../interface/base-email.strategy";

export interface ForgotPasswordPayload extends BaseEmailPayload {
  resetUrl: string; 
}

@Injectable() 
export class ForgotPasswordStrategy extends BaseEmailStrategy<ForgotPasswordPayload> {
    constructor( mailerService: MailerService) {super(mailerService)}

    async send(payload: ForgotPasswordPayload): Promise<void> {
        await this.mailerService.sendMail({
            to: payload.email, 
            subject: '[E-Commerce] Khôi phục mật khẩu!',
            html: this.renderTemplate('forgot-password', { 
                resetUrl: payload.resetUrl 
            })
        });
    }
}
