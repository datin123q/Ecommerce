import { Injectable, Logger } from "@nestjs/common";
import { EmailStrategy } from "./interface/email-strategy.interface";
import { ForgotPasswordStrategy } from "./strategy/forgot-password.strategy";
import { VerifyAccountStrategy } from "./strategy/verify-account.strategy";
import { MarketingStrategy } from "./strategy/marketing.strategy";

@Injectable()
export class EmailStrategyFactory {
    private readonly strategies = new Map<string, EmailStrategy<any>>();

    constructor(
        private readonly forgotPwdStrategy: ForgotPasswordStrategy,
        private readonly verifyAccStrategy: VerifyAccountStrategy,
        private readonly marketingStrategy: MarketingStrategy,
    ) {
        this.strategies.set('forgot-password', this.forgotPwdStrategy);
        this.strategies.set('verify-account', this.verifyAccStrategy);
        this.strategies.set('marketing-mail', this.marketingStrategy);
    }    

    create(jobname: string): EmailStrategy<any> {
        const strategy = this.strategies.get(jobname);
        
        if (!strategy) {
            throw new Error(`[EmailStrategyFactory] Không nhận diện được loại Job: ${jobname}`);
        }
        
        return strategy;
    }
}