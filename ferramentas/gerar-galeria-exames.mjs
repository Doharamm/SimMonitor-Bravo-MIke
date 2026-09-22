// Gera uma folha de contato com as 57 imagens de exame, para consulta durante o
// refinamento dos casos.
//
// Os 37 ECGs estão catalogados só pelo nome do arquivo ("14_Lead"), sem dizer o
// que cada um mostra. Sem olhar imagem por imagem não dá para escolher qual
// associar a uma etapa. Esta página põe todas lado a lado com o id ao lado, e
// tem um campo para você anotar o que cada uma é.
//
//   npm run galeria      (ou: node ferramentas/gerar-galeria-exames.mjs)
//   npm run preview
//   http://127.0.0.1:8799/galeria-exames.html
//
// A saída vai para public/, junto das imagens, e é SERVIDA pelo servidor de
// prévia. Abrir o arquivo direto com dois cliques (file://) não funciona bem:
// os caminhos relativos das imagens quebram se o arquivo for movido de lugar, e
// o navegador bloqueia armazenamento local em file://. Pelo servidor, os dois
// funcionam.
//
// Não entra na build publicada nem no executável: `web/build.mjs` e
// `scripts/prepare-go.mjs` pulam este arquivo, como já faziam com tracados.html.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const { EXAMS } = await import(new URL('../public/js/exams.js', import.meta.url));
const { CASE_EXAMS } = await import(new URL('../public/js/case-exams.js', import.meta.url));
const { SCENARIO_BY_ID } = await import(new URL('../public/js/scenario-catalog.js', import.meta.url));

// Onde cada imagem já é usada hoje.
const uso = new Map();
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

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function cartao(e) {
  const usos = uso.get(e.id) || [];
  const selo = usos.length
    ? `<p class="uso">em uso: ${usos.map(esc).join(' · ')}</p>`
    : `<p class="livre">sem uso em nenhum caso</p>`;
  return `<figure class="card${usos.length ? ' usada' : ''}">
    <a href="${esc(e.src)}" target="_blank"><img loading="lazy" src="${esc(e.src)}" alt="${esc(e.label)}"></a>
    <figcaption>
      <code>${esc(e.id)}</code>
      <span class="arq">${esc(e.src.split('/').pop())}</span>
      ${selo}
      <input class="nota" placeholder="o que esta imagem mostra" data-id="${esc(e.id)}">
    </figcaption>
  </figure>`;
}

const ecgs = EXAMS.filter(e => e.kind === 'ecg');
const xrays = EXAMS.filter(e => e.kind === 'xray');

