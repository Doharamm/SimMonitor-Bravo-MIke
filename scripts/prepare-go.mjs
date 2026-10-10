// Prepara server-go/public, que é embutido no executável do modo local.
import { fileURLToPath } from 'node:url';
import { copiarPublico } from './copiar-publico.mjs';

copiarPublico(fileURLToPath(new URL('../server-go/public/', import.meta.url)));
console.log('server-go/public pronta. Em server-go, execute: go build -o BravoMike-SimMonitor.exe .');
