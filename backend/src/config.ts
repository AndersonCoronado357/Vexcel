import net from 'node:net';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  preferredPort: Number(process.env.PORT ?? 5178),
  mongoUri: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/vexcel',
  jwtSecret: process.env.JWT_SECRET ?? 'vexcel-dev-secret-cambia-esto',
  maxUploadBytes: 20 * 1024 * 1024,
  maxDimension: 2400,
  /** URL pública del frontend (para el redirect de Wompi tras pagar). */
  appUrl: process.env.APP_URL ?? 'http://localhost:4201',
  /** Origen público (detrás del proxy). Para OAuth/enlaces. */
  origin: process.env.ORIGIN ?? process.env.APP_URL ?? 'http://localhost:4201',
  /**
   * Credenciales de Google OAuth. En acmsy se inyectan con useAcmsyAuth:true
   * (sin claves propias). Cubrimos varios nombres posibles por si acaso.
   */
  google: {
    clientId:
      process.env.GOOGLE_CLIENT_ID ??
      process.env.GOOGLE_OAUTH_CLIENT_ID ??
      process.env.ACMSY_GOOGLE_CLIENT_ID ??
      process.env.OAUTH_GOOGLE_CLIENT_ID ??
      '',
    clientSecret:
      process.env.GOOGLE_CLIENT_SECRET ??
      process.env.GOOGLE_OAUTH_CLIENT_SECRET ??
      process.env.ACMSY_GOOGLE_CLIENT_SECRET ??
      process.env.OAUTH_GOOGLE_CLIENT_SECRET ??
      ''
  },
  /** Correo transaccional (Resend). En acmsy lo inyecta useAcmsyAuth. */
  resend: {
    apiKey: process.env.RESEND_API_KEY ?? '',
    from: process.env.MAIL_FROM ?? 'Vexcel <noreply@acmsy.com>'
  },
  wompi: {
    publicKey: process.env.WOMPI_PUBLIC_KEY ?? '',
    privateKey: process.env.WOMPI_PRIVATE_KEY ?? '',
    integritySecret: process.env.WOMPI_INTEGRITY_SECRET ?? '',
    eventsSecret: process.env.WOMPI_EVENTS_SECRET ?? '',
    // 'sandbox' (pruebas) o 'production' (dinero real).
    env: (process.env.WOMPI_ENV ?? 'sandbox') as 'sandbox' | 'production'
  }
};

export function wompiApiBase(): string {
  return config.wompi.env === 'production'
    ? 'https://production.wompi.co/v1'
    : 'https://sandbox.wompi.co/v1';
}

export function wompiConfigured(): boolean {
  return Boolean(config.wompi.publicKey && config.wompi.privateKey && config.wompi.integritySecret);
}

export function googleConfigured(): boolean {
  return Boolean(config.google.clientId && config.google.clientSecret);
}

export function mailConfigured(): boolean {
  return Boolean(config.resend.apiKey);
}

function canBind(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', (err: NodeJS.ErrnoException) => {
      // Familia no soportada en esta máquina: no cuenta como ocupado.
      resolve(err.code === 'EADDRNOTAVAIL' || err.code === 'EAFNOSUPPORT');
    });
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, host);
  });
}

/** Libre solo si se puede enlazar en IPv4 e IPv6 (localhost puede resolver a ::1). */
async function isPortFree(port: number): Promise<boolean> {
  return (await canBind(port, '127.0.0.1')) && (await canBind(port, '::1'));
}

/** Busca el primer puerto libre a partir de `start`. */
export async function findFreePort(start: number): Promise<number> {
  for (let port = start; port < start + 200; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No se encontró puerto libre a partir de ${start}`);
}

/** Detecta si el binario potrace del sistema está disponible. */
export function detectSystemPotrace(): boolean {
  try {
    const res = spawnSync('potrace', ['--version'], { encoding: 'utf8' });
    return res.status === 0;
  } catch {
    return false;
  }
}
