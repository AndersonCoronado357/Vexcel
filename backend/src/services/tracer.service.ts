import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import * as potraceJs from 'potrace';
import ImageTracer from 'imagetracerjs';
import { config } from '../config.js';
import {
  addWhiteBackground,
  applyFill,
  dropEmptyPaths,
  extractPalette,
  normalizeRoot,
  readDimensions,
  reducePrecision,
  removeBackgroundLayers,
  stripMetadata,
  type Rgb,
  type SvgInfo
} from '../utils/svg-cleanup.js';

export interface TraceParams {
  mode: 'mono' | 'color';
  /** 0-255: corte claro/oscuro para binarizar (modo mono). */
  threshold: number;
  /** 2-16: colores conservados (modo color). */
  colors: number;
  /** potrace alphamax 0-1.34: suavizado de esquinas. */
  alphamax: number;
  /** potrace opttolerance 0-1.5: simplificación de curvas. */
  opttolerance: number;
  /** potrace turdsize: área mínima en px para conservar motas. */
  turdsize: number;
  /** 0.2-1: escala de trazado (el nivel de detalle baja la resolución). */
  scale: number;
  /** Tope de resolución de trazado según el plan (calidad de descarga). */
  capDim: number;
  /** Hex para forzar relleno sólido (mono), o null para negro. */
  fillColor: string | null;
  background: 'transparent' | 'white';
}

export interface TraceResult extends SvgInfo {
  svg: string;
  bytes: number;
  engine: string;
  /** Colores presentes en el SVG resultante. */
  palette: string[];
}

/**
 * Color de fondo de la imagen: el color dominante del borde (anillo exterior).
 * Sirve para eliminar siempre la capa de fondo del vector.
 */
function borderColor(data: Buffer, width: number, height: number): Rgb {
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  const sample = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(key, e);
  };
  const stepX = Math.max(1, Math.floor(width / 64));
  const stepY = Math.max(1, Math.floor(height / 64));
  for (let x = 0; x < width; x += stepX) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 0; y < height; y += stepY) {
    sample(0, y);
    sample(width - 1, y);
  }
  let best = { n: 0, r: 255, g: 255, b: 255 };
  for (const e of buckets.values()) if (e.n > best.n) best = e;
  const n = Math.max(1, best.n);
  return { r: Math.round(best.r / n), g: Math.round(best.g / n), b: Math.round(best.b / n) };
}

let systemPotrace = false;
export function setSystemPotrace(available: boolean): void {
  systemPotrace = available;
}
export function hasSystemPotrace(): boolean {
  return systemPotrace;
}

/**
 * Aplana alfa sobre blanco y limita el tamaño para trazar. `scale` reduce la
 * resolución de trazado (menos detalle = trazo más simple y liviano).
 */
async function preprocess(input: Buffer, scale = 1, capDim = config.maxDimension) {
  const meta = await sharp(input).metadata();
  // Piso de 640px: las imágenes pequeñas se amplían para trazar curvas suaves.
  const base = Math.min(capDim, Math.max(640, meta.width ?? 512, meta.height ?? 512));
  const target = Math.max(96, Math.round(base * scale));
  return sharp(input)
    .flatten({ background: '#FFFFFF' })
    .resize(target, target, { fit: 'inside', withoutEnlargement: false });
}

interface Lab {
  L: number;
  a: number;
  b: number;
}

/** sRGB (0-255) -> CIE Lab (D65). Para juzgar cercanía de color como el ojo. */
function rgbToLab(r: number, g: number, b: number): Lab {
  const lin = (v: number) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r), G = lin(g), B = lin(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x); y = f(y); z = f(z);
  return { L: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
}

/** Distancia perceptual CIE76 entre dos colores Lab. */
function labDist(p: Lab, q: Lab): number {
  return Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);
}

/**
 * Paleta perceptual: parte de muchos clústeres (histograma fino) y los funde
 * SOLO cuando su distancia Lab es < 7 (fusión suave, no agresiva), para no
 * borrar tonos legítimos cercanos. Devuelve los colores reales de la imagen.
 */
