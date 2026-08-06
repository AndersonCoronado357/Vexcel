import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { User } from '../models/user.model.js';
import { effectivePlan } from '../services/plan.service.js';
import {
  authOptional,
  authRequired,
  clearSessionCookie,
  setSessionCookie,
  signToken,
  type AuthedRequest
} from '../middleware/auth.js';
import { isDbConnected } from '../db.js';
import { config, googleConfigured } from '../config.js';
import { sendMail, resetPasswordEmail } from '../services/mail.service.js';

export const authRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Proveedores de login disponibles (público, sin BD). Va antes del guard de BD. */
authRouter.get('/auth/providers', (_req, res) => {
  res.json({ google: googleConfigured() });
});

/** Cierra sesión: borra la cookie httpOnly. Público (no necesita BD). */
authRouter.post('/auth/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

function publicUser(u: {
  id?: unknown;
  _id?: unknown;
  name: string;
  email: string;
  plan: string;
  avatar?: string;
  themePref?: 'light' | 'dark' | null;
  planUntil?: Date | null;
  autoRenew?: boolean;
}) {
  return {
    id: String(u.id ?? u._id),
    name: u.name,
    email: u.email,
    plan: u.plan,
    avatar: u.avatar ?? '',
    themePref: u.themePref ?? null,
    planUntil: u.planUntil ?? null,
    autoRenew: u.autoRenew ?? false
  };
}

authRouter.use((_req, res, next) => {
  if (!isDbConnected()) {
    res.status(503).json({ error: 'No hay conexión con la base de datos.' });
    return;
  }
  next();
});

authRouter.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body ?? {};
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      res.status(400).json({ error: 'Escribe tu nombre.' });
      return;
    }
    if (!EMAIL_RE.test(email ?? '')) {
      res.status(400).json({ error: 'Correo inválido.' });
      return;
    }
    if (typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ error: 'La contraseña debe tener mínimo 8 caracteres.' });
      return;
    }
    const exists = await User.findOne({ email: email.toLowerCase().trim() });
    if (exists) {
      res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
      return;
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name: name.trim(), email, passwordHash });
    setSessionCookie(res, signToken(user.id));
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error('[auth/register]', err);
    res.status(500).json({ error: 'No se pudo crear la cuenta.' });
  }
});

authRouter.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    const user = await User.findOne({ email: String(email ?? '').toLowerCase().trim() });
    const ok = user && (await bcrypt.compare(String(password ?? ''), user.passwordHash));
    if (!ok || !user) {
      res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
      return;
    }
    setSessionCookie(res, signToken(user.id));
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'No se pudo iniciar sesión.' });
  }
});

/**
 * Solicita restablecer la contraseña: genera un token, guarda su hash (1 h) y
 * envía el enlace por correo (Resend). Siempre responde ok, sin filtrar si el
 * correo existe. Si no hay correo configurado, imprime el enlace en consola.
 */
authRouter.post('/auth/recover', async (req, res) => {
  const email = String(req.body?.email ?? '').toLowerCase().trim();
  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: 'Correo inválido.' });
    return;
  }
  const user = await User.findOne({ email });
  if (user) {
    const raw = crypto.randomBytes(32).toString('hex');
    user.resetTokenHash = crypto.createHash('sha256').update(raw).digest('hex');
    user.resetTokenExp = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();
    const link = `${config.appUrl}/restablecer?token=${raw}&e=${encodeURIComponent(email)}`;
    const { subject, html } = resetPasswordEmail(user.name, link);
    const sent = await sendMail({ to: email, subject, html });
    if (!sent) console.log(`[auth/recover] Enlace para ${email}: ${link}`);
  }
  res.json({ ok: true });
});

/** Fija una nueva contraseña con el token del correo y deja la sesión iniciada. */
authRouter.post('/auth/reset', async (req, res) => {
  const email = String(req.body?.email ?? '').toLowerCase().trim();
  const token = String(req.body?.token ?? '');
  const password = req.body?.password;
  if (!EMAIL_RE.test(email) || !token) {
    res.status(400).json({ error: 'Enlace inválido.' });
    return;
  }
  if (typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ error: 'La contraseña debe tener mínimo 8 caracteres.' });
    return;
  }
  const user = await User.findOne({ email });
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const valid =
    user &&
    user.resetTokenHash &&
    user.resetTokenHash === hash &&
    user.resetTokenExp &&
    user.resetTokenExp.getTime() > Date.now();
  if (!user || !valid) {
    res.status(400).json({ error: 'El enlace no es válido o ya venció. Solicita uno nuevo.' });
    return;
  }
  user.passwordHash = await bcrypt.hash(password, 10);
  user.resetTokenHash = null;
  user.resetTokenExp = null;
  await user.save();
  setSessionCookie(res, signToken(user.id));
  res.json({ user: publicUser(user) });
});

authRouter.get('/auth/me', authRequired, async (req: AuthedRequest, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: 'Cuenta no encontrada.' });
    return;
  }
  // Degradación perezosa: si el plan de pago venció, se persiste a Free.
  const eff = effectivePlan(user);
  if (eff !== user.plan) {
    user.plan = eff;
    user.planUntil = null;
    await user.save();
  }
  res.json({ user: publicUser(user) });
});

/**
 * Estado de sesión para hidratar el frontend al arrancar (lee la cookie
 * httpOnly). Devuelve el usuario o null; nunca 401, para no ensuciar la consola.
 */
authRouter.get('/auth/session', authOptional, async (req: AuthedRequest, res) => {
  if (!req.userId) {
    res.json({ user: null });
    return;
  }
  const user = await User.findById(req.userId);
  if (!user) {
    res.json({ user: null });
    return;
  }
  const eff = effectivePlan(user);
  if (eff !== user.plan) {
    user.plan = eff;
    user.planUntil = null;
    await user.save();
  }
  res.json({ user: publicUser(user) });
});
