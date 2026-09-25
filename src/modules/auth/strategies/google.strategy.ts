import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly configService: ConfigService) {
    super({
      clientID: configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow<string>('GOOGLE_CALLBACK_URL'), 
      scope: ['email', 'profile'],
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: Profile, done: VerifyCallback): Promise<any> {
    const { id, emails, displayName, photos } = profile;
    if (!emails?.[0]?.value) {
      return done(null, false);
    }
    console.log(profile);
    const user = {
      provider: 'google',
      providerId: id,
      email: emails[0].value,
      fullName: displayName,
      avatar: photos?.[0]?.value ?? '', 
    };

    done(null, user);
  }
}