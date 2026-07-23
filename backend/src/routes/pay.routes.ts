import { Router } from 'express';
import crypto from 'node:crypto';
import { config, wompiApiBase, wompiConfigured } from '../config.js';
import { PLANS, User, type Plan } from '../models/user.model.js';
import { PLAN_PRICE_COP } from '../services/plan.service.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { isDbConnected } from '../db.js';
import { sendMail, upcomingChargeEmail } from '../services/mail.service.js';

export const payRouter = Router();

/** ¿Está lista la pasarela? (para que el frontend muestre el estado). */
payRouter.get('/pay/status', (_req, res) => {
  res.json({ enabled: wompiConfigured(), env: config.wompi.env });
});

payRouter.use((_req, res, next) => {
  if (!isDbConnected()) {
    res.status(503).json({ error: 'No hay conexión con la base de datos.' });
    return;
  }
  next();
});

/**
 * Prepara un checkout de Wompi para el plan elegido. Devuelve los parámetros
 * firmados para abrir el Checkout Web de Wompi. La activación real ocurre al
 * volver (verify) o por webhook: nunca confiamos en el redirect por sí solo.
 */
payRouter.post('/pay/checkout', authRequired, async (req: AuthedRequest, res) => {
  if (!wompiConfigured()) {
    res.status(503).json({ error: 'La pasarela de pago aún no está configurada.', code: 'NOPAY' });
    return;
  }
  const plan = req.body?.plan as Plan;
  if (!PLANS.includes(plan) || plan === 'free') {
    res.status(400).json({ error: 'Plan inválido para pago.' });
    return;
  }
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: 'Cuenta no encontrada.' });
    return;
  }

  const amountInCents = PLAN_PRICE_COP[plan];
  const currency = 'COP';
  // Referencia única: incluye usuario y plan para reconciliar al volver.
  const reference = `vx_${user.id}_${plan}_${Date.now()}`;
  // Firma de integridad: SHA256(reference + amountInCents + currency + integritySecret)
  const signature = crypto
    .createHash('sha256')
    .update(`${reference}${amountInCents}${currency}${config.wompi.integritySecret}`)
    .digest('hex');

  res.json({
    publicKey: config.wompi.publicKey,
    currency,
    amountInCents,
    reference,
    signature,
    redirectUrl: `${config.appUrl}/planes?wompi=1`,
    checkoutUrl: 'https://checkout.wompi.co/p/',
    customerEmail: user.email
  });
});

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/** Activa el plan pagado 30 días a partir de una transacción aprobada. */
async function activateFromTransaction(txn: {
  status?: string;
  reference?: string;
  payment_source_id?: number | string | null;
}): Promise<{ ok: boolean; plan?: Plan }> {
  if (txn.status !== 'APPROVED') return { ok: false };
  const ref = txn.reference ?? '';
  const m = ref.match(/^vx_([a-f0-9]{24})_([a-z]+)_/i);
  if (!m) return { ok: false };
  const [, userId, plan] = m;
  if (!PLANS.includes(plan as Plan) || plan === 'free') return { ok: false };
  const patch: Record<string, unknown> = {
    plan,
    planUntil: new Date(Date.now() + MONTH_MS),
    autoRenew: true // al suscribirse, se renueva solo cada mes
  };
  // Si Wompi devolvió una fuente de pago tokenizada, la guardamos para renovar.
  if (txn.payment_source_id) patch.wompiPaymentSourceId = String(txn.payment_source_id);
  await User.findByIdAndUpdate(userId, patch);
  return { ok: true, plan: plan as Plan };
}

/** Cancela la renovación automática. El plan sigue activo hasta que venza. */
payRouter.post('/pay/cancel', authRequired, async (req: AuthedRequest, res) => {
  const user = await User.findByIdAndUpdate(req.userId, { autoRenew: false }, { new: true });
  if (!user) {
    res.status(401).json({ error: 'Cuenta no encontrada.' });
    return;
  }
  res.json({
    ok: true,
    plan: user.plan,
    planUntil: user.planUntil,
    autoRenew: user.autoRenew
  });
});

/** Detalle de la suscripción actual para la UI. */
payRouter.get('/pay/subscription', authRequired, async (req: AuthedRequest, res) => {
  const user = await User.findById(req.userId).select('plan planUntil autoRenew');
  if (!user) {
    res.status(401).json({ error: 'Cuenta no encontrada.' });
    return;
  }
  res.json({ plan: user.plan, planUntil: user.planUntil, autoRenew: user.autoRenew });
});

/**
 * Historial de pagos de la suscripción del usuario. Se lee directamente de la
 * API de Wompi (no guardamos transacciones): trae las de los últimos 18 meses y
 * filtra las que pertenecen a esta cuenta por el prefijo de la referencia.
 */
