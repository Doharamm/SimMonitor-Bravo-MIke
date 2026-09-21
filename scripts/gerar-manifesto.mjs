// Gera o manifesto SHA-256 desta entrega.
//
// ENTREGA_SHA256.json continua sendo o manifesto da base RECEBIDA: é contra ele
// que `verify:delivery` aponta o que foi alterado de propósito. Este script
// produz ENTREGA_2.3.3_SHA256.json, o ponto de conferência da entrega nova.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
// Pastas geradas ficam de fora: elas são recriadas pelos comandos do LEIA-ME.
const geradas = ['web/dist', 'server-go/public', 'node_modules', '.git', '.vercel', '.tools', 'auditoria'];
const incluir = ['public', 'tests', 'scripts', 'server-go', 'web', 'supabase', 'evidencias', 'reference'];
const soltos = ['package.json', 'vercel.json', '.vercelignore', '.gitignore', '.gitattributes'];

const hash = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

function varrer(dir) {
  const saida = [];
  for (const nome of fs.readdirSync(dir).sort()) {
    const inteiro = path.join(dir, nome);
    const rel = path.relative(root, inteiro).split(path.sep).join('/');
    if (geradas.some(g => rel === g || rel.startsWith(g + '/'))) continue;
    const st = fs.statSync(inteiro);
    if (st.isDirectory()) saida.push(...varrer(inteiro));
    else if (st.isFile()) saida.push({ file: rel, bytes: st.size, sha256: hash(inteiro) });
  }
  return saida;
}

const files = [];
for (const nome of [...soltos, ...fs.readdirSync(root).filter(n => n.endsWith('.md') || n.endsWith('.txt')).sort()]) {
  const inteiro = path.join(root, nome);
  if (!fs.existsSync(inteiro) || !fs.statSync(inteiro).isFile()) continue;
  files.push({ file: nome, bytes: fs.statSync(inteiro).size, sha256: hash(inteiro) });
}
for (const dir of incluir) {
  const inteiro = path.join(root, dir);
  if (fs.existsSync(inteiro)) files.push(...varrer(inteiro));
}
files.sort((a, b) => a.file.localeCompare(b.file));

const versao = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const destino = path.join(root, 'ENTREGA_2.3.3_SHA256.json');
fs.writeFileSync(destino, JSON.stringify({ versao, gerado_em: new Date().toISOString(), files }, null, 1) + '\n');
console.log(`${files.length} arquivos no manifesto da entrega (${versao}).`);
