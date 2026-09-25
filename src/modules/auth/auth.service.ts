import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { User } from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { JwtSignOptions } from '@nestjs/jwt';

const TOKEN_EXPIRATION_MS = 15 * 60 * 1000; // 15 phút
const MAIL_QUEUE_NAME = 'mail-queue';
const JOB_VERIFY_ACCOUNT = 'verify-account';
const JOB_FORGOT_PASSWORD = 'forgot-password';
interface JwtPayload {
  sub: string;
  email: string;
  role: User['role'];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectQueue(MAIL_QUEUE_NAME) private readonly mailQueue: Queue,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, password, fullName } = registerDto;
    const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=random&color=fff&size=256`;
    
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new BadRequestException('Email này đã được sử dụng');
    }

    const hashedPassword = await argon2.hash(password);
    const newUser = await this.usersService.create({
      email,
      password: hashedPassword,
      fullName,
      avatar: defaultAvatar,
    });

    return this.sanitizeUserResponse(newUser);
  }

  async requestVerification(id: string) {
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new NotFoundException('Người dùng không tồn tại!');
    }
    
    const { rawToken, hashedToken } = this.generateCryptoToken();
    
    await this.usersService.updateUser(id, {
      verifyToken: hashedToken,
      verifyExpires: new Date(Date.now() + TOKEN_EXPIRATION_MS),
    });

    const verifyUrl = `${this.getFrontendUrl()}/verify?token=${rawToken}`; 
    
    await this.mailQueue.add(
      JOB_VERIFY_ACCOUNT, 
      { email: user.email, verifyUrl },
      { removeOnComplete: true, attempts: 3 },
    );

    return { message: 'Link xác thực đã được gửi!' };
  }

  async verifyAccount(token: string) {
    const hashedToken = this.hashToken(token);
    const user = await this.usersService.findByValidVerifyToken(hashedToken);
    
    if (!user) {
      throw new BadRequestException('Token không hợp lệ hoặc đã hết hạn!');
    }

    await this.usersService.updateUser(user.id, {
      isVerified: true,
      verifyToken: null,
      verifyExpires: null,
    });

    return { message: 'Xác thực thành công!' };
  }

  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new NotFoundException('Email không tồn tại!');
    }

    const { rawToken, hashedToken } = this.generateCryptoToken();

    await this.usersService.updateUser(user.id, {
      resetPasswordToken: hashedToken, 
      resetPasswordExpires: new Date(Date.now() + TOKEN_EXPIRATION_MS),
    });

    const resetUrl = `${this.getFrontendUrl()}/reset-password?token=${rawToken}`;
    
    await this.mailQueue.add(
      JOB_FORGOT_PASSWORD, 
      { email: user.email, resetUrl },
      { removeOnComplete: true, attempts: 3 },
    );

    return { message: 'Link khôi phục đã được gửi!' };
  } 

  async resetPassword(token: string, newPassword: string) {
    const hashedToken = this.hashToken(token);
    const user = await this.usersService.findByValidResetToken(hashedToken);

    if (!user) {
      throw new BadRequestException('Token không hợp lệ hoặc đã hết hạn!');
    }

    const hashedPassword = await argon2.hash(newPassword);

    await this.usersService.updateUser(user.id, {
      password: hashedPassword,
      resetPasswordToken: null,
      resetPasswordExpires: null,
    });

    return { message: 'Đặt lại mật khẩu thành công!' };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.usersService.findByEmail(email);
    if (!user || !user.password) {
      throw new BadRequestException('Email hoặc mật khẩu không đúng');
    }
    
    const isPasswordValid = await argon2.verify(user.password, password);
    if (!isPasswordValid) {
      throw new BadRequestException('Email hoặc mật khẩu không đúng');
    }

    return this.generateTokens(user);
  }

  async validateSocialLogin(socialUser: { email: string; fullName: string; provider: string; providerId: string; avatar: string }) {
    let user = await this.usersService.findByEmail(socialUser.email);

    if (!user) {
      const randomPassword = crypto.randomBytes(16).toString('hex');
      const hashedPassword = await argon2.hash(randomPassword);

      user = await this.usersService.create({
        email: socialUser.email,
        password: hashedPassword,
        fullName: socialUser.fullName,
        avatar: socialUser.avatar,
      });
    }
    return this.generateTokens(user);
  }

  async refreshToken(providedRefreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(providedRefreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh Token không hợp lệ hoặc đã hết hạn!');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Tài khoản không tồn tại hoặc đã bị đăng xuất');
    }

    const isRefreshTokenValid = await argon2.verify(user.refreshToken, providedRefreshToken);
    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Refresh Token không hợp lệ hoặc đã bị thu hồi');
    }

    return this.generateTokens(user);
  }

  async logout(userId: string) {
    await this.usersService.updateRefreshToken(userId, null);
    return { message: 'Đăng xuất thành công' };
  }

  private generateCryptoToken() {
    const rawToken = crypto.randomBytes(16).toString('hex');
    const hashedToken = this.hashToken(rawToken);
    return { rawToken, hashedToken };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private getFrontendUrl(): string {
    return this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
  }

  private sanitizeUserResponse(user: User) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      avatar: user.avatar,
    };
  }

  private async generateTokens(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN') as JwtSignOptions['expiresIn'],
    });

    const hashedRefreshToken = await argon2.hash(refreshToken);
    await this.usersService.updateRefreshToken(user.id, hashedRefreshToken);
    
    return {
      accessToken,
      refreshToken,
      user: this.sanitizeUserResponse(user),
    };
  }
}