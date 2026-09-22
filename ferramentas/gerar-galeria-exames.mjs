// Gera a folha de contato com as 57 imagens de exame, em duas versões.
//
//   npm run galeria
//
// 1. public/galeria-exames.html — caminhos RELATIVOS, servida pela prévia:
//        npm run preview  →  http://127.0.0.1:8799/galeria-exames.html
//    Fica fora da build publicada e do executável.
//
// 2. ferramentas/galeria-exames-portatil.html — caminhos ABSOLUTOS para o site
//    publicado. Arquivo único, sem dependência de pasta, de Node ou de
//    servidor. O preço é o acoplamento: se o endereço do SimMonitor mudar,
//    troque BASE_PUBLICA abaixo e gere de novo.
//
// Para levar tudo (imagens incluídas) a outro projeto, use:
//   npm run empacotar:exames
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { montarGaleria, esc } from './galeria-template.mjs';

const BASE_PUBLICA = 'https://bravomike-simmonitor.vercel.app/';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const { EXAMS } = await import(new URL('../public/js/exams.js', import.meta.url));
const { CASE_EXAMS } = await import(new URL('../public/js/case-exams.js', import.meta.url));
const { SCENARIO_BY_ID } = await import(new URL('../public/js/scenario-catalog.js', import.meta.url));

// Onde cada imagem já é usada hoje, nos casos do SimMonitor.
export const uso = new Map();
for (const [caso, linhas] of Object.entries(CASE_EXAMS)) {
  linhas.forEach((linha, etapa) => {
    for (const id of Object.values(linha)) {
      if (!id) continue;
      const titulo = SCENARIO_BY_ID[caso]?.etapas[etapa]?.titulo || ('etapa ' + (etapa + 1));
      if (!uso.has(id)) uso.set(id, []);
      uso.get(id).push(`${caso} · ${titulo}`);
    }
  });
}

// Leitura inicial de partida (observação das imagens, não laudo).
let leituras = {};
try {
  leituras = JSON.parse(readFileSync(new URL('./ecg-leitura-inicial.json', import.meta.url), 'utf8')).leituras || {};
} catch (e) { /* sem palpite inicial, os campos abrem vazios */ }

const avisoPortatil = `<br><br><b>Esta é a versão portátil:</b> as imagens vêm de
<code>${esc(BASE_PUBLICA)}</code>. Funciona em qualquer lugar, mas precisa de internet —
e se aquele endereço mudar, troque a constante no código desta página.`;

writeFileSync(path.join(raiz, 'public', 'galeria-exames.html'),
  montarGaleria({ exams: EXAMS, uso, leituras, base: '' }));
writeFileSync(path.join(raiz, 'ferramentas', 'galeria-exames-portatil.html'),
  montarGaleria({ exams: EXAMS, uso, leituras, base: BASE_PUBLICA, aviso: avisoPortatil }));

const semUso = EXAMS.filter(e => !uso.has(e.id)).length;
console.log('galeria servida : public/galeria-exames.html');
console.log('                  npm run preview  →  http://127.0.0.1:8799/galeria-exames.html');
console.log('galeria portátil: ferramentas/galeria-exames-portatil.html');
console.log(`${EXAMS.length} imagens — ${EXAMS.length - semUso} em uso, ${semUso} sem uso em nenhum caso.`);
