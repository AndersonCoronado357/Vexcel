import { Schema, model, Types } from 'mongoose';
import type { Plan } from './user.model.js';

export type TeamRole = 'admin' | 'editor' | 'viewer';

export interface TeamMember {
  name: string;
  email: string;
  role: TeamRole;
  status: 'activo' | 'invitado';
}

export interface TeamFolder {
  _id: Types.ObjectId;
  name: string;
}

export interface TeamDoc {
  name: string;
  ownerId: Types.ObjectId;
  members: TeamMember[];
  /** Carpetas compartidas donde el equipo guarda sus conversiones. */
  folders: TeamFolder[];
  /** Código corto para unirse por enlace/QR. */
  inviteCode: string;
  createdAt: Date;
}

export function newInviteCode(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += abc[Math.floor(Math.random() * abc.length)];
  return out;
}

/** Asientos por plan (incluye al dueño). null = ilimitado; 0 = sin equipo. */
export function seatLimit(plan: Plan): number | null {
  switch (plan) {
    case 'starter':
      return 3;
    case 'business':
      return 10;
    case 'enterprise':
      return null;
    default:
      return 0;
  }
}

const memberSchema = new Schema<TeamMember>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ['admin', 'editor', 'viewer'], default: 'editor' },
    status: { type: String, enum: ['activo', 'invitado'], default: 'invitado' }
  },
  { _id: false }
);

const folderSchema = new Schema<TeamFolder>({
  name: { type: String, required: true, trim: true, maxlength: 40 }
});

const teamSchema = new Schema<TeamDoc>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    members: { type: [memberSchema], default: [] },
    folders: { type: [folderSchema], default: [] },
    inviteCode: { type: String, default: newInviteCode, index: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Team = model<TeamDoc>('Team', teamSchema);
