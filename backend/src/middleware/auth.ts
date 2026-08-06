import type { CookieOptions, NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface AuthedRequest extends Request {
  userId?: string;
}

/** Nombre de la cookie de sesión (httpOnly: inaccesible desde JavaScript). */
const COOKIE = 'vx_session';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: '30d' });
}

function cookieOpts(): CookieOptions {
  return {
    httpOnly: true, // el token nunca es legible por JS (mitiga robo por XSS)
    secure: process.env.NODE_ENV === 'production', // solo por HTTPS en prod
    sameSite: 'lax',
    path: '/'
  };
}

/** Escribe la sesión como cookie httpOnly (se envía sola en cada request). */
export function setSessionCookie(res: Response, token: string): void {
  res.cookie(COOKIE, token, { ...cookieOpts(), maxAge: MAX_AGE_MS });
}

/** Borra la cookie de sesión (logout). */
export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE, cookieOpts());
}

/**
 * Lee el token de la cookie httpOnly. Como respaldo acepta Authorization: Bearer
 * (para clientes de API/pruebas); el frontend usa solo la cookie.
 */
function readToken(req: Request): string {
  const raw = req.headers.cookie ?? '';
  const m = raw.match(/(?:^|;\s*)vx_session=([^;]+)/);
  if (m) return decodeURIComponent(m[1]);
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

/** Exige una sesión válida (cookie httpOnly). */
export function authRequired(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = readToken(req);
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

/** Igual que authRequired pero sin rechazar: deja userId si hay sesión válida. */
export function authOptional(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const token = readToken(req);
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
