import { Injectable } from "@nestjs/common";
import { MailerService } from "@nestjs-modules/mailer";
import { BaseEmailPayload } from "../interface/email-strategy.interface";
import { BaseEmailStrategy } from "../interface/base-email.strategy";

export interface VerifyAccountPayload extends BaseEmailPayload {
  verifyUrl: string; 
}

@Injectable() 
export class VerifyAccountStrategy extends BaseEmailStrategy<VerifyAccountPayload> {
    constructor( mailerService: MailerService) {super(mailerService)}

    async send(payload: VerifyAccountPayload): Promise<void> {
        await this.mailerService.sendMail({
            to: payload.email, 
            subject: '[E-Commerce] Xác thực tài khoản!',
            html: this.renderTemplate('verify-account', { 
                verifyUrl: payload.verifyUrl 
            })
        });
    }
}
