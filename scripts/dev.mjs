/**
 * Orquestador de desarrollo de Vexcel.
 * 1. Verifica potrace.
 * 2. Levanta el backend en un puerto libre (desde 5178).
 * 3. Genera el proxy y levanta el frontend en un puerto libre (desde 4200).
 * 4. Imprime las URLs finales.
 */
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const isWin = process.platform === 'win32';
const npx = isWin ? 'npx.cmd' : 'npx';

function canBind(port, host) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', (err) => {
      // Familia no soportada en esta máquina: no cuenta como ocupado.
      resolve(err.code === 'EADDRNOTAVAIL' || err.code === 'EAFNOSUPPORT');
    });
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, host);
  });
}

async function isPortFree(port) {
  // Libre solo si se puede enlazar en IPv4 e IPv6 (localhost puede resolver a ::1).
  return (await canBind(port, '127.0.0.1')) && (await canBind(port, '::1'));
}

async function findFreePort(start) {
  for (let p = start; p < start + 200; p++) {
    if (await isPortFree(p)) return p;
  }
  throw new Error(`Sin puertos libres desde ${start}`);
}

// 1. potrace
const potrace = spawnSync('potrace', ['--version'], { shell: isWin, encoding: 'utf8' });
if (potrace.status === 0) {
  console.log('[check] potrace del sistema: OK');
} else {
  console.log(
    '[check] potrace no está instalado: se usará el port JS de potrace.\n' +
      '        (Opcional) instala el binario para el motor nativo: https://potrace.sourceforge.net'
  );
}

// 2. Backend
const backendPort = await findFreePort(5178);
console.log(`[backend] arrancando en puerto ${backendPort}...`);
const backend = spawn(npx, ['tsx', 'src/server.ts'], {
  cwd: path.join(root, 'backend'),
  env: { ...process.env, PORT: String(backendPort) },
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: isWin
});
backend.stdout.on('data', (d) => process.stdout.write(`[backend] ${d}`));
backend.stderr.on('data', (d) => process.stderr.write(`[backend] ${d}`));

// 3. Proxy + frontend
const proxyPath = path.join(root, 'frontend', 'proxy.conf.json');
fs.writeFileSync(
  proxyPath,
  JSON.stringify({ '/api': { target: `http://localhost:${backendPort}`, secure: false } }, null, 2)
);

const frontendPort = await findFreePort(4200);
console.log(`[frontend] arrancando en puerto ${frontendPort}...`);
const frontend = spawn(
  npx,
  ['ng', 'serve', '--port', String(frontendPort), '--proxy-config', 'proxy.conf.json'],
  {
    cwd: path.join(root, 'frontend'),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isWin
  }
);
let urlsPrinted = false;
frontend.stdout.on('data', (d) => {
  process.stdout.write(`[frontend] ${d}`);
  if (!urlsPrinted && String(d).includes('Application bundle generation complete')) {
    urlsPrinted = true;
    setTimeout(() => {
      console.log('\n──────────────────────────────────────────');
      console.log(`  Vexcel listo:`);
      console.log(`  Frontend:  http://localhost:${frontendPort}`);
      console.log(`  Backend:   http://localhost:${backendPort}/api/status`);
      console.log('──────────────────────────────────────────\n');
    }, 300);
  }
});
frontend.stderr.on('data', (d) => process.stderr.write(`[frontend] ${d}`));

function shutdown() {
  backend.kill();
  frontend.kill();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
backend.on('exit', (code) => {
  if (code !== null && code !== 0) {
    console.error(`[backend] terminó con código ${code}`);
  }
});
