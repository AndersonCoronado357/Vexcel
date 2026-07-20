export type TraceMode = 'single' | 'color';
export type Background = 'transparent' | 'white';
export type Plan = 'free' | 'pro' | 'studio' | 'starter' | 'business' | 'enterprise';

export interface User {
  id: string;
  name: string;
  email: string;
  plan: Plan;
  /** Foto de perfil como data URI, o ''. */
  avatar: string;
  /** Vencimiento del plan de pago (ISO) o null. */
  planUntil?: string | null;
  /** Se renueva automáticamente cada mes. */
  autoRenew?: boolean;
}

export const PLAN_LABELS: Record<Plan, string> = {
  free: 'Plan Free',
  pro: 'Plan Pro',
  studio: 'Plan Studio',
  starter: 'Plan Starter',
  business: 'Plan Business',
  enterprise: 'Plan Enterprise'
};

export function isTeamPlan(plan: Plan | undefined): boolean {
  return plan === 'starter' || plan === 'business' || plan === 'enterprise';
}

/** Free solo tiene modo un color y biblioteca limitada; Pro+ desbloquea. */
export function isPaidPlan(plan: Plan | undefined): boolean {
  return plan !== undefined && plan !== 'free';
}

export type TeamRole = 'admin' | 'editor' | 'viewer';

export type PngQuality = 'normal' | 'fullhd' | '2k' | '4k';

/** Calidad máxima de exportación por plan. */
export function maxPngQuality(plan: Plan | undefined): PngQuality {
  if (!plan || plan === 'free') return 'fullhd';
  if (plan === 'pro' || plan === 'starter') return '2k';
  return '4k';
}

export const ROLE_LABELS: Record<TeamRole, string> = {
  admin: 'Administrador',
  editor: 'Editor',
  viewer: 'Lector'
};

export interface TeamMember {
  name: string;
  email: string;
  role: TeamRole;
  status: 'activo' | 'invitado';
  avatar: string;
}

export interface TeamInfo {
  id: string;
  name: string;
  owner: { name: string; email: string; avatar: string };
  members: TeamMember[];
  seatLimit: number | null;
  seatsUsed: number;
}

export interface TeamFolderInfo {
  id: string;
  name: string;
  count: number;
}

export interface TeamFoldersResponse {
  teamId: string;
  teamName: string;
  isOwner: boolean;
  role: TeamRole;
  folders: TeamFolderInfo[];
}

export interface TeamLibraryItem {
  id: string;
  originalName: string;
  mode: 'mono' | 'color';
  width: number;
  height: number;
  svgBytes: number;
  preview: string;
  createdAt: string;
  savedBy: string;
}

/** Ajustes del panel, en las unidades del diseño (porcentajes 0-100). */
export interface TraceSettings {
  mode: TraceMode;
  threshold: number;
  colors: number;
  smoothing: number;
  detail: number;
  despeckle: number;
  fillHex: string;
  bg: Background;
}

export const DEFAULT_SETTINGS: TraceSettings = {
  mode: 'single',
  threshold: 52,
  colors: 6,
  smoothing: 62,
  detail: 55,
  despeckle: 30,
  fillHex: '#6D4AFF',
  bg: 'transparent'
};

/**
 * Traduce los porcentajes del panel a los parámetros reales del tracer.
 * Los rangos están acotados a valores útiles para que TODO el recorrido del
 * slider dé resultados razonables (sin extremos que rompen el trazo).
 */
export function toTracerParams(s: TraceSettings): Record<string, string> {
  return {
    mode: s.mode === 'color' ? 'color' : 'mono',
    // 60-220: corte útil de binarización (0/255 arruinan el resultado)
    threshold: String(Math.round(60 + (s.threshold / 100) * 160)),
    colors: String(s.colors),
    // Rango completo de potrace: 0 esquinas duras -> 1.33 máximo redondeo
    alphamax: ((s.smoothing / 100) * 1.3334).toFixed(4),
    // Más detalle = menos tolerancia de simplificación
    opttolerance: (0.02 + (1 - s.detail / 100) * 0.98).toFixed(3),
    // El detalle también baja la resolución de trazado: el efecto se VE
    scale: (0.35 + (s.detail / 100) * 0.65).toFixed(3),
    // 0-40 px de área mínima: quitar motas notorio en imágenes con ruido
    turdsize: String(Math.round((s.despeckle / 100) * 40)),
    fillColor: s.mode === 'single' ? s.fillHex : '',
    background: s.bg
  };
}

export interface VectorizeResponse {
  svg: string;
  width: number;
  height: number;
  bytes: number;
  engine: string;
  /** Colores reales presentes en el SVG resultante. */
  palette: string[];
  originalBytes: number;
  preview: string;
  usage: { used: number; limit: number | null };
}

export interface ApiStatus {
  ok: boolean;
  potraceSystem: boolean;
  engine: string;
  history: boolean;
}

export interface HistoryItem {
  id: string;
  originalName: string;
  mode: 'mono' | 'color';
  params: Record<string, unknown>;
  width: number;
  height: number;
  svgBytes: number;
  originalBytes: number;
  preview: string;
  createdAt: string;
}

export interface HistoryDetail extends HistoryItem {
  svg: string;
}

export interface PaymentRecord {
  id: string;
  plan: string;
  amountInCents: number;
  status: string;
  method: string | null;
  reference: string;
  createdAt: string | null;
  finalizedAt: string | null;
}

export function formatKb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  return (bytes / 1024).toFixed(1) + ' KB';
}
