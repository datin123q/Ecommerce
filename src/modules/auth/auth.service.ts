import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../database/prisma.service';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService, 
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    @InjectQueue('mail-queue') private readonly mailQueue: Queue,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, password, fullName } = registerDto;
    const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(registerDto.fullName)}&background=random&color=fff&size=256`;
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

    return {
      id: newUser.id,
      email: newUser.email,
      fullName: newUser.fullName,
      role: newUser.role,
      avatar: newUser.avatar,
    };
  }

  async userVerified(id: string){
    const user = await this.prisma.db.user.findUnique({
      where: {id}
    });
    if(!user){
      throw new NotFoundException('Lỗi hệ thống!');
    }
    const token = crypto.randomBytes(16).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    await this.usersService.updateUser(id, {
      verifyToken: hashedToken,
      verifyExpires: new Date(Date.now() + 15 * 60 * 1000)
    })
    const verifyUrl = `http:localhost:3000/verify?token=${token}`;
    await this.mailQueue.add('verify-account', {
      email: user.email,
      verifyUrl: verifyUrl
    },
    {
      removeOnComplete: true, 
      attempts: 3,         
    }
  );
    return { message:  'Link xác thực đã được gửi!'};
  }

  async verifyAccount(token: string){
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await this.prisma.db.user.findFirst({
      where: {
        verifyToken: hashedToken,
        verifyExpires: { gt: new Date() }, // Kiểm tra token chưa hết hạn
      },
    });
    if (!user) {
      throw new BadRequestException('Token không hợp lệ hoặc đã hết hạn!');
    }
    await this.prisma.db.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verifyToken: null,
        verifyExpires: null,
      },
    });

    return { message: 'Xác thực thành công!' };
  }

  async forgotPassword(email: string){
    const user = await this.usersService.findByEmail(email);
    if(!user){
      throw new NotFoundException('Email không tồn tại!');
    }
    const token = crypto.randomBytes(16).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    await this.usersService.updateUser(user.id, {
      resetPasswordToken: hashedToken, 
      resetPasswordExpires: new Date(Date.now() + 15 * 60 * 1000)
    });

    const resetUrl = `http:localhost:3000/reset-password?token=${token}`;
    await this.mailQueue.add('forgot-password', {
      email: user.email,
      resetUrl: resetUrl
    },
    {
    removeOnComplete: true, 
    attempts: 3,         
    }
  );

    return { message: ' Link khôi phục đã được gửi!' };
  } 

  async resetPassword(token: string, newPassword: string) {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await this.prisma.db.user.findFirst({
      where: {
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { gt: new Date() }, 
      },
    });

    if (!user) {
      throw new BadRequestException('Token không hợp lệ hoặc đã hết hạn!');
    }

    // Băm mật khẩu mới
    const hashedPassword = await argon2.hash(newPassword);

    // Cập nhật mật khẩu và xóa token
    await this.prisma.db.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
    });

    return { message: 'Đặt lại mật khẩu thành công!' };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new BadRequestException('Email hoặc mật khẩu không đúng');
    }
    const isPasswordValid = await argon2.verify(user.password, password);
    if (!isPasswordValid) {
      throw new BadRequestException('Email hoặc mật khẩu không đúng');
    }
    return this.generateTokens(user);
  }

  async validateSocialLogin(socialUser: { email: string; fullName: string; provider: string; providerId: string ; avatar: string}) {
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
    try {
      const payload = await this.jwtService.verifyAsync(providedRefreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.usersService.findById(payload.sub);

      if (!user || !user.refreshToken) {
        throw new UnauthorizedException('Tài khoản không tồn tại hoặc đã bị đăng xuất');
      }

      const isRefreshTokenValid = await argon2.verify(user.refreshToken, providedRefreshToken);
      if (!isRefreshTokenValid) {
        throw new UnauthorizedException('Refresh Token không hợp lệ hoặc đã bị thu hồi');
      }

      const tokens = await this.generateTokens(user);

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };

    } catch (error) {
      throw new UnauthorizedException('Refresh Token không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại!');
    }
  }
  async logout(userId: string) {
    await this.usersService.updateRefreshToken(userId, null);
    return { message: 'Đăng xuất thành công' };
  }

  private async generateTokens(user: any) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN') as any,
    });

    const hashedRefreshToken = await argon2.hash(refreshToken);
    await this.usersService.updateRefreshToken(user.id, hashedRefreshToken);
    // console.log(user);
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        avatar: user.avatar,
      },
    };
  }


}