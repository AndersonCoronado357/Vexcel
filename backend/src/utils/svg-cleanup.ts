/** Utilidades de post-procesado del SVG generado por los tracers. */

export interface SvgInfo {
  width: number;
  height: number;
}

/** Quita metadata, comentarios y DOCTYPE del SVG. */
export function stripMetadata(svg: string): string {
  return svg
    .replace(/<\?xml[\s\S]*?\?>\s*/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>\s*/g, '')
    .replace(/<!--[\s\S]*?-->\s*/g, '')
    .replace(/<metadata>[\s\S]*?<\/metadata>\s*/g, '')
    .replace(/<desc>[\s\S]*?<\/desc>\s*/g, '')
    .trim();
}

/** Redondea las coordenadas a `decimals` decimales: archivo mucho más liviano. */
export function reducePrecision(svg: string, decimals = 2): string {
  const f = 10 ** decimals;
  return svg.replace(/-?\d+\.\d+/g, (m) => String(Math.round(parseFloat(m) * f) / f));
}

/** Elimina paths sin geometría útil (d vacío o con muy pocos comandos). */
export function dropEmptyPaths(svg: string): string {
  return svg.replace(/<path\b[^>]*\bd="([^"]*)"[^>]*\/>/g, (match, d) => {
    const commands = (d.match(/[MLCQAZ]/gi) ?? []).length;
    return commands >= 3 ? match : '';
  });
}

/** Lee dimensiones desde el viewBox (o width/height) del SVG. */
export function readDimensions(svg: string): SvgInfo {
  const vb = svg.match(/viewBox\s*=\s*"([\d.\s\-eE]+)"/);
  if (vb) {
    const parts = vb[1].trim().split(/\s+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      return { width: Math.round(parts[2]), height: Math.round(parts[3]) };
    }
  }
  const w = svg.match(/width\s*=\s*"([\d.]+)/);
  const h = svg.match(/height\s*=\s*"([\d.]+)/);
  return {
    width: w ? Math.round(Number(w[1])) : 0,
    height: h ? Math.round(Number(h[1])) : 0
  };
}

/**
 * Normaliza el elemento raíz: viewBox presente y width/height en píxeles
 * enteros (potrace binario emite pt).
 */
export function normalizeRoot(svg: string): string {
  const open = svg.match(/<svg[^>]*>/);
  if (!open) return svg;
  const tag = open[0];
  let vb = tag.match(/viewBox\s*=\s*"([\d.\s\-eE]+)"/)?.[1];
  if (!vb) {
    const w = tag.match(/width\s*=\s*"([\d.]+)/)?.[1];
    const h = tag.match(/height\s*=\s*"([\d.]+)/)?.[1];
    if (!w || !h) return svg;
    vb = `0 0 ${w} ${h}`;
  }
  const [, , wRaw, hRaw] = vb.trim().split(/\s+/).map(Number);
  const width = Math.round(wRaw);
  const height = Math.round(hRaw);
  const newTag = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${wRaw} ${hRaw}" width="${width}" height="${height}">`;
  // Conserva transforms internos: solo se reemplaza la etiqueta de apertura.
  return svg.replace(tag, newTag);
}

/** Fuerza el color de relleno en todos los paths/grupos (modo un color). */
export function applyFill(svg: string, color: string): string {
  return svg.replace(/fill="(?!none)[^"]*"/g, `fill="${color}"`);
}

/** Inserta un rect de fondo blanco detrás del contenido. */
export function addWhiteBackground(svg: string): string {
  const open = svg.match(/<svg[^>]*>/);
  if (!open) return svg;
  return svg.replace(open[0], `${open[0]}<rect width="100%" height="100%" fill="#FFFFFF"/>`);
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseFill(fill: string): Rgb | null {
  const rgb = fill.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3] };
  if (/^#[0-9a-fA-F]{6}$/.test(fill)) {
    const n = parseInt(fill.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  return null;
}

/**
 * Elimina las capas cuyo relleno coincide con el color de fondo de la imagen
 * (detectado en el borde), para que el fondo siempre quede fuera del vector.
 */
export function removeBackgroundLayers(svg: string, bg: Rgb, tolerance = 55): string {
  return svg.replace(/<path[^>]*?fill="([^"]*)"[^>]*?\/>/g, (match, fill) => {
    const c = parseFill(fill);
    if (!c) return match;
    const dist = Math.hypot(c.r - bg.r, c.g - bg.g, c.b - bg.b);
    return dist <= tolerance ? '' : match;
  });
}

/** Paleta de colores presentes en el SVG final (hex únicos, en orden). */
export function extractPalette(svg: string, max = 16): string[] {
  const seen = new Set<string>();
  for (const m of svg.matchAll(/fill="(rgb\(\d+,\s*\d+,\s*\d+\)|#[0-9a-fA-F]{6})"/g)) {
    const c = parseFill(m[1]);
    if (!c) continue;
    const hex =
      '#' + [c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();
    if (hex === '#FFFFFF' && seen.size === 0 && svg.includes('rect')) continue;
    seen.add(hex);
    if (seen.size >= max) break;
  }
  return [...seen];
}
