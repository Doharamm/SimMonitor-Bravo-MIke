import { cpSync } from 'node:fs';
// A galeria de traçados (public/tracados.html, ~5,6 MB) é ferramenta de conferência:
// fica fora do executável e do site para não pesar no download.
const skip = ['tracados.html'];
const filter = src => !skip.some(name => src.endsWith(name));
cpSync(new URL('../public/',import.meta.url),new URL('../server-go/public/',import.meta.url),{recursive:true,filter});
console.log('Assets preparados (sem a galeria). Em server-go, execute: go build -o BravoMike-SimMonitor.exe .');
