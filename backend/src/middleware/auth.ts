import type { NextFunction, Request, Response } from 'express';
import type { User as PrismaUser } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

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

export function setUpUser(request: Request, user: PrismaUser): void {
  request.user = {
    id: user.id,
    googleId: user.googleId,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
  };
  request.session.userId = user.id;
}

export async function restoreUser(request: Request, _response: Response, next: NextFunction): Promise<void> {
  const userId = request.session.userId;
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      request.user = {
        id: user.id,
        googleId: user.googleId,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
      };
    }
  }
  next();
}

export function requireAuthenticatedUser(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (!request.user) {
    response.status(401).json({ error: 'Authentication is required.' });
    return;
  }
  next();
}

export function getAuthenticatedUserId(request: Request): string {
  if (!request.user) {
    throw new Error('Authenticated user is required.');
  }
  return request.user.id;
}
