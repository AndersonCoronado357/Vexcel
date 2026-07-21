import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { trace, makePreview, hasSystemPotrace, type TraceParams } from '../services/tracer.service.js';
import { isDbConnected } from '../db.js';
import { User } from '../models/user.model.js';
import { effectivePlan } from '../services/plan.service.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { FREE_FULLHD_LIMIT, fullHdUsage } from './me.routes.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes },
  fileFilter: (_req, file, cb) => {
    if (['image/png', 'image/jpeg'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se aceptan PNG o JPG.'));
  }
});

function clamp(n: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Todos los planes tienen todas las funciones; el plan sube la resolución. */
function planCapDim(plan: string | undefined): number {
  return plan === 'free' ? 1024 : config.maxDimension;
}

function parseParams(body: Record<string, string>, capDim: number): TraceParams {
  const fill = (body.fillColor ?? '').trim();
  return {
    mode: body.mode === 'color' ? 'color' : 'mono',
    threshold: clamp(Number(body.threshold), 1, 254, 180),
    colors: clamp(Number(body.colors), 2, 16, 6),
    alphamax: clamp(Number(body.alphamax), 0, 1.3334, 1),
    opttolerance: clamp(Number(body.opttolerance), 0, 1.5, 0.2),
    turdsize: clamp(Number(body.turdsize), 0, 100, 2),
    scale: clamp(Number(body.scale), 0.2, 1, 1),
    capDim,
    fillColor: /^#[0-9a-fA-F]{6}$/.test(fill) ? fill : null,
    background: body.background === 'white' ? 'white' : 'transparent'
  };
}

export const vectorizeRouter = Router();

vectorizeRouter.post('/vectorize', authRequired, upload.single('image'), async (req: AuthedRequest, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Falta el archivo "image" (PNG o JPG).' });
      return;
    }

    let capDim = config.maxDimension;
    let usage: { used: number; limit: number | null } = { used: 0, limit: null };
    if (isDbConnected()) {
      const user = await User.findById(req.userId).select('plan planUntil usageMonth usageCount');
      const eff = user ? effectivePlan(user) : 'free';
      capDim = planCapDim(eff);
      if (user) {
        usage = {
          used: fullHdUsage(user),
          limit: eff === 'free' ? FREE_FULLHD_LIMIT : null
        };
      }
    }

    const params = parseParams(req.body ?? {}, capDim);
    const result = await trace(req.file.buffer, params);
    const preview = await makePreview(result.svg);

    res.json({
      svg: result.svg,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      engine: result.engine,
      palette: result.palette,
      originalBytes: req.file.size,
      preview,
      usage
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error procesando la imagen.';
    console.error('[vectorize]', err);
    res.status(500).json({ error: msg });
  }
});

vectorizeRouter.get('/status', (_req, res) => {
  res.json({
    ok: true,
    potraceSystem: hasSystemPotrace(),
    engine: hasSystemPotrace() ? 'potrace (sistema)' : 'potrace (port JS)',
    history: isDbConnected()
  });
});
