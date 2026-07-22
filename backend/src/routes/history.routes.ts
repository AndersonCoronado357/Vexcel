import { Router } from 'express';
import { Types } from 'mongoose';
import { isDbConnected } from '../db.js';
import { Conversion } from '../models/conversion.model.js';
import { Team } from '../models/team.model.js';
import { User } from '../models/user.model.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';

export const historyRouter = Router();

historyRouter.use((_req, res, next) => {
  if (!isDbConnected()) {
    res.status(503).json({ error: 'Biblioteca no disponible: sin conexión a MongoDB.' });
    return;
  }
  next();
});

historyRouter.use(authRequired);

/** Guarda una conversión en la biblioteca del usuario. */
historyRouter.post('/history', async (req: AuthedRequest, res) => {
  try {
    const b = req.body ?? {};
    if (typeof b.svg !== 'string' || !b.svg.includes('<svg') || b.svg.length > 3_000_000) {
      res.status(400).json({ error: 'SVG inválido.' });
      return;
    }
    // Destino: biblioteca personal, o una carpeta compartida del equipo.
    let teamId: string | null = null;
    let folderId: string | null = null;
    if (b.teamId && b.folderId) {
      if (!Types.ObjectId.isValid(b.teamId) || !Types.ObjectId.isValid(b.folderId)) {
        res.status(400).json({ error: 'Destino inválido.' });
        return;
      }
      const team = await Team.findById(b.teamId);
      const me = await User.findById(req.userId);
      const belongs =
        team && me && (String(team.ownerId) === req.userId || team.members.some((m) => m.email === me.email));
      if (!belongs || !team.folders.some((f) => String(f._id) === b.folderId)) {
        res.status(403).json({ error: 'No tienes acceso a esa carpeta de equipo.' });
        return;
      }
      teamId = b.teamId;
      folderId = b.folderId;
    }

    const doc = await Conversion.create({
      userId: req.userId,
      teamId,
      folderId,
      originalName: String(b.originalName ?? 'imagen').slice(0, 120),
      mode: b.mode === 'color' ? 'color' : 'mono',
      params: typeof b.params === 'object' && b.params ? b.params : {},
      svg: b.svg,
      width: Number(b.width) || 0,
      height: Number(b.height) || 0,
      svgBytes: Buffer.byteLength(b.svg, 'utf8'),
      originalBytes: Number(b.originalBytes) || 0,
      preview: typeof b.preview === 'string' && b.preview.startsWith('data:image/') ? b.preview : ''
    });
    res.json({ id: doc.id });
  } catch (err) {
    console.error('[history/save]', err);
    res.status(500).json({ error: 'No se pudo guardar en la biblioteca.' });
  }
});

/** Lista la biblioteca personal del usuario (sin el cuerpo del SVG). */
historyRouter.get('/history', async (req: AuthedRequest, res) => {
  const items = await Conversion.find({ userId: req.userId, teamId: null })
    .sort({ createdAt: -1 })
    .limit(60)
    .select('originalName mode params width height svgBytes originalBytes preview createdAt')
    .lean();
  res.json(
    items.map((d) => ({
      id: String(d._id),
      originalName: d.originalName,
      mode: d.mode,
      params: d.params,
      width: d.width,
      height: d.height,
      svgBytes: d.svgBytes,
      originalBytes: d.originalBytes,
      preview: d.preview,
      createdAt: d.createdAt
    }))
  );
});

/** Devuelve una conversión completa (incluye SVG). Propia o de tu equipo. */
historyRouter.get('/history/:id', async (req: AuthedRequest, res) => {
  try {
    const doc = await Conversion.findById(req.params.id).lean();
    if (!doc) {
      res.status(404).json({ error: 'Conversión no encontrada.' });
      return;
    }
    if (String(doc.userId) !== req.userId) {
      const me = await User.findById(req.userId);
      const team = doc.teamId ? await Team.findById(doc.teamId) : null;
      const shared =
        team && me && (String(team.ownerId) === req.userId || team.members.some((m) => m.email === me.email));
      if (!shared) {
        res.status(404).json({ error: 'Conversión no encontrada.' });
        return;
      }
    }
    res.json({
      id: String(doc._id),
      originalName: doc.originalName,
      mode: doc.mode,
      params: doc.params,
      svg: doc.svg,
      width: doc.width,
      height: doc.height,
      svgBytes: doc.svgBytes,
      originalBytes: doc.originalBytes,
      preview: doc.preview,
      createdAt: doc.createdAt
    });
  } catch {
    res.status(400).json({ error: 'Id inválido.' });
  }
});

historyRouter.delete('/history/:id', async (req: AuthedRequest, res) => {
  try {
    const doc = await Conversion.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!doc) {
      res.status(404).json({ error: 'Conversión no encontrada.' });
      return;
    }
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: 'Id inválido.' });
  }
});
