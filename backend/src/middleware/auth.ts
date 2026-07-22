import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface AuthedRequest extends Request {
  userId?: string;
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: '30d' });
}

/** Exige un JWT válido en Authorization: Bearer. */
export function authRequired(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Sesión requerida.' });
    return;
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub?: string };
    if (!payload.sub) throw new Error('sin sub');
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Sesión inválida o expirada.' });
  }
}

/** Igual que authRequired pero sin rechazar: deja userId si hay token válido. */
export function authOptional(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token) {
    try {
      const payload = jwt.verify(token, config.jwtSecret) as { sub?: string };
      if (payload.sub) req.userId = payload.sub;
    } catch {
      /* token inválido: se trata como anónimo */
    }
  }
  next();
}
