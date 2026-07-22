import { Router } from 'express';
import sharp from 'sharp';
import { PLANS, User, type Plan, type UserDoc } from '../models/user.model.js';
import { effectivePlan } from '../services/plan.service.js';
import { wompiConfigured } from '../config.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { isDbConnected } from '../db.js';

/** Descargas Full HD (o mejores) al mes en el plan Free. */
export const FREE_FULLHD_LIMIT = 5;

export type PngQuality = 'normal' | 'fullhd' | '2k' | '4k';

/** Descargas Full HD usadas en el mes en curso. */
export function fullHdUsage(user: Pick<UserDoc, 'usageMonth' | 'usageCount'>): number {
  const month = new Date().toISOString().slice(0, 7);
  return user.usageMonth === month ? user.usageCount : 0;
}

/**
 * Calidad máxima por plan. Todos los planes tienen todas las funciones;
 * lo que cambia es hasta dónde llega la calidad de descarga.
 */
function maxQuality(plan: Plan): PngQuality {
  if (plan === 'free') return 'fullhd'; // Full HD contada por mes
  if (plan === 'pro' || plan === 'starter') return '2k';
  return '4k';
}

const QUALITY_ORDER: PngQuality[] = ['normal', 'fullhd', '2k', '4k'];

export const meRouter = Router();

meRouter.use((_req, res, next) => {
  if (!isDbConnected()) {
    res.status(503).json({ error: 'No hay conexión con la base de datos.' });
    return;
  }
  next();
});

meRouter.put('/me/plan', authRequired, async (req: AuthedRequest, res) => {
  const plan = req.body?.plan as Plan;
  if (!PLANS.includes(plan)) {
    res.status(400).json({ error: 'Plan desconocido.' });
    return;
  }
  // Con la pasarela activa, los planes de pago SOLO se activan pagando.
  // 'free' siempre se permite (cancelar / bajar de plan).
  if (wompiConfigured() && plan !== 'free') {
    res.status(402).json({ error: 'Este plan requiere pago.', code: 'PAYMENT_REQUIRED' });
    return;
  }
  const patch: Record<string, unknown> = { plan };
  if (plan === 'free') {
    patch.planUntil = null;
    patch.wompiPaymentSourceId = null;
  }
  const user = await User.findByIdAndUpdate(req.userId, patch, { new: true });
  if (!user) {
    res.status(401).json({ error: 'Cuenta no encontrada.' });
    return;
  }
  res.json({
    user: { id: user.id, name: user.name, email: user.email, plan: user.plan, avatar: user.avatar ?? '' }
  });
});

/** Sube la foto de perfil (data URI); se recorta cuadrada a 256px. */
meRouter.put('/me/avatar', authRequired, async (req: AuthedRequest, res) => {
  try {
    const raw = String(req.body?.image ?? '');
    const match = raw.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
    if (!match) {
      res.status(400).json({ error: 'Imagen inválida (PNG, JPG o WebP).' });
      return;
    }
    const buf = Buffer.from(match[2], 'base64');
    if (buf.length > 4 * 1024 * 1024) {
      res.status(400).json({ error: 'La imagen supera los 4 MB.' });
      return;
    }
    const png = await sharp(buf).resize(256, 256, { fit: 'cover' }).png().toBuffer();
    const avatar = `data:image/png;base64,${png.toString('base64')}`;
    const user = await User.findByIdAndUpdate(req.userId, { avatar }, { new: true });
    if (!user) {
      res.status(401).json({ error: 'Cuenta no encontrada.' });
      return;
    }
    res.json({
      user: { id: user.id, name: user.name, email: user.email, plan: user.plan, avatar: user.avatar }
    });
  } catch (err) {
    console.error('[me/avatar]', err);
    res.status(500).json({ error: 'No se pudo procesar la imagen.' });
  }
});

/** Busca un usuario por correo (para el preview al invitar). */
meRouter.get('/me/lookup', authRequired, async (req: AuthedRequest, res) => {
  const email = String(req.query.email ?? '').toLowerCase().trim();
  const user = await User.findOne({ email }).select('name avatar');
  if (!user) {
    res.json({ exists: false });
    return;
  }
  res.json({ exists: true, name: user.name, avatar: user.avatar ?? '' });
});

/** Uso de descargas Full HD del mes (límite solo en Free). */
meRouter.get('/me/usage', authRequired, async (req: AuthedRequest, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: 'Cuenta no encontrada.' });
    return;
  }
  res.json({
    used: fullHdUsage(user),
    limit: effectivePlan(user) === 'free' ? FREE_FULLHD_LIMIT : null
  });
});

/**
 * Autoriza (y en Free contabiliza) una descarga PNG según su calidad.
 * normal: siempre. fullhd: Free la cuenta (5/mes). 2k: Pro+. 4k: Studio+.
 */
meRouter.post('/me/download', authRequired, async (req: AuthedRequest, res) => {
  const quality = req.body?.quality as PngQuality;
  if (!QUALITY_ORDER.includes(quality)) {
    res.status(400).json({ error: 'Calidad desconocida.' });
    return;
  }
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: 'Cuenta no encontrada.' });
    return;
  }

  const usage = () => ({
    used: fullHdUsage(user),
    limit: effectivePlan(user) === 'free' ? FREE_FULLHD_LIMIT : null
  });

  const eff = effectivePlan(user);
  if (QUALITY_ORDER.indexOf(quality) > QUALITY_ORDER.indexOf(maxQuality(eff))) {
    const needed = quality === '4k' ? 'Studio (o un plan de equipos Business+)' : 'Pro';
    res.status(403).json({
      error: `La calidad ${quality.toUpperCase()} está disponible desde el plan ${needed}.`,
      code: 'PLAN',
      usage: usage()
    });
    return;
  }

  if (quality === 'fullhd' && eff === 'free') {
    const month = new Date().toISOString().slice(0, 7);
    const used = fullHdUsage(user);
    if (used >= FREE_FULLHD_LIMIT) {
      res.status(403).json({
        error: `Ya usaste tus ${FREE_FULLHD_LIMIT} descargas Full HD del mes. Mejora a Pro para descargas ilimitadas.`,
        code: 'LIMIT',
        usage: usage()
      });
      return;
    }
    user.usageMonth = month;
    user.usageCount = used + 1;
    await user.save();
  }

  res.json({ ok: true, usage: usage() });
});
