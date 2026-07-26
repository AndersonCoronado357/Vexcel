// Service worker mínimo para que Vexcel sea instalable (PWA). Passthrough puro:
// NO interceptamos las respuestas (no llamamos a respondWith), así el navegador
// maneja la red con normalidad. La instalabilidad solo exige que exista un
// listener de 'fetch'. (El modo offline queda para más adelante.)
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', () => {
  /* passthrough: sin respondWith */
});
