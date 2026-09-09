import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-twitter';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TwitterStrategy extends PassportStrategy(Strategy, 'twitter') {
  constructor(private configService: ConfigService) {
    super({
      consumerKey: configService.getOrThrow<string>('TWITTER_CONSUMER_KEY'),
      consumerSecret: configService.getOrThrow<string>('TWITTER_CONSUMER_SECRET'),
      callbackURL: configService.getOrThrow<string>('TWITTER_CALLBACK_URL'),
      includeEmail: true ,
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: Profile, done: any) {
    console.log(profile);
    const user = {
      email: profile.emails && profile.emails[0] ? profile.emails[0].value : null,
      fullName: profile.displayName || profile.username,
      avatar: profile.photos && profile.photos[0] ? profile.photos[0].value : null,
    };

    done(null, user);
  }
}