import { Router } from 'express';
import { Types, type HydratedDocument } from 'mongoose';
import QRCode from 'qrcode';
import { Team, newInviteCode, seatLimit, type TeamDoc, type TeamRole } from '../models/team.model.js';
import { User } from '../models/user.model.js';
import { effectivePlan } from '../services/plan.service.js';
import { Conversion } from '../models/conversion.model.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { isDbConnected } from '../db.js';

/**
 * Resuelve el equipo del usuario: como dueño o como miembro (por correo).
 * Los miembros no necesitan un plan de equipos propio.
 */
async function findTeamCtx(userId: string) {
  const user = await User.findById(userId);
  if (!user) return null;
  let team = await Team.findOne({ ownerId: userId });
  if (team) return { team, user, isOwner: true, memberRole: 'admin' as TeamRole };
  team = await Team.findOne({ 'members.email': user.email });
  if (!team) return null;
  const role = team.members.find((m) => m.email === user.email)?.role ?? 'editor';
  return { team, user, isOwner: false, memberRole: role };
}

/** Garantiza que el equipo tenga al menos la carpeta compartida "General". */
async function ensureDefaultFolder(team: HydratedDocument<TeamDoc>): Promise<void> {
  if (team.folders.length === 0) {
    team.folders.push({ name: 'General' } as TeamDoc['folders'][number]);
    await team.save();
  }
}

export const teamRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES: TeamRole[] = ['admin', 'editor', 'viewer'];

teamRouter.use((_req, res, next) => {
  if (!isDbConnected()) {
    res.status(503).json({ error: 'No hay conexión con la base de datos.' });
    return;
  }
  next();
});

teamRouter.use(authRequired);

interface TeamContext {
  userId: string;
  limit: number | null;
}

/** Valida que el plan del usuario incluye equipos; 403 con code PLAN si no. */
async function requireTeamPlan(req: AuthedRequest): Promise<TeamContext | null> {
  const user = await User.findById(req.userId);
  if (!user) return null;
  const limit = seatLimit(effectivePlan(user));
  if (limit === 0) return null;
  return { userId: user.id, limit };
}

async function teamJson(
  team: { id?: unknown; name: string; members: { name: string; email: string; role: string; status: string }[] },
  ctx: TeamContext,
  ownerName: string,
  ownerEmail: string
) {
  // Enriquecer con las fotos de perfil de quienes ya tienen cuenta.
  const emails = [...team.members.map((m) => m.email), ownerEmail];
  const users = await User.find({ email: { $in: emails } }).select('email avatar');
  const avatars = new Map(users.map((u) => [u.email, u.avatar ?? '']));
  return {
    id: String(team.id),
    name: team.name,
    owner: { name: ownerName, email: ownerEmail, avatar: avatars.get(ownerEmail) ?? '' },
    members: team.members.map((m) => ({
      name: m.name,
      email: m.email,
      role: m.role,
      status: m.status,
      avatar: avatars.get(m.email) ?? ''
    })),
    seatLimit: ctx.limit,
    seatsUsed: team.members.length + 1
  };
}

teamRouter.get('/team', async (req: AuthedRequest, res) => {
  const ctx = await requireTeamPlan(req);
  if (!ctx) {
    res.status(403).json({ error: 'Los equipos requieren un plan Starter, Business o Enterprise.', code: 'PLAN' });
    return;
  }
  const user = (await User.findById(req.userId))!;
  let team = await Team.findOne({ ownerId: req.userId });
  if (!team) {
    team = await Team.create({ name: `Equipo de ${user.name.split(/\s+/)[0]}`, ownerId: req.userId, members: [] });
  }
  res.json({ team: await teamJson(team, ctx, user.name, user.email) });
});

