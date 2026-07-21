/**
 * Validación automática del tracer multicolor (guía del usuario).
 * Genera una imagen de referencia, la vectoriza, rasteriza el SVG y compara:
 *   - Diferencia de área figura/fondo (≈ 0; positiva grande = trazo engordado).
 *   - Error "lejos de fronteras de color" (debe ser 0; una mancha = falta un color).
 *   - Sobre fondo magenta: halos (casi-blanco dentro) y costuras (magenta atrapado).
 *
 * Uso: node test/validate-color.mjs   (requiere el backend en :5178 y la cuenta demo)
 */
import sharp from 'sharp';

const BASE = 'http://localhost:5178';
const SIZE = 500;

async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'andrea@vexcel.app', password: 'andrea12345' })
  });
  return (await r.json()).token;
}

/** Imagen de prueba: figura multicolor con dos tonos MUY cercanos (Lab ~11). */
function referenceSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <circle cx="200" cy="220" r="120" fill="#2ec4d6"/>
    <circle cx="320" cy="250" r="90" fill="#3ccadb"/>  <!-- casi igual al anterior -->
    <path d="M110 320 Q250 250 390 320 L390 420 L110 420 Z" fill="#1a9fb5"/>
    <circle cx="370" cy="150" r="26" fill="#127a8c"/>
  </svg>`;
}

async function rasterFlat(buf, bg) {
  return sharp(buf).resize(SIZE, SIZE, { fit: 'contain', background: bg })
    .flatten({ background: bg }).raw().toBuffer();
}

async function run() {
  const token = await login();
  const refPng = await sharp(Buffer.from(referenceSvg())).png().toBuffer();

  const form = new FormData();
  form.append('image', new Blob([refPng], { type: 'image/png' }), 'ref.png');
  form.append('mode', 'color');
  form.append('opttolerance', '0.3');
  const res = await fetch(`${BASE}/api/vectorize`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form
  });
  const data = await res.json();
  if (data.error) { console.log('ERROR', data.error); return; }
  const svgBuf = Buffer.from(data.svg);

  // Referencia y SVG sobre blanco (para figura/fondo) y sobre magenta (halos/costuras)
  const refW = await rasterFlat(refPng, '#ffffff');
  const svgW = await rasterFlat(svgBuf, '#ffffff');
  const refM = await rasterFlat(refPng, '#ff00ff');
  const svgM = await rasterFlat(svgBuf, '#ff00ff');

  const isInk = (px, i) => Math.hypot(px[i * 3] - 255, px[i * 3 + 1] - 255, px[i * 3 + 2] - 255) > 40;
  // fronteras de color: píxel del ref cuyos vecinos cambian de color (antialias inevitable)
  const nearBoundary = new Uint8Array(SIZE * SIZE);
  for (let y = 1; y < SIZE - 1; y++) for (let x = 1; x < SIZE - 1; x++) {
    const i = y * SIZE + x;
    const c = (j) => `${refW[j * 3] >> 4},${refW[j * 3 + 1] >> 4},${refW[j * 3 + 2] >> 4}`;
    const here = c(i);
    if (c(i - 1) !== here || c(i + 1) !== here || c(i - SIZE) !== here || c(i + SIZE) !== here)
      nearBoundary[i] = 1;
  }

  let refInk = 0, areaDiff = 0, farErr = 0, boundaryErr = 0, halo = 0, seam = 0, figPixels = 0;
  for (let i = 0; i < SIZE * SIZE; i++) {
    const a = isInk(svgW, i), b = isInk(refW, i);
    if (b) refInk++;
    if (a && !b) areaDiff++;                 // trazo engordó (positiva)
    // error de color real: dentro de la figura, color muy distinto y lejos de frontera
    if (a && b) {
      figPixels++;
      const dc = Math.hypot(svgW[i * 3] - refW[i * 3], svgW[i * 3 + 1] - refW[i * 3 + 1], svgW[i * 3 + 2] - refW[i * 3 + 2]);
      if (dc > 40) { if (nearBoundary[i]) boundaryErr++; else farErr++; }
    }
    // magenta: dentro de la figura (ref) ¿el SVG dejó casi-blanco (halo) o magenta (costura)?
    if (b) {
      const r = svgM[i * 3], g = svgM[i * 3 + 1], bl = svgM[i * 3 + 2];
      if (r > 235 && g > 235 && bl > 235) halo++;
      if (r > 220 && g < 60 && bl > 220) seam++;
    }
  }

  const pct = (n) => ((n / (refInk || 1)) * 100).toFixed(2) + '%';
  console.log(JSON.stringify({
    coloresDetectados: data.palette.length,
    paleta: data.palette,
    areaSobrante: areaDiff + ' px (' + pct(areaDiff) + ')',
    errorLejosDeFronteras: farErr + ' px (' + pct(farErr) + ')  <-- debe ser ~0',
    errorEnFronteras: boundaryErr + ' px (' + pct(boundaryErr) + ')  (antialias, aceptable)',
    halos: halo + ' px',
    costuras: seam + ' px',
    bytes: data.bytes,
    dims: data.width + 'x' + data.height
  }, null, 2));
}

run();
