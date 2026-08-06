import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { config, detectSystemPotrace, findFreePort } from './config.js';
import { connectDb } from './db.js';
import { setSystemPotrace } from './services/tracer.service.js';
import { vectorizeRouter } from './routes/vectorize.routes.js';
import { historyRouter } from './routes/history.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { meRouter } from './routes/me.routes.js';
import { teamRouter } from './routes/team.routes.js';
import { payRouter, runRenewals, runRenewalReminders } from './routes/pay.routes.js';
import { googleRouter } from './routes/google.routes.js';

async function main(): Promise<void> {
  const potraceOk = detectSystemPotrace();
  setSystemPotrace(potraceOk);
  if (potraceOk) {
    console.log('[engine] potrace del sistema detectado.');
  } else {
    console.warn(
      '[engine] potrace no está instalado en el sistema; se usa el port JS de potrace. ' +
        'Para usar el binario: instala potrace y reinicia (https://potrace.sourceforge.net).'
    );
  }

  await connectDb([config.mongoUri]);

  const app = express();
  // Detrás del proxy de acmsy (Caddy): necesario para que las cookies Secure
  // y la detección de HTTPS funcionen correctamente.
  app.set('trust proxy', 1);
  app.use(cors());
  app.use(express.json({ limit: '6mb' }));
  // payRouter va antes que teamRouter/historyRouter: esos tienen un authRequired
  // global de router que, por el orden de montaje en '/api', interceptaría las
  // rutas públicas de pago (p. ej. /pay/status) si fuera después.
  app.use('/api', authRouter);
  app.use('/api', payRouter);
  app.use('/api', meRouter);
  app.use('/api', teamRouter);
  app.use('/api', vectorizeRouter);
  app.use('/api', historyRouter);
  // Login con Google: rutas en la raíz (la URL de retorno de Google no lleva /api).
  app.use('/', googleRouter);

  // Health check para el proxy/agente.
  app.get('/health', (_req, res) => res.json({ ok: true }));

  // En producción el mismo backend sirve el build de Angular (una sola imagen).
  const staticDir = process.env.STATIC_DIR;
  if (staticDir) {
    app.use(
      express.static(staticDir, {
        setHeaders: (res, filePath) => {
          // El service worker no debe cachearse: así los cambios se propagan
          // (el proxy/CDN si no lo guardaría horas).
          if (filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          }
        }
      })
    );
    // Fallback SPA: cualquier ruta que no sea /api, /auth/ ni /health → index.html.
    app.get(/^\/(?!api\/|auth\/|health).*/, (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  }

  const isProd = process.env.NODE_ENV === 'production';
  const port = isProd ? Number(process.env.PORT ?? 3000) : await findFreePort(config.preferredPort);
  // 0.0.0.0 obligatorio detrás del proxy (no localhost).
  app.listen(port, '0.0.0.0', () => {
    console.log(`[backend] Vexcel escuchando en 0.0.0.0:${port}`);
    console.log(`VEXCEL_BACKEND_PORT=${port}`);
  });

  // Renovación automática de suscripciones + aviso de cobro 3 días antes:
  // al arrancar y una vez al día.
  const daily = () => {
    void runRenewals().catch(() => undefined);
    void runRenewalReminders().catch(() => undefined);
  };
  setTimeout(daily, 15_000);
  setInterval(daily, 24 * 60 * 60 * 1000);
}

main().catch((err) => {
  console.error('Error fatal al arrancar el backend:', err);
  process.exit(1);
});
