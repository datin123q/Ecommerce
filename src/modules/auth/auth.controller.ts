import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyAccountDto } from './dto/verify-account.dto';
import { LoginDto } from './dto/login.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'; 
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Đăng ký tài khoản mới' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Đăng nhập hệ thống' })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: any,
  ) {
    const tokens = await this.authService.login(loginDto);
    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/api/v1/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return {
      message: 'Đăng nhập thành công',
      data: {
        accessToken: tokens.accessToken,
        user: tokens.user,
      },
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy thông tin tài khoản đang đăng nhập' })
  getProfile(@CurrentUser() user: any) {
    return {
      message: 'Lấy thông tin thành công',
      user: user,
    };
  }
  
@Post('refresh')
@ApiOperation({ summary: 'Cấp lại Access Token mới' })
async refresh(@Req() req: any) {
  const refreshToken = req.cookies?.refresh_token;

  if (!refreshToken) {
    throw new UnauthorizedException('Không tìm thấy refresh token');
  }

  return this.authService.refreshToken(refreshToken);
}

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth() 
  @ApiOperation({ summary: 'Đăng xuất tài khoản' })
  async logout(
    @Req() request: any,
    @Res({ passthrough: true }) res: any ,
  ) {
    const userId = request.user.id; 
    
    await this.authService.logout(userId);

    res.clearCookie('refresh_token', {
      path: '/api/v1/auth/refresh',
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
    });

    return { message: 'Đăng xuất thành công' };
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Đăng nhập google' })
  async googleAuth() {
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() request: any, @Res() res: any) { 
    const tokens = await this.authService.validateSocialLogin(request.user);
    const frontendUrl = 'http://localhost:5173';
    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true, 
      secure: false, 
      sameSite: 'lax', 
      maxAge: 7 * 24 * 60 * 60 * 1000, 
    });
    return res.redirect(
      `${frontendUrl}/login-success?accessToken=${tokens.accessToken}`
    );
  }

  @Get('facebook')
  @UseGuards(AuthGuard('facebook'))
  @ApiOperation({ summary: 'Đăng nhập facebook' })
  async facebookAuth() {
  }

  @Get('facebook/callback')
  @UseGuards(AuthGuard('facebook'))
  async facebookAuthRedirect(@Req() request: any) { 
    const tokens = await this.authService.validateSocialLogin(request.user);
    return {
      message: 'Đăng nhập Facebook thành công!',
      data: tokens
    };
  }

  @Get('twitter')
  @UseGuards(AuthGuard('twitter'))
  @ApiOperation({ summary: 'Đăng nhập X' })
  async twitterAuth() {
  }

  @Get('twitter/callback')
  @UseGuards(AuthGuard('twitter'))
  async twitterAuthRedirect(@Req() request: any) { 
    const tokens = await this.authService.validateSocialLogin(request.user);
    return {
      message: 'Đăng nhập X thành công!',
      data: tokens
    };
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Gửi link khôi phục mật khẩu qua email' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Đặt lại mật khẩu bằng Token' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Post('verify-user')
  @UseGuards(JwtAuthGuard) 
  @ApiBearerAuth() 
  @ApiOperation({ summary: 'Gửi link xác thực qua email' })
  userVerified( @CurrentUser() user: any) {
    return this.authService.userVerified(user.id);
  }

  @Post('verify-account')
  @UseGuards(JwtAuthGuard) 
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xác thực tài khoản bằng Token' })
  verifyAccount(@Body() dto: VerifyAccountDto) {
    return this.authService.verifyAccount(dto.token);
  }
  
}