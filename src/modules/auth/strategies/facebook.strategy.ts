import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-facebook';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  constructor(private configService: ConfigService) {
    super({
      clientID: configService.getOrThrow<string>('FACEBOOK_APP_ID'),
      clientSecret: configService.getOrThrow<string>('FACEBOOK_APP_SECRET'),
      callbackURL: configService.getOrThrow<string>('FACEBOOK_CALLBACK_URL'),
      scope: 'email',
      profileFields: ['emails', 'name', 'photos'], 
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: Profile, done: any) {
    const { name, emails, photos } = profile;
    console.log(profile);
    if(name){
    const user = {
      email: emails && emails[0] ? emails[0].value : null,
      fullName: `${name.familyName || ''} ${name.givenName || ''} `.trim(),
      avatar: photos && photos[0] ? photos[0].value : null,
    };
    done(null, user);}
  }
}