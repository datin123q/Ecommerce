import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MailerService } from '@nestjs-modules/mailer';

@Processor('mail-queue',{
  concurrency: 10, 
})
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

    constructor(private readonly mailerService: MailerService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`[Worker] Bắt đầu xử lý Job: ${job.name}`);
    console.log(job.data);

    switch (job.name) {
      case 'forgot-password': 
        await this.mailerService.sendMail({
        to: job.data.email,
        subject: '[E-Commerce] Khôi phục mật khẩu',
        html: `
            <h3>Yêu cầu khôi phục mật khẩu</h3>
            <p>Bạn đã yêu cầu đặt lại mật khẩu. Vui lòng click vào link bên dưới để tạo mật khẩu mới:</p>
            <a href="${job.data.resetUrl}" target="_blank">Đặt lại mật khẩu</a>
            <p>Link này sẽ hết hạn trong 15 phút.</p>
            <p>Nếu bạn không yêu cầu, vui lòng bỏ qua email này.</p>
        `,
        });
        break;
      case 'verify-account':
        await this.mailerService.sendMail({
          to: job.data.email,
          subject: '[E-Commerce] Xác thực tài khoản',
          html: `
            <h3>Yêu cầu xác thực tài khoản</h3>
            <p>Bạn đã yêu cầu xác thực tài khoản. Vui lòng click vào link bên dưới để xác thực tài khoản:</p>
            <a href="${job.data.verifyUrl}" target="_blank">Xác thực tài khoản</a>
            <p>Link này sẽ hết hạn trong 15 phút.</p>
            <p>Nếu bạn không yêu cầu, vui lòng bỏ qua email này.</p>
        `,
        });
        break;
      case 'marketing-mail':
        await this.mailerService.sendMail({
          to: job.data.email,
          subject: '[E-Commerce] 🔥 Đừng bỏ lỡ bộ sưu tập mới tuần này!',
          html: this.generateMarketingTemplate(job.data),
        });
        break;

      default:
        this.logger.warn(`[Worker]  Bỏ qua Job vì không nhận diện được tên: ${job.name}`);
    }
  }
  private generateMarketingTemplate(data: any): string {
    const productsHtml = data.products.map(p => `
      <div style="margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
        <h4 style="margin: 0 0 5px 0;">${p.name}</h4>
        <p style="margin: 0; color: #e74c3c; font-weight: bold;">${p.price.toLocaleString('vi-VN')} đ</p>
      </div>
    `).join('');

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
        <h2 style="color: #333;">Chào ${data.fullName},</h2>
        <p>Tuần này E-Commerce có những sản phẩm mới cực hot dành riêng cho bạn:</p>
        
        <div style="background: #f9f9f9; padding: 15px; border-radius: 8px;">
          ${productsHtml}
        </div>

        <div style="text-align: center; margin-top: 20px;">
          <a href="http://localhost:5173/products" style="background: #3498db; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            Mua Sắm Ngay
          </a>
        </div>

        <hr style="margin-top: 30px; border: none; border-top: 1px solid #ddd;" />
        <p style="font-size: 12px; color: #999; text-align: center;">
          Nếu bạn không muốn nhận email quảng cáo nữa, vui lòng 
          <a href="http://localhost:5173/unsubscribe?user=${data.userId}" style="color: #999;">Hủy đăng ký (Unsubscribe)</a>.
        </p>
      </div>
    `;
  }
}