payRouter.get('/pay/history', authRequired, async (req: AuthedRequest, res) => {
  if (!wompiConfigured()) {
    res.json({ payments: [] });
    return;
  }
  const prefix = `vx_${req.userId}_`;
  const until = new Date();
  const from = new Date(Date.now() - 18 * 30 * 24 * 60 * 60 * 1000);
  const out: Array<{
    id: string;
    plan: string;
    amountInCents: number;
    status: string;
    method: string | null;
    reference: string;
    createdAt: string | null;
    finalizedAt: string | null;
  }> = [];
  try {
    for (let page = 1; page <= 6; page++) {
      const qs = new URLSearchParams({
        from_date: from.toISOString(),
        until_date: until.toISOString(),
        page: String(page),
        page_size: '200'
      });
      const r = await fetch(`${wompiApiBase()}/transactions?${qs}`, {
        headers: { Authorization: `Bearer ${config.wompi.privateKey}` }
      });
      if (!r.ok) break;
      const body = (await r.json()) as {
        data?: Array<{
          id?: string;
          reference?: string;
          amount_in_cents?: number;
          status?: string;
          payment_method_type?: string | null;
          created_at?: string;
          finalized_at?: string;
        }>;
      };
      const rows = body.data ?? [];
      for (const t of rows) {
        if (!t.reference?.startsWith(prefix)) continue;
        const m = t.reference.match(/^vx_[a-f0-9]{24}_([a-z]+)_/i);
        out.push({
          id: t.id ?? '',
          plan: m?.[1] ?? '—',
          amountInCents: t.amount_in_cents ?? 0,
          status: t.status ?? 'UNKNOWN',
          method: t.payment_method_type ?? null,
          reference: t.reference,
          createdAt: t.created_at ?? null,
          finalizedAt: t.finalized_at ?? null
        });
      }
      if (rows.length < 200) break;
    }
  } catch (err) {
    console.error('[pay/history]', err);
    res.status(502).json({ error: 'No se pudo consultar el historial en Wompi.' });
    return;
  }
  // Más recientes primero.
  out.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  res.json({ payments: out });
});

/** Token de aceptación vigente del comercio (necesario para cobrar por API). */
async function acceptanceToken(): Promise<string | null> {
  try {
    const r = await fetch(`${wompiApiBase()}/merchants/${config.wompi.publicKey}`);
    const b = (await r.json()) as { data?: { presigned_acceptance?: { acceptance_token?: string } } };
    return b.data?.presigned_acceptance?.acceptance_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Renovación automática: cobra a las suscripciones que están por vencer y tienen
 * una fuente de pago guardada. Si el cobro es aprobado, extiende 30 días; si
 * falla, baja el plan a Free. Se ejecuta a diario desde el servidor.
 */
export async function runRenewals(): Promise<void> {
  if (!wompiConfigured() || !isDbConnected()) return;
  const soon = new Date(Date.now() + 24 * 60 * 60 * 1000); // vencen en <24h
  const due = await User.find({
    plan: { $ne: 'free' },
    autoRenew: true,
    wompiPaymentSourceId: { $ne: null },
    planUntil: { $lte: soon }
  });
  if (due.length === 0) return;
  const acceptance = await acceptanceToken();
  if (!acceptance) {
    console.warn('[renewals] No se pudo obtener el acceptance token; se reintenta luego.');
    return;
  }
  for (const user of due) {
    try {
      const amount = PLAN_PRICE_COP[user.plan];
      const reference = `vx_${user.id}_${user.plan}_${Date.now()}`;
      const r = await fetch(`${wompiApiBase()}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.wompi.privateKey}` },
        body: JSON.stringify({
          acceptance_token: acceptance,
          amount_in_cents: amount,
          currency: 'COP',
          customer_email: user.email,
          payment_source_id: Number(user.wompiPaymentSourceId),
          reference
        })
      });
      const body = (await r.json()) as { data?: { status?: string } };
      const status = body.data?.status;
      if (status === 'APPROVED' || status === 'PENDING') {
        // PENDING: extendemos igual; si luego falla, el próximo ciclo lo corrige.
        user.planUntil = new Date(Math.max(Date.now(), user.planUntil?.getTime() ?? 0) + MONTH_MS);
        await user.save();
        console.log(`[renewals] Renovado ${user.email} (${user.plan}) -> ${user.planUntil.toISOString()}`);
      } else {
        user.plan = 'free';
        user.planUntil = null;
        user.autoRenew = false;
        user.wompiPaymentSourceId = null;
        await user.save();
        console.log(`[renewals] Cobro no aprobado para ${user.email}; bajado a Free.`);
      }
    } catch (err) {
      console.warn(`[renewals] Error renovando ${user.email}:`, err);
    }
  }
}

const MESES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

