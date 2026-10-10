// App instalável: registra o service worker (sw.js). O navegador só permite
// isso em https (site publicado) ou no próprio computador (localhost). No
// Wi-Fi local, aberto por IP, o registro não acontece e o app segue normal
// pelo navegador, só sem a instalação.
if ('serviceWorker' in navigator && globalThis.isSecureContext) {
  addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
