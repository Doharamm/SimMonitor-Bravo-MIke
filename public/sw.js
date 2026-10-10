// Service worker do app instalável. Rede primeiro: com internet, sempre a
// versão publicada mais nova (uma publicação nova aparece no próximo
// carregamento); sem internet ou com ela muito lenta, a última cópia guardada.
// Nunca guarda nada de outro endereço (Supabase) nem o canal ao vivo (/ws).
const CACHE = 'simmonitor-v1';
const ESSENCIAIS = ['./', './index.html', './monitor.html', './controle.html', './manifest.webmanifest',
  './css/base.css', './img/icon.svg', './img/icon-192.png'];
const ESPERA_REDE_MS = 4000;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ESSENCIAIS)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(nomes => Promise.all(nomes.filter(n => n.startsWith('simmonitor-') && n !== CACHE).map(n => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/ws') || url.pathname.startsWith('/api')) return;
  e.respondWith(redePrimeiro(req));
});

async function redePrimeiro(req) {
  const cache = await caches.open(CACHE);
  try {
    const resp = await comPrazo(fetch(req), ESPERA_REDE_MS);
    if (resp.ok && resp.type === 'basic') cache.put(req, resp.clone());
    return resp;
  } catch {
    // Páginas abertas com ?sala=… caem na cópia sem os parâmetros.
    const guardada = await cache.match(req) || await cache.match(req, { ignoreSearch: true });
    if (guardada) return guardada;
    return new Response('Sem conexão e sem cópia guardada desta página.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

function comPrazo(promessa, ms) {
  return new Promise((ok, falha) => {
    const t = setTimeout(() => falha(new Error('rede lenta')), ms);
    promessa.then(r => { clearTimeout(t); ok(r); }, e => { clearTimeout(t); falha(e); });
  });
}