teamRouter.put('/team', async (req: AuthedRequest, res) => {
  const ctx = await requireTeamPlan(req);
  if (!ctx) {
    res.status(403).json({ error: 'Los equipos requieren un plan de equipos.', code: 'PLAN' });
    return;
  }
  const name = String(req.body?.name ?? '').trim();
  if (name.length < 2 || name.length > 80) {
    res.status(400).json({ error: 'Nombre de equipo inválido.' });
    return;
  }
  const user = (await User.findById(req.userId))!;
  const team = await Team.findOneAndUpdate({ ownerId: req.userId }, { name }, { new: true });
  if (!team) {
    res.status(404).json({ error: 'Equipo no encontrado.' });
    return;
  }
  res.json({ team: await teamJson(team, ctx, user.name, user.email) });
});

/**
 * Invita solo con el correo. Si ya existe una cuenta con ese correo se detecta
 * al usuario (nombre real y estado activo); si no, queda como invitado.
 */
teamRouter.post('/team/members', async (req: AuthedRequest, res) => {
  const ctx = await requireTeamPlan(req);
  if (!ctx) {
    res.status(403).json({ error: 'Los equipos requieren un plan de equipos.', code: 'PLAN' });
    return;
  }
  const email = String(req.body?.email ?? '').toLowerCase().trim();
  const role = (ROLES.includes(req.body?.role) ? req.body.role : 'editor') as TeamRole;
  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: 'Correo inválido.' });
    return;
  }
  const user = (await User.findById(req.userId))!;
  const team = await Team.findOne({ ownerId: req.userId });
  if (!team) {
    res.status(404).json({ error: 'Equipo no encontrado.' });
    return;
  }
  if (email === user.email || team.members.some((m) => m.email === email)) {
    res.status(409).json({ error: 'Ese correo ya está en el equipo.' });
    return;
  }
  if (ctx.limit !== null && team.members.length + 1 >= ctx.limit) {
    res.status(403).json({
      error: `Tu plan permite ${ctx.limit} miembros. Mejora el plan para invitar más.`,
      code: 'PLAN'
    });
    return;
  }
  const existing = await User.findOne({ email });
  const fallbackName = email
    .split('@')[0]
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  team.members.push({
    name: existing ? existing.name : fallbackName,
    email,
    role,
    status: existing ? 'activo' : 'invitado'
  });
  await team.save();
  res.json({
    team: await teamJson(team, ctx, user.name, user.email),
    detected: existing ? existing.name : null
  });
});

/** Datos para invitar por enlace, código y QR. */
teamRouter.get('/team/invite', async (req: AuthedRequest, res) => {
  const ctx = await requireTeamPlan(req);
  if (!ctx) {
    res.status(403).json({ error: 'Los equipos requieren un plan de equipos.', code: 'PLAN' });
    return;
  }
  const team = await Team.findOne({ ownerId: req.userId });
  if (!team) {
    res.status(404).json({ error: 'Equipo no encontrado.' });
    return;
  }
  if (!team.inviteCode) {
    team.inviteCode = newInviteCode();
    await team.save();
  }
  const origin = String(req.query.origin ?? '').replace(/[^a-zA-Z0-9:/.\-]/g, '') || 'http://localhost:4200';
  const url = `${origin}/unirse?c=${team.inviteCode}`;
  const qr = await QRCode.toDataURL(url, {
    width: 480,
    margin: 1,
    color: { dark: '#141418', light: '#FFFFFF' }
  });
  res.json({ code: team.inviteCode, url, qr });
});

/* ==================== Carpetas compartidas ==================== */

/** Carpetas del equipo del usuario (dueño o miembro), con conteo de archivos. */
teamRouter.get('/team/folders', async (req: AuthedRequest, res) => {
  const ctx = await findTeamCtx(req.userId!);
  if (!ctx) {
    res.status(404).json({ error: 'No perteneces a ningún equipo.', code: 'NOTEAM' });
    return;
  }
  await ensureDefaultFolder(ctx.team);
  const counts = await Conversion.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { teamId: ctx.team._id } },
    { $group: { _id: '$folderId', n: { $sum: 1 } } }
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json({
    teamId: String(ctx.team._id),
    teamName: ctx.team.name,
    isOwner: ctx.isOwner,
    role: ctx.memberRole,
    folders: ctx.team.folders.map((f) => ({
      id: String(f._id),
      name: f.name,
      count: countMap.get(String(f._id)) ?? 0
    }))
  });
});

