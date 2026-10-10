// Gera web/dist, que é o que a Vercel publica (ver vercel.json).
import { fileURLToPath } from 'node:url';
import { copiarPublico } from '../scripts/copiar-publico.mjs';

copiarPublico(fileURLToPath(new URL('./dist/', import.meta.url)));
console.log('web/dist pronta');
