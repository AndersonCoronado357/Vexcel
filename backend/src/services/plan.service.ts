import type { Plan, UserDoc } from '../models/user.model.js';

/**
 * Precios en centavos de COP que se COBRAN. Son montos redondos y "bonitos"
 * (terminados en 000). Wompi descuenta su comisión (~2,65% + $700 + IVA 19%),
 * así que lo NETO que recibes es ~3% menos que el precio de lista.
 */
export const PLAN_PRICE_COP: Record<Plan, number> = {
  free: 0,
  pro: 3_000_000, // cobra $30.000  -> neto ~$28.221
  studio: 6_000_000, // cobra $60.000  -> neto ~$57.275
  starter: 10_000_000, // cobra $100.000 -> neto ~$96.013
  business: 20_000_000, // cobra $200.000 -> neto ~$192.860
  enterprise: 50_000_000 // cobra $500.000 -> neto ~$483.400
};

/** Plan efectivo: si el plan de pago venció, cuenta como Free. */
export function effectivePlan(user: Pick<UserDoc, 'plan' | 'planUntil'>): Plan {
  if (user.plan === 'free') return 'free';
  if (user.planUntil && user.planUntil.getTime() < Date.now()) return 'free';
  return user.plan;
}

export function copPesos(cents: number): number {
  return Math.round(cents / 100);
}
