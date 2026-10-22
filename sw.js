// Service worker. Guarda la app en el teléfono para que abra sin señal.
// Sube el número de versión cada vez que publiques cambios: así los
// teléfonos del equipo se actualizan solos la próxima vez que abran.

const VERSION = 'v3';
const CACHE = 'informes-obra-' + VERSION;

const ARCHIVOS = [
  './',
  'index.html',
  'styles.css',
  'fonts.css',
  'config.js',
  'app.js',
  'db.js',
  'acc.js',
  'pdf.js',
  'vendor/pdf-lib.min.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ARCHIVOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;

  // Todo lo que va a Autodesk o a AWS pasa derecho: nunca se guarda en caché.
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  // El regreso del login trae ?code=... en la URL; hay que servir la app
  // igual, pero sin guardar esa respuesta.
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('index.html').then(r => r || fetch(req))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(guardado => {
      if (guardado) return guardado;
      return fetch(req).then(resp => {
        if (resp.ok && resp.type === 'basic') {
          const copia = resp.clone();
          caches.open(CACHE).then(c => c.put(req, copia));
        }
        return resp;
      });
    })
  );
});