/** "$30.000" a partir de centavos de COP (sin depender del locale del sistema). */
function copFromCents(cents: number): string {
  const pesos = Math.round(cents / 100).toString();
  return '$' + pesos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** "24 de julio de 2026" */
function formatDateEs(d: Date): string {
  return `${d.getDate()} de ${MESES_ES[d.getMonth()]} de ${d.getFullYear()}`;
}

/**
 * Avisa por correo, 3 días antes, a las suscripciones con cobro automático que
 * están por renovarse. Se manda una sola vez por ciclo (dedupe con
 * renewalReminderAt). Corre a diario desde el servidor.
 */
export async function runRenewalReminders(): Promise<void> {
  if (!wompiConfigured() || !isDbConnected()) return;
  const now = Date.now();
  const in3days = new Date(now + 3 * 24 * 60 * 60 * 1000);
  const candidates = await User.find({
    plan: { $ne: 'free' },
    autoRenew: true,
    wompiPaymentSourceId: { $ne: null },
    planUntil: { $gt: new Date(now), $lte: in3days }
  });
  for (const user of candidates) {
    const until = user.planUntil?.getTime();
    if (!until) continue;
    // Ya se avisó de este mismo vencimiento: no repetir.
    if (user.renewalReminderAt && user.renewalReminderAt.getTime() === until) continue;
    try {
      const planLabel = user.plan.charAt(0).toUpperCase() + user.plan.slice(1);
      const amount = copFromCents(PLAN_PRICE_COP[user.plan]);
      const date = formatDateEs(user.planUntil as Date);
      const { subject, html } = upcomingChargeEmail(
        user.name,
        planLabel,
        amount,
        date,
        `${config.appUrl}/planes`
      );
      const sent = await sendMail({ to: user.email, subject, html });
      user.renewalReminderAt = user.planUntil as Date;
      await user.save();
      console.log(
        `[reminder] Aviso de cobro a ${user.email} (${user.plan}, ${date})${sent ? '' : ' [mail no enviado]'}`
      );
    } catch (err) {
      console.warn(`[reminder] Error avisando a ${user.email}:`, err);
    }
  }
}

/**
 * Verifica una transacción por id contra la API de Wompi (con la llave privada)
 * y activa el plan si fue aprobada. Es el camino que funciona en local (sin
 * webhook público): el frontend lo llama al volver del checkout.
 */
payRouter.get('/pay/verify', authRequired, async (req: AuthedRequest, res) => {
  if (!wompiConfigured()) {
    res.status(503).json({ error: 'Pasarela no configurada.' });
    return;
  }
  const id = String(req.query.id ?? '');
  if (!id) {
    res.status(400).json({ error: 'Falta el id de la transacción.' });
    return;
  }
  try {
    const r = await fetch(`${wompiApiBase()}/transactions/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${config.wompi.privateKey}` }
    });
    const body = (await r.json()) as { data?: { status?: string; reference?: string; payment_source_id?: number | null } };
    const txn = body.data;
    if (!txn) {
      res.status(404).json({ error: 'Transacción no encontrada.' });
      return;
    }
    // La referencia debe pertenecer a este usuario.
    if (!txn.reference?.startsWith(`vx_${req.userId}_`)) {
      res.status(403).json({ error: 'La transacción no corresponde a tu cuenta.' });
      return;
    }
    if (txn.status === 'PENDING') {
      res.json({ status: 'PENDING' });
      return;
    }
    const result = await activateFromTransaction(txn);
    const user = await User.findById(req.userId);
    res.json({
      status: txn.status,
      activated: result.ok,
      user: user
        ? { id: user.id, name: user.name, email: user.email, plan: user.plan, avatar: user.avatar }
        : null
    });
  } catch (err) {
    console.error('[pay/verify]', err);
    res.status(502).json({ error: 'No se pudo verificar el pago con Wompi.' });
  }
});

/**
 * Webhook de Wompi (para producción / mayor robustez). Verifica la firma del
 * evento y activa el plan cuando una transacción queda APPROVED.
 */
payRouter.post('/pay/webhook', async (req, res) => {
  try {
    const evt = req.body as {
      event?: string;
      data?: { transaction?: { id?: string; status?: string; reference?: string; amount_in_cents?: number; payment_source_id?: number | null } };
      signature?: { checksum?: string; properties?: string[] };
      timestamp?: number;
    };
    const txn = evt?.data?.transaction;
    if (evt?.event !== 'transaction.updated' || !txn) {
      res.json({ ok: true });
      return;
    }
    // Verificación de firma del evento (con el events secret).
    if (config.wompi.eventsSecret && evt.signature?.properties && evt.signature.checksum) {
      const concat = evt.signature.properties
        .map((path) => path.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], evt.data))
        .join('');
      const expected = crypto
        .createHash('sha256')
        .update(`${concat}${evt.timestamp ?? ''}${config.wompi.eventsSecret}`)
        .digest('hex');
      if (expected !== evt.signature.checksum) {
        res.status(401).json({ error: 'Firma inválida.' });
        return;
      }
    }
    await activateFromTransaction(txn);
    res.json({ ok: true });
  } catch (err) {
    console.error('[pay/webhook]', err);
    res.status(200).json({ ok: true }); // Wompi reintenta si no es 2xx; evitamos loops.
  }
});
