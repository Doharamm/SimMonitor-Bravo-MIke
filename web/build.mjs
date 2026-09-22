import { cpSync, rmSync } from 'node:fs';
// A galeria de traçados fica fora da build publicada (ver scripts/prepare-go.mjs).
const skip = ['tracados.html', 'galeria-exames.html'];
const filter = src => !skip.some(name => src.endsWith(name));
const dest = new URL('./dist/', import.meta.url);
rmSync(dest, {recursive:true,force:true});
cpSync(new URL('../public/', import.meta.url),dest,{recursive:true,filter});
console.log('dist pronta (sem a galeria)');
