import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'ENTREGA_SHA256.json'), 'utf8'));
const failures = [];
for (const entry of manifest.files) {
  const file = path.resolve(root, entry.file);
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Caminho inválido no manifesto');
  if (!fs.existsSync(file)) { failures.push(entry.file + ': ausente'); continue; }
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (sha256 !== entry.sha256) failures.push(entry.file + ': alterado');
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.log(`${manifest.files.length} arquivos conferidos por SHA-256. Base recebida íntegra.`);
