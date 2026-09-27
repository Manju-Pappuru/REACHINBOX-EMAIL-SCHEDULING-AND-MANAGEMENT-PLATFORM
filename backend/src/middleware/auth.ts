import type { NextFunction, Request, Response } from 'express';

export function requireAuthenticatedUser(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (!request.isAuthenticated() || !request.user) {
    response.status(401).json({ error: 'Authentication is required.' });
    return;
  }
  next();
}

export function getAuthenticatedUserId(request: Request): string {
  if (!request.isAuthenticated() || !request.user) {
    throw new Error('Authenticated user is required.');
  }
  return request.user.id;
}
