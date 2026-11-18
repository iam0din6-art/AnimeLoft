/* Anime Loft - service worker.
   Aumente CACHE (animeloft-v6, v7...) a cada atualização dos arquivos para forçar o refresh. */
const CACHE = 'animeloft-v5';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'manifest.json', 'logo.jpg'];
// CDNs usadas pela interface (scripts, estilos e fontes). APIs, imagens e embeds nunca passam pelo cache.
const STATIC_HOSTS = ['cdn.tailwindcss.com', 'cdn.plyr.io', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  // Cada arquivo é guardado separadamente: se um faltar (ex.: logo.jpg), os outros continuam valendo
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin && !STATIC_HOSTS.includes(url.hostname)) return;
  if (url.pathname.endsWith('servers.json')) return; // controle remoto: sempre direto da rede

  // Páginas: rede primeiro; offline cai no index.html guardado
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('index.html')));
    return;
  }

  // Arquivos estáticos: responde do cache e atualiza em segundo plano
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => { if (res && (res.status === 200 || res.type === 'opaque')) cache.put(req, res.clone()); return res; })
        .catch(() => cached);
      return cached || network;
    })
  );
});