teamRouter.post('/team/folders', async (req: AuthedRequest, res) => {
  const ctx = await findTeamCtx(req.userId!);
  if (!ctx) {
    res.status(404).json({ error: 'No perteneces a ningún equipo.', code: 'NOTEAM' });
    return;
  }
  const name = String(req.body?.name ?? '').trim();
  if (name.length < 2 || name.length > 40) {
    res.status(400).json({ error: 'El nombre debe tener entre 2 y 40 caracteres.' });
    return;
  }
  if (ctx.team.folders.length >= 20) {
    res.status(400).json({ error: 'Máximo 20 carpetas por equipo.' });
    return;
  }
  if (ctx.team.folders.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
    res.status(409).json({ error: 'Ya existe una carpeta con ese nombre.' });
    return;
  }
  ctx.team.folders.push({ name } as TeamDoc['folders'][number]);
  await ctx.team.save();
  const f = ctx.team.folders[ctx.team.folders.length - 1];
  res.json({ folder: { id: String(f._id), name: f.name, count: 0 } });
});

/** Elimina una carpeta (dueño o admin); sus archivos pasan a "General". */
teamRouter.delete('/team/folders/:id', async (req: AuthedRequest, res) => {
  const ctx = await findTeamCtx(req.userId!);
  if (!ctx) {
    res.status(404).json({ error: 'No perteneces a ningún equipo.', code: 'NOTEAM' });
    return;
  }
  if (!ctx.isOwner && ctx.memberRole !== 'admin') {
    res.status(403).json({ error: 'Solo el dueño o un administrador puede eliminar carpetas.' });
    return;
  }
  const idx = ctx.team.folders.findIndex((f) => String(f._id) === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Carpeta no encontrada.' });
    return;
  }
  ctx.team.folders.splice(idx, 1);
  await ctx.team.save();
  await ensureDefaultFolder(ctx.team);
  const fallback = ctx.team.folders[0];
  await Conversion.updateMany(
    { teamId: ctx.team._id, folderId: req.params.id },
    { folderId: fallback._id }
  );
  res.json({ ok: true });
});

/** Contenido de una carpeta compartida (cualquier miembro puede verlo). */
teamRouter.get('/team/library', async (req: AuthedRequest, res) => {
  const ctx = await findTeamCtx(req.userId!);
  if (!ctx) {
    res.status(404).json({ error: 'No perteneces a ningún equipo.', code: 'NOTEAM' });
    return;
  }
  const folderId = String(req.query.folder ?? '');
  if (!Types.ObjectId.isValid(folderId)) {
    res.status(400).json({ error: 'Carpeta inválida.' });
    return;
  }
  const items = await Conversion.find({ teamId: ctx.team._id, folderId })
    .sort({ createdAt: -1 })
    .limit(60)
    .select('originalName mode width height svgBytes preview createdAt userId')
    .populate<{ userId: { name?: string } | null }>('userId', 'name')
    .lean();
  res.json(
    items.map((d) => ({
      id: String(d._id),
      originalName: d.originalName,
      mode: d.mode,
      width: d.width,
      height: d.height,
      svgBytes: d.svgBytes,
      preview: d.preview,
      createdAt: d.createdAt,
      savedBy: d.userId?.name ?? '—'
    }))
  );
});

