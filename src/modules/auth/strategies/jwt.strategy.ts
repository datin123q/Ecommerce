import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      // Lấy token từ header Authorization: Bearer <token>
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false, // Quăng lỗi nếu token hết hạn
      secretOrKey: process.env.JWT_ACCESS_SECRET || 'access_secret',
    });
  }

  // Nếu token hợp lệ, hàm này sẽ chạy.
  async validate(payload: any) {
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}