function labPalette(data: Buffer, total: number): Rgb[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  const step = Math.max(1, Math.floor(total / 200_000));
  for (let i = 0; i < total; i += step) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(key, e);
  }
  // Hasta 20 clústeres iniciales por frecuencia.
  let clusters = [...buckets.values()]
    .sort((x, y) => y.n - x.n)
    .slice(0, 20)
    .map((e) => {
      const r = e.r / e.n, g = e.g / e.n, b = e.b / e.n;
      return { n: e.n, r, g, b, lab: rgbToLab(r, g, b) };
    });

  // Fusión perceptual < 7 en Lab (promedio ponderado por área).
  let merged = true;
  while (merged && clusters.length > 1) {
    merged = false;
    for (let i = 0; i < clusters.length && !merged; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        if (labDist(clusters[i].lab, clusters[j].lab) < 7) {
          const a = clusters[i], b = clusters[j], n = a.n + b.n;
          const r = (a.r * a.n + b.r * b.n) / n;
          const g = (a.g * a.n + b.g * b.n) / n;
          const bl = (a.b * a.n + b.b * b.n) / n;
          clusters[i] = { n, r, g, b: bl, lab: rgbToLab(r, g, bl) };
          clusters.splice(j, 1);
          merged = true;
          break;
        }
      }
    }
  }
  const tot = clusters.reduce((s, c) => s + c.n, 0) || 1;
  const kept = clusters.filter((c) => c.n / tot >= 0.003);
  const final = (kept.length ? kept : clusters).slice(0, 16);
  return final.map((c) => ({ r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) }));
}

/** Índice del color de paleta perceptualmente más cercano a un RGB. */
function nearestPalIndex(r: number, g: number, b: number, labs: Lab[]): number {
  const lab = rgbToLab(r, g, b);
  let best = 0, bd = Infinity;
  for (let k = 0; k < labs.length; k++) {
    const d = labDist(lab, labs[k]);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

function rgbHex(c: Rgb): string {
  return '#' + [c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * Máscara binaria del modo un color. Pipeline para bordes limpios:
 * 1. Aplana el alfa sobre blanco (imágenes con transparencia).
 * 2. SUPERMUESTREA (2x, mín. 1400px) con interpolación lanczos: potrace traza a
 *    resolución de píxel, así que a mayor resolución las curvas salen suaves.
 * 3. Mediana 3x3: elimina píxeles sueltos (ruido de compresión).
 * 4. Desenfoque leve: suaviza el antialias del borde antes de umbralizar, lo
 *    que evita el borde dentado que produce un corte crudo sobre RGB.
 * 5. Umbraliza por DISTANCIA al color de fondo detectado (no "oscuro"): funciona
 *    con fondo blanco, negro o de color, y tolera fondos casi-blancos (#FAFAFA).
 * Devuelve `ssFactor` para escalar el turdsize (área) proporcionalmente.
 */
async function monoMask(
  input: Buffer,
  p: TraceParams
): Promise<{ mask: Buffer; width: number; height: number; ssFactor: number }> {
  const meta = await sharp(input).metadata();
  const orig = Math.max(meta.width ?? 512, meta.height ?? 512);
  const target = Math.min(p.capDim, Math.max(1400, Math.min(orig * 2, 2600)));

  const { data, info } = await sharp(input)
    .flatten({ background: '#FFFFFF' })
    .resize(target, target, { fit: 'inside', withoutEnlargement: false, kernel: 'lanczos3' })
    .median(3)
    .blur(0.8)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ssFactor = Math.max(1, info.width, info.height) / Math.max(1, orig);
  const bg = borderColor(data, info.width, info.height);
  // threshold 60-220 (umbral 0-100%) -> distancia de corte 200-40:
  // umbral alto = corte bajo = más píxeles cuentan como figura.
  const cutoff = Math.max(40, Math.min(200, 260 - p.threshold));
  const mask = Buffer.alloc(info.width * info.height, 255);
  for (let i = 0; i < info.width * info.height; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    if (Math.hypot(r - bg.r, g - bg.g, b - bg.b) > cutoff) mask[i] = 0;
  }
  return { mask, width: info.width, height: info.height, ssFactor };
}

/** turdsize escalado al supermuestreo (área ∝ ssFactor²). La mediana ya quita
 *  el ruido fino, así que la base es baja para conservar puntos legítimos. */
function scaledTurdsize(base: number, ssFactor: number): number {
  return Math.min(600, Math.round((base + 1) * (ssFactor * ssFactor) * 0.5));
}

/** Empaqueta la máscara (0 = tinta) como PBM P4 (1 bit por pixel). */
function toPbm(mask: Buffer, width: number, height: number): Buffer {
  const rowBytes = Math.ceil(width / 8);
  const header = Buffer.from(`P4\n${width} ${height}\n`, 'ascii');
  const body = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] < 128) {
        body[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  return Buffer.concat([header, body]);
}

function runSystemPotrace(pbmPath: string, svgPath: string, p: TraceParams, turdsize: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      pbmPath,
      '-s',
      '-o',
      svgPath,
      '--turdsize',
      String(turdsize),
      '--alphamax',
      String(p.alphamax),
      '--opttolerance',
      String(p.opttolerance)
    ];
    const proc = spawn('potrace', args);
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d));
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`potrace salió con código ${code}: ${stderr}`))
    );
  });
}