/** Elimina un archivo de la carpeta (dueño, admin o quien lo guardó). */
teamRouter.delete('/team/library/:id', async (req: AuthedRequest, res) => {
  const ctx = await findTeamCtx(req.userId!);
  if (!ctx) {
    res.status(404).json({ error: 'No perteneces a ningún equipo.', code: 'NOTEAM' });
    return;
  }
  const doc = await Conversion.findOne({ _id: req.params.id, teamId: ctx.team._id });
  if (!doc) {
    res.status(404).json({ error: 'Archivo no encontrado.' });
    return;
  }
  const canDelete =
    ctx.isOwner || ctx.memberRole === 'admin' || String(doc.userId) === req.userId;
  if (!canDelete) {
    res.status(403).json({ error: 'No puedes eliminar archivos de otros miembros.' });
    return;
  }
  await doc.deleteOne();
  res.json({ ok: true });
});

/** Unirse a un equipo con el código de invitación. */
teamRouter.post('/team/join', async (req: AuthedRequest, res) => {
  const code = String(req.body?.code ?? '').toUpperCase().trim();
  if (!/^[A-Z2-9]{8}$/.test(code)) {
    res.status(400).json({ error: 'Código de invitación inválido.' });
    return;
  }
  const team = await Team.findOne({ inviteCode: code });
  if (!team) {
    res.status(404).json({ error: 'No existe un equipo con ese código.' });
    return;
  }
  const owner = await User.findById(team.ownerId);
  const me = await User.findById(req.userId);
  if (!owner || !me) {
    res.status(404).json({ error: 'Equipo no disponible.' });
    return;
  }
  if (String(team.ownerId) === req.userId) {
    res.status(409).json({ error: 'Este equipo es tuyo.' });
    return;
  }
  const existing = team.members.find((m) => m.email === me.email);
  if (existing) {
    existing.status = 'activo';
    existing.name = me.name;
    await team.save();
    res.json({ ok: true, teamName: team.name });
    return;
  }
  const limit = seatLimit(effectivePlan(owner));
  if (limit !== null && team.members.length + 1 >= limit) {
    res.status(403).json({ error: 'El equipo ya no tiene asientos libres.', code: 'PLAN' });
    return;
  }
  team.members.push({ name: me.name, email: me.email, role: 'editor', status: 'activo' });
  await team.save();
  res.json({ ok: true, teamName: team.name });
});

teamRouter.put('/team/members/:email', async (req: AuthedRequest, res) => {
  const ctx = await requireTeamPlan(req);
  if (!ctx) {
    res.status(403).json({ error: 'Los equipos requieren un plan de equipos.', code: 'PLAN' });
    return;
  }
  const role = req.body?.role as TeamRole;
  if (!ROLES.includes(role)) {
    res.status(400).json({ error: 'Rol desconocido.' });
    return;
  }
  const user = (await User.findById(req.userId))!;
  const team = await Team.findOne({ ownerId: req.userId });
  const member = team?.members.find((m) => m.email === req.params.email.toLowerCase());
  if (!team || !member) {
    res.status(404).json({ error: 'Miembro no encontrado.' });
    return;
  }
  member.role = role;
  await team.save();
  res.json({ team: await teamJson(team, ctx, user.name, user.email) });
});

teamRouter.delete('/team/members/:email', async (req: AuthedRequest, res) => {
  const ctx = await requireTeamPlan(req);
  if (!ctx) {
    res.status(403).json({ error: 'Los equipos requieren un plan de equipos.', code: 'PLAN' });
    return;
  }
  const user = (await User.findById(req.userId))!;
  const team = await Team.findOne({ ownerId: req.userId });
  if (!team) {
    res.status(404).json({ error: 'Equipo no encontrado.' });
    return;
  }
  const before = team.members.length;
  team.members = team.members.filter((m) => m.email !== req.params.email.toLowerCase());
  if (team.members.length === before) {
    res.status(404).json({ error: 'Miembro no encontrado.' });
    return;
  }
  await team.save();
  res.json({ team: await teamJson(team, ctx, user.name, user.email) });
});
