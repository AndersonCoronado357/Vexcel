import { Schema, model } from 'mongoose';

export type Plan = 'free' | 'pro' | 'studio' | 'starter' | 'business' | 'enterprise';

export const PLANS: Plan[] = ['free', 'pro', 'studio', 'starter', 'business', 'enterprise'];

export interface UserDoc {
  name: string;
  email: string;
  passwordHash: string;
  plan: Plan;
  /** Foto de perfil como data URI (PNG cuadrado pequeño), o ''. */
  avatar: string;
  /** Preferencia de tema del usuario (se guarda en servidor, no en el navegador). */
  themePref: 'light' | 'dark' | null;
  /** Vence el plan de pago (Wompi). Si pasó, se degrada a Free. null = sin vencimiento. */
  planUntil: Date | null;
  /** Se cobra automáticamente cada mes mientras esté activo. */
  autoRenew: boolean;
  /** Fuente de pago tokenizada en Wompi para renovar (opcional). */
  wompiPaymentSourceId: string | null;
  /** Restablecimiento de contraseña: hash del token y su vencimiento. */
  resetTokenHash: string | null;
  resetTokenExp: Date | null;
  /** planUntil para el que ya se avisó el próximo cobro (evita duplicar el aviso). */
  renewalReminderAt: Date | null;
  /** Contador de descargas Full HD del mes en curso (límite del plan Free). */
  usageMonth: string;
  usageCount: number;
  createdAt: Date;
}

const userSchema = new Schema<UserDoc>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    plan: { type: String, enum: PLANS, default: 'free' },
    avatar: { type: String, default: '' },
    themePref: { type: String, enum: ['light', 'dark', null], default: null },
    planUntil: { type: Date, default: null },
    autoRenew: { type: Boolean, default: false },
    wompiPaymentSourceId: { type: String, default: null },
    resetTokenHash: { type: String, default: null },
    resetTokenExp: { type: Date, default: null },
    renewalReminderAt: { type: Date, default: null },
    usageMonth: { type: String, default: '' },
    usageCount: { type: Number, default: 0 }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const User = model<UserDoc>('User', userSchema);