/** Modo un solo color con el binario potrace del sistema. */
async function traceMonoSystem(input: Buffer, p: TraceParams): Promise<{ svg: string; engine: string }> {
  const { mask, width, height, ssFactor } = await monoMask(input, p);
  const pbm = toPbm(mask, width, height);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vexcel-'));
  const pbmPath = path.join(tmpDir, 'mask.pbm');
  const svgPath = path.join(tmpDir, 'out.svg');
  try {
    await fs.writeFile(pbmPath, pbm);
    await runSystemPotrace(pbmPath, svgPath, p, scaledTurdsize(p.turdsize, ssFactor));
    const svg = await fs.readFile(svgPath, 'utf8');
    return { svg, engine: 'potrace (sistema)' };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

/** Modo un solo color con el port JS de potrace (fallback sin binario). */
async function traceMonoJs(input: Buffer, p: TraceParams): Promise<{ svg: string; engine: string }> {
  const { mask, width, height, ssFactor } = await monoMask(input, p);
  const png = await sharp(mask, { raw: { width, height, channels: 1 } }).png().toBuffer();
  const svg = await new Promise<string>((resolve, reject) => {
    potraceJs.trace(
      png,
      {
        // La máscara ya está binarizada (0/255): el corte fijo solo la respeta.
        threshold: 128,
        turdSize: scaledTurdsize(p.turdsize, ssFactor),
        alphaMax: p.alphamax,
        optCurve: true,
        optTolerance: p.opttolerance,
        blackOnWhite: true,
        color: p.fillColor ?? '#000000'
      },
      (err, out) => (err ? reject(err) : resolve(out))
    );
  });
  return { svg, engine: 'potrace (port JS)' };
}

/** Traza una máscara binaria (0 = tinta) y devuelve solo el atributo `d`. */
async function tracePathFromMask(
  mask: Buffer,
  width: number,
  height: number,
  p: TraceParams,
  turdsize: number
): Promise<string> {
  const png = await sharp(mask, { raw: { width, height, channels: 1 } }).png().toBuffer();
  const svg = await new Promise<string>((resolve, reject) => {
    potraceJs.trace(
      png,
      {
        threshold: 128,
        turdSize: turdsize,
        alphaMax: p.alphamax,
        optCurve: true,
        optTolerance: p.opttolerance,
        blackOnWhite: true
      },
      (err, out) => (err ? reject(err) : resolve(out))
    );
  });
  const m = svg.match(/<path[^>]*\bd="([^"]+)"/);
  return m ? m[1] : '';
}

/**
 * Modo color completo con APILADO POR UNIÓN (exacto, sin costuras ni dilatación):
 *  - Se traza a resolución nativa (o supermuestreada si es pequeña) → curvas suaves.
 *  - Paleta perceptual en Lab con fusión suave (< 7) → no se pierden tonos reales.
 *  - Se ordenan los colores por área descendente. La capa k se traza como la UNIÓN
 *    de su región + todas las que van encima (colores más pequeños). Al pintarlas
 *    de mayor a menor, cada píxel queda con el color de su propia capa: sin
 *    costuras y con el contorno exterior exacto de la figura, sin engordar.
 */
async function traceColor(
  input: Buffer,
  p: TraceParams
): Promise<{ svg: string; engine: string; bg: Rgb; palette: Rgb[] }> {
  const meta = await sharp(input).metadata();
  const orig = Math.max(meta.width ?? 512, meta.height ?? 512);
  // Resolución NATIVA (supermuestrea si es pequeña), acotada por el plan.
  const traceDim = Math.min(p.capDim, Math.max(orig, 1200));
  const ssFactor = traceDim / Math.max(1, orig);

  const { data, info } = await sharp(input)
    .flatten({ background: '#FFFFFF' })
    .resize(traceDim, traceDim, { fit: 'inside', withoutEnlargement: false, kernel: 'lanczos3' })
    .median(2)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const W = info.width, H = info.height, N = W * H;

  // Paleta perceptual real de la imagen (colores automáticos).
  const pal = labPalette(data, N);
  const labs = pal.map((c) => rgbToLab(c.r, c.g, c.b));

  // Índice de paleta por píxel y áreas.
  const idx = new Uint8Array(N);
  const areas = new Array(pal.length).fill(0);
  for (let i = 0; i < N; i++) {
    const k = nearestPalIndex(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], labs);
    idx[i] = k;
    areas[k]++;
  }

  const bg = borderColor(data, W, H);
  const bgIdx = nearestPalIndex(bg.r, bg.g, bg.b, labs);

  // Colores del figura (sin el fondo), ordenados por área descendente.
  const order = pal
    .map((_, i) => i)
    .filter((i) => i !== bgIdx)
    .sort((a, b) => areas[b] - areas[a]);

  // rank[colorIdx] = posición de pintado (0 = abajo/mayor área). Fondo = -1.
  const rank = new Array(pal.length).fill(-1);
  order.forEach((ci, k) => (rank[ci] = k));

  const turd = scaledTurdsize(p.turdsize, ssFactor);
  const layers: string[] = [];
  for (let k = 0; k < order.length; k++) {
    // Unión: píxeles cuyo color se pinta en k o por encima (rank >= k).
    const mask = Buffer.alloc(N, 255);
    for (let i = 0; i < N; i++) {
      const r = rank[idx[i]];
      if (r >= k) mask[i] = 0; // tinta
    }
    const d = await tracePathFromMask(mask, W, H, p, turd);
    if (d) layers.push(`<path fill="${rgbHex(pal[order[k]])}" fill-rule="evenodd" d="${d}"/>`);
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    layers.join('') +
    '</svg>';
  return { svg, engine: 'apilado por unión (potrace)', bg, palette: order.map((ci) => pal[ci]) };
}

/** Punto de entrada: vectoriza según los parámetros del panel. */
export async function trace(input: Buffer, p: TraceParams): Promise<TraceResult> {
  let svg: string;
  let engine: string;
  let palette: string[];

  if (p.mode === 'color') {
    const out = await traceColor(input, p);
    engine = out.engine;
    // El apilado por unión ya excluye el fondo: no hay capa que quitar.
    svg = stripMetadata(out.svg);
    svg = normalizeRoot(svg);
    palette = out.palette.map(rgbHex);
  } else {
    if (systemPotrace) {
      ({ svg, engine } = await traceMonoSystem(input, p));
      svg = stripMetadata(svg);
      svg = normalizeRoot(svg);
      if (p.fillColor) svg = applyFill(svg, p.fillColor);
    } else {
      ({ svg, engine } = await traceMonoJs(input, p));
      svg = stripMetadata(svg);
      svg = normalizeRoot(svg);
    }
    palette = [p.fillColor ?? '#000000'];
  }

  // Salida limpia: sin paths despreciables y con coordenadas a 2 decimales.
  svg = dropEmptyPaths(svg);
  svg = reducePrecision(svg, 2);

  if (p.background === 'white') svg = addWhiteBackground(svg);

  // El SVG se traza a la escala del control de detalle, pero se presenta al
  // tamaño original: viewBox = trazado, width/height = imagen base.
  const meta = await sharp(input).metadata();
  let baseW = meta.width ?? 512;
  let baseH = meta.height ?? 512;
  const f = Math.min(1, p.capDim / Math.max(baseW, baseH));
  baseW = Math.round(baseW * f);
  baseH = Math.round(baseH * f);
  svg = svg.replace(/(<svg[^>]*?)width="\d+" height="\d+"/, `$1width="${baseW}" height="${baseH}"`);

  return { svg, width: baseW, height: baseH, bytes: Buffer.byteLength(svg, 'utf8'), engine, palette };
}

/**
 * Miniatura (data URI) para la biblioteca, a partir del SVG resultante y CON
 * FONDO TRANSPARENTE (no se aplana sobre blanco): la tarjeta no muestra caja
 * blanca. Si el SVG lleva fondo blanco propio, se respeta.
 */
export async function makePreview(svg: string): Promise<string> {
  const buf = await sharp(Buffer.from(svg), { density: 200 })
    .resize(240, 240, { fit: 'inside', withoutEnlargement: true, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return `data:image/png;base64,${buf.toString('base64')}`;
}
