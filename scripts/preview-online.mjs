// Prévia para testar o MODO ONLINE nas telas de verdade.
//
// `scripts/preview.mjs` responde {preview:true} em /api/info e, por desenho,
// o transporte trata isso como demonstração mesmo com ?modo=online — assim uma
// prévia nunca conversa com o serviço online por engano. Esta prévia aqui é a
// exceção explícita: ela NÃO serve /api/info, então `?modo=online` vale.
//
//   node scripts/preview-online.mjs
//   http://127.0.0.1:8800/monitor.html?modo=online&sala=4321
//   http://127.0.0.1:8800/controle.html?modo=online&sala=4321
//
// Só atende 127.0.0.1 de propósito. O navegador só oferece WebCrypto em
// contexto seguro, e http://127.0.0.1 conta como seguro; http://192.168.x.x
// não conta. Para testar em dois aparelhos, publique e use o endereço HTTPS.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};
const PORTA = 8800;

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    // Sem /api/info: a detecção não encontra servidor local nem prévia.
    const alvo = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = path.resolve(root, '.' + decodeURIComponent(alvo));
    if (!file.startsWith(root + path.sep) && file !== root) throw Error();
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(PORTA, '127.0.0.1', () => {
  console.log('Prévia ONLINE — exige a migração aplicada e as duas configurações do painel.');
  console.log(`Monitor:  http://127.0.0.1:${PORTA}/monitor.html?modo=online&sala=4321`);
  console.log(`Controle: http://127.0.0.1:${PORTA}/controle.html?modo=online&sala=4321`);
  console.log('Abra as duas em JANELAS SEPARADAS: uma aba em segundo plano pausa o monitor.');
});
