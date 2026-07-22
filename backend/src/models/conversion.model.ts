import { Schema, model, Types } from 'mongoose';

export interface ConversionDoc {
  userId: Types.ObjectId;
  /** Si se guardó en una carpeta compartida de equipo. */
  teamId: Types.ObjectId | null;
  folderId: Types.ObjectId | null;
  originalName: string;
  mode: 'mono' | 'color';
  params: Record<string, unknown>;
  svg: string;
  width: number;
  height: number;
  svgBytes: number;
  originalBytes: number;
  /** PNG pequeño en data URI para la lista del historial. */
  preview: string;
  createdAt: Date;
}

const conversionSchema = new Schema<ConversionDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', default: null, index: true },
    folderId: { type: Schema.Types.ObjectId, default: null },
    originalName: { type: String, required: true },
    mode: { type: String, enum: ['mono', 'color'], required: true },
    params: { type: Schema.Types.Mixed, default: {} },
    svg: { type: String, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    svgBytes: { type: Number, required: true },
    originalBytes: { type: Number, required: true },
    preview: { type: String, default: '' }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Conversion = model<ConversionDoc>('Conversion', conversionSchema);