const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Exames do SimMonitor — folha de contato</title>
<style>
  :root{color-scheme:light dark;--bg:#faf9f5;--fg:#1c2233;--mut:#5d6478;--bd:#e0dbcd;--surf:#fff;--ok:#1f8a4c}
  @media (prefers-color-scheme:dark){:root{--bg:#171410;--fg:#f3ede1;--mut:#b3a893;--bd:#3a3227;--surf:#211c16}}
  *{box-sizing:border-box}
  body{margin:0;padding:24px;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,sans-serif}
  h1{margin:0 0 4px;font-size:1.5rem}
  h2{margin:34px 0 4px;font-size:1.15rem;border-top:1px solid var(--bd);padding-top:22px}
  p.sub{margin:0 0 8px;color:var(--mut);font-size:.9rem;max-width:70ch}
  .grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px;margin-top:18px}
  .card{margin:0;background:var(--surf);border:1px solid var(--bd);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
  .card.usada{border-color:var(--ok);border-width:2px}
  .card img{width:100%;height:190px;object-fit:cover;object-position:top;display:block;background:#fff;cursor:zoom-in}
  figcaption{padding:10px 12px;display:flex;flex-direction:column;gap:5px}
  code{font:600 .85rem ui-monospace,monospace;color:var(--fg)}
  .arq{font-size:.72rem;color:var(--mut);word-break:break-all}
  .uso{margin:0;font-size:.74rem;color:var(--ok);font-weight:600}
  .livre{margin:0;font-size:.74rem;color:var(--mut)}
  .nota{margin-top:3px;padding:7px 9px;border:1px solid var(--bd);border-radius:7px;background:var(--bg);color:var(--fg);font:inherit;font-size:.85rem}
  .barra{position:sticky;top:0;z-index:5;background:var(--bg);padding:10px 0;border-bottom:1px solid var(--bd);display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  button{padding:8px 15px;border-radius:999px;border:1px solid var(--bd);background:var(--surf);color:var(--fg);font:inherit;font-weight:600;cursor:pointer}
  button:hover{border-color:var(--ok)}
  #saida{width:100%;min-height:150px;margin-top:12px;padding:11px;border:1px solid var(--bd);border-radius:9px;background:var(--surf);color:var(--fg);font:13px/1.5 ui-monospace,monospace;display:none}
</style></head><body>
<h1>Exames do SimMonitor</h1>
<p class="sub">${EXAMS.length} imagens: ${ecgs.length} ECGs e ${xrays.length} radiografias.
Borda verde = já usada por algum caso. Clique na imagem para abrir em tamanho real.
Escreva no campo o que cada uma mostra e clique em <b>Copiar anotações</b> — cole o
resultado para mim e eu passo os nomes para <code>exams.js</code>.</p>
<div class="barra">
  <button id="bCopiar">Copiar anotações</button>
  <button id="bLimpar">Limpar</button>
  <span class="livre" id="contagem"></span>
</div>
<textarea id="saida" readonly></textarea>

<h2>ECG — ${ecgs.length} imagens</h2>
<p class="sub">Catalogadas só pelo nome do arquivo. É aqui que falta nome clínico.</p>
<div class="grade">${ecgs.map(cartao).join('')}</div>

<h2>Radiografias — ${xrays.length} imagens</h2>
<p class="sub">Estas já vêm com nome descritivo, em inglês.</p>
<div class="grade">${xrays.map(cartao).join('')}</div>

<script>
  var campos = document.querySelectorAll('.nota');
  var chave = 'galeria-exames-notas';
  try { var salvo = JSON.parse(localStorage.getItem(chave) || '{}');
        campos.forEach(function(c){ if (salvo[c.dataset.id]) c.value = salvo[c.dataset.id]; }); } catch (e) {}
  function contar(){
    var n = 0; campos.forEach(function(c){ if (c.value.trim()) n++; });
    document.getElementById('contagem').textContent = n + ' de ' + campos.length + ' anotadas';
  }
  function guardar(){
    var o = {}; campos.forEach(function(c){ if (c.value.trim()) o[c.dataset.id] = c.value.trim(); });
    try { localStorage.setItem(chave, JSON.stringify(o)); } catch (e) {}
    contar();
  }
  campos.forEach(function(c){ c.addEventListener('input', guardar); });
  contar();
  document.getElementById('bCopiar').onclick = function(){
    var linhas = [];
    campos.forEach(function(c){ if (c.value.trim()) linhas.push(c.dataset.id + ': ' + c.value.trim()); });
    var saida = document.getElementById('saida');
    saida.value = linhas.length ? linhas.join('\\n') : 'Nenhuma anotação ainda.';
    saida.style.display = 'block';
    saida.select();
    try { document.execCommand('copy'); } catch (e) {}
  };
  document.getElementById('bLimpar').onclick = function(){
    if (!confirm('Apagar todas as anotações desta página?')) return;
    campos.forEach(function(c){ c.value = ''; });
    guardar();
    document.getElementById('saida').style.display = 'none';
  };
</script>
</body></html>`;

const destino = path.join(raiz, 'public', 'galeria-exames.html');
writeFileSync(destino, html);
const semUso = EXAMS.filter(e => !uso.has(e.id)).length;
console.log('galeria gerada: public/galeria-exames.html');
console.log('abra com: npm run preview  →  http://127.0.0.1:8799/galeria-exames.html');
console.log(`${EXAMS.length} imagens — ${EXAMS.length - semUso} em uso, ${semUso} sem uso em nenhum caso.`);
