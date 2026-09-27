import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

import { prisma } from '../lib/prisma.js';

declare global {
  namespace Express {
    interface User {
      id: string;
      googleId: string;
      name: string;
      email: string;
      avatar: string | null;
    }
  }
}

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const callbackUrl = process.env.GOOGLE_CALLBACK_URL;

export const googleOAuthConfigured = Boolean(clientId && clientSecret && callbackUrl);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user ?? false);
  } catch (error) {
    done(error);
  }
});

if (googleOAuthConfigured) {
  passport.use(new GoogleStrategy(
    {
      clientID: clientId!,
      clientSecret: clientSecret!,
      callbackURL: callbackUrl!,
      scope: ['profile', 'email'],
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value?.toLowerCase();
        if (!email) {
          done(new Error('Google did not provide an email address.'));
          return;
        }

        const user = await prisma.user.upsert({
          where: { googleId: profile.id },
          create: {
            googleId: profile.id,
            name: profile.displayName || email,
            email,
            avatar: profile.photos?.[0]?.value,
          },
          update: {
            name: profile.displayName || email,
            email,
            avatar: profile.photos?.[0]?.value,
          },
        });
        done(null, user);
      } catch (error) {
        done(error as Error);
      }
    },
  ));
}

export { passport };
