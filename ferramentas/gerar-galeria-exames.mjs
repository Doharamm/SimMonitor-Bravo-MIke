// Gera a folha de contato com as 57 imagens de exame, em duas versões.
//
// Os 37 ECGs estão catalogados só pelo nome do arquivo ("14_Lead"), sem dizer o
// que cada um mostra. Sem olhar imagem por imagem não dá para escolher qual
// associar a uma etapa. Esta página põe todas lado a lado com o id, a leitura
// inicial e um campo para anotar.
//
//   npm run galeria
//
// Saem dois arquivos:
//
// 1. public/galeria-exames.html — caminhos RELATIVOS, servida pela prévia:
//        npm run preview  →  http://127.0.0.1:8799/galeria-exames.html
//    Fica fora da build publicada e do executável.
//
// 2. ferramentas/galeria-exames-portatil.html — caminhos ABSOLUTOS para o site
//    publicado. Arquivo único, sem dependência de pasta, de Node ou de
//    servidor: abre com dois cliques, pode ir para outro projeto, ser publicada
//    como Artifact ou hospedada em qualquer lugar.
//
//    O preço é o acoplamento: ela busca as imagens em BASE_PUBLICA. Se o
//    endereço do SimMonitor mudar, basta trocar essa constante no topo do HTML
//    gerado (ou aqui e gerar de novo).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE_PUBLICA = 'https://bravomike-simmonitor.vercel.app/';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const { EXAMS } = await import(new URL('../public/js/exams.js', import.meta.url));
const { CASE_EXAMS } = await import(new URL('../public/js/case-exams.js', import.meta.url));
const { SCENARIO_BY_ID } = await import(new URL('../public/js/scenario-catalog.js', import.meta.url));

// Onde cada imagem já é usada hoje, nos casos do SimMonitor.
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

// Leitura inicial de partida (observação das imagens, não laudo).
let leituras = {};
try {
  leituras = JSON.parse(readFileSync(new URL('./ecg-leitura-inicial.json', import.meta.url), 'utf8')).leituras || {};
} catch (e) { /* sem palpite inicial, os campos abrem vazios */ }

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function cartao(e, base) {
  const usos = uso.get(e.id) || [];
  const palpite = leituras[e.id];
  const selo = usos.length
    ? `<p class="uso">em uso: ${usos.map(esc).join(' · ')}</p>`
    : `<p class="livre">sem uso em nenhum caso</p>`;
  const tarja = palpite
    ? `<p class="conf conf-${esc(palpite.conf)}">leitura inicial · confiança ${esc(palpite.conf)}</p>`
    : '';
  const busca = [e.id, e.src, palpite ? palpite.texto : '', usos.join(' ')].join(' ').toLowerCase();
  return `<figure class="card${usos.length ? ' usada' : ''}" data-kind="${esc(e.kind)}" data-busca="${esc(busca)}">
    <a href="${esc(base + e.src)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(base + e.src)}" alt="${esc(e.label)}"></a>
    <figcaption>
      <div class="linha-id"><code>${esc(e.id)}</code><button class="copiar-id" data-id="${esc(e.id)}" title="copiar o id">copiar id</button></div>
      <span class="arq">${esc(e.src.split('/').pop())}</span>
      ${selo}
      ${tarja}
      <input class="nota" placeholder="o que esta imagem mostra" data-id="${esc(e.id)}"
             data-inicial="${esc(palpite ? palpite.texto : '')}">
    </figcaption>
  </figure>`;
}

const ecgs = EXAMS.filter(e => e.kind === 'ecg');
const xrays = EXAMS.filter(e => e.kind === 'xray');

function montar(base, portatil) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Exames — ECG e radiografias</title>
<style>
  :root{color-scheme:light dark;--bg:#faf9f5;--fg:#1c2233;--mut:#5d6478;--bd:#e0dbcd;--surf:#fff;--ok:#1f8a4c;--av:#b8831f;--er:#a23421}
  @media (prefers-color-scheme:dark){:root{--bg:#171410;--fg:#f3ede1;--mut:#b3a893;--bd:#3a3227;--surf:#211c16;--ok:#4ade80;--av:#f0b93a;--er:#e8776a}}
  *{box-sizing:border-box}
  body{margin:0;padding:24px;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,sans-serif}
  h1{margin:0 0 4px;font-size:1.5rem}
  h2{margin:34px 0 4px;font-size:1.15rem;border-top:1px solid var(--bd);padding-top:22px}
  p.sub{margin:0 0 8px;color:var(--mut);font-size:.9rem;max-width:72ch}
  .grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px;margin-top:18px}
  .card{margin:0;background:var(--surf);border:1px solid var(--bd);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
  .card.usada{border-color:var(--ok);border-width:2px}
  .card.oculta{display:none}
  .card img{width:100%;height:190px;object-fit:cover;object-position:top;display:block;background:#fff;cursor:zoom-in}
  figcaption{padding:10px 12px;display:flex;flex-direction:column;gap:5px}
  .linha-id{display:flex;align-items:center;justify-content:space-between;gap:8px}
  code{font:600 .85rem ui-monospace,monospace;color:var(--fg)}
  .copiar-id{padding:3px 9px;font-size:.68rem;border-radius:999px;border:1px solid var(--bd);background:transparent;color:var(--mut);cursor:pointer}
  .copiar-id:hover{border-color:var(--ok);color:var(--ok)}
  .copiar-id.feito{border-color:var(--ok);color:var(--ok)}
  .arq{font-size:.72rem;color:var(--mut);word-break:break-all}
  .uso{margin:0;font-size:.74rem;color:var(--ok);font-weight:600}
  .livre{margin:0;font-size:.74rem;color:var(--mut)}
  .conf{margin:0;font-size:.68rem;font-weight:700;letter-spacing:.03em;text-transform:uppercase}
  .conf-alta{color:var(--ok)}.conf-media{color:var(--av)}.conf-baixa{color:var(--er)}
  .nota{margin-top:3px;padding:7px 9px;border:1px solid var(--bd);border-radius:7px;background:var(--bg);color:var(--fg);font:inherit;font-size:.85rem}
  .barra{position:sticky;top:0;z-index:5;background:var(--bg);padding:12px 0;border-bottom:1px solid var(--bd);display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  button{padding:8px 15px;border-radius:999px;border:1px solid var(--bd);background:var(--surf);color:var(--fg);font:inherit;font-weight:600;cursor:pointer}
  button:hover{border-color:var(--ok)}
  button.ativo{background:var(--fg);color:var(--bg);border-color:var(--fg)}
  #busca{flex:1;min-width:190px;padding:8px 13px;border-radius:999px;border:1px solid var(--bd);background:var(--surf);color:var(--fg);font:inherit}
  #saida{width:100%;min-height:150px;margin-top:12px;padding:11px;border:1px solid var(--bd);border-radius:9px;background:var(--surf);color:var(--fg);font:13px/1.5 ui-monospace,monospace;display:none}
  .aviso{margin:14px 0 0;padding:11px 14px;border-left:3px solid var(--av);background:var(--surf);border-radius:0 8px 8px 0;font-size:.85rem;color:var(--mut);max-width:72ch}
  @media(max-width:600px){body{padding:16px}.grade{grid-template-columns:1fr}}
</style></head><body>
<h1>Exames — ECG e radiografias</h1>
<p class="sub">${EXAMS.length} imagens: ${ecgs.length} ECGs e ${xrays.length} radiografias.
Borda verde = já usada por algum caso do SimMonitor. Clique na imagem para abrir em
tamanho real, ou em <b>copiar id</b> para pegar o identificador.</p>
<p class="aviso"><b>A leitura inicial não é laudo.</b> Foi feita por observação das
imagens, como ponto de partida, e traz o nível de confiança em cada uma. Corrija o
que estiver errado antes de usar em aula.${portatil ? `<br><br><b>Esta é a versão portátil:</b> as imagens vêm de
<code>${esc(BASE_PUBLICA)}</code>. Funciona em qualquer lugar, mas precisa de internet —
e se aquele endereço mudar, troque a constante <code>BASE</code> no topo do código
desta página.` : ''}</p>
<div class="barra">
  <input id="busca" placeholder="buscar por id, arquivo ou leitura…">
  <button class="filtro ativo" data-kind="">Todos</button>
  <button class="filtro" data-kind="ecg">ECG</button>
  <button class="filtro" data-kind="xray">Raio-X</button>
  <button id="bCopiar">Copiar anotações</button>
  <button id="bLimpar">Limpar</button>
  <span class="livre" id="contagem"></span>
</div>
<textarea id="saida" readonly></textarea>

<h2 id="tituloEcg">ECG — ${ecgs.length} imagens</h2>
<p class="sub">Catalogadas só pelo nome do arquivo. É aqui que falta nome clínico.</p>
<div class="grade">${ecgs.map(e => cartao(e, base)).join('')}</div>

<h2 id="tituloRx">Radiografias — ${xrays.length} imagens</h2>
<p class="sub">Estas já vêm com nome descritivo, em inglês.</p>
<div class="grade">${xrays.map(e => cartao(e, base)).join('')}</div>

<script>
  var BASE = ${JSON.stringify(base)};
  var campos = document.querySelectorAll('.nota');
  var cartoes = document.querySelectorAll('.card');
  var chave = 'galeria-exames-notas';

  // Começa com a leitura inicial; o que você já corrigiu tem prioridade.
  campos.forEach(function(c){ if (c.dataset.inicial) c.value = c.dataset.inicial; });
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

  var kindAtual = '', termoAtual = '';
  function aplicarFiltro(){
    var visiveis = { ecg: 0, xray: 0 };
    cartoes.forEach(function(card){
      var okKind = !kindAtual || card.dataset.kind === kindAtual;
      var nota = card.querySelector('.nota');
      var texto = card.dataset.busca + ' ' + (nota ? nota.value.toLowerCase() : '');
      var okTermo = !termoAtual || texto.indexOf(termoAtual) !== -1;
      var mostrar = okKind && okTermo;
      card.classList.toggle('oculta', !mostrar);
      if (mostrar) visiveis[card.dataset.kind]++;
    });
    document.getElementById('tituloEcg').style.display = visiveis.ecg ? '' : 'none';
    document.getElementById('tituloRx').style.display = visiveis.xray ? '' : 'none';
  }
  document.getElementById('busca').addEventListener('input', function(e){
    termoAtual = e.target.value.trim().toLowerCase(); aplicarFiltro();
  });
  document.querySelectorAll('.filtro').forEach(function(b){
    b.onclick = function(){
      document.querySelectorAll('.filtro').forEach(function(x){ x.classList.remove('ativo'); });
      b.classList.add('ativo'); kindAtual = b.dataset.kind; aplicarFiltro();
    };
  });

  function paraAreaDeTransferencia(texto, aoTerminar){
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(aoTerminar, aoTerminar);
      return;
    }
    var t = document.createElement('textarea');
    t.value = texto; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(t); aoTerminar();
  }

  document.querySelectorAll('.copiar-id').forEach(function(b){
    b.onclick = function(){
      paraAreaDeTransferencia(b.dataset.id, function(){
        var antes = b.textContent; b.textContent = 'copiado'; b.classList.add('feito');
        setTimeout(function(){ b.textContent = antes; b.classList.remove('feito'); }, 1200);
      });
    };
  });

  document.getElementById('bCopiar').onclick = function(){
    var linhas = [];
    campos.forEach(function(c){
      if (c.closest('.card').classList.contains('oculta')) return;
      if (c.value.trim()) linhas.push(c.dataset.id + ': ' + c.value.trim());
    });
    var texto = linhas.length ? linhas.join('\\n') : 'Nenhuma anotação ainda.';
    var saida = document.getElementById('saida');
    saida.value = texto; saida.style.display = 'block';
    paraAreaDeTransferencia(texto, function(){});
  };
  document.getElementById('bLimpar').onclick = function(){
    if (!confirm('Apagar todas as anotações desta página? A leitura inicial volta.')) return;
    try { localStorage.removeItem(chave); } catch (e) {}
    campos.forEach(function(c){ c.value = c.dataset.inicial || ''; });
    guardar(); aplicarFiltro();
    document.getElementById('saida').style.display = 'none';
  };
</script>
</body></html>`;
}

writeFileSync(path.join(raiz, 'public', 'galeria-exames.html'), montar('', false));
writeFileSync(path.join(raiz, 'ferramentas', 'galeria-exames-portatil.html'), montar(BASE_PUBLICA, true));

const semUso = EXAMS.filter(e => !uso.has(e.id)).length;
console.log('galeria servida : public/galeria-exames.html');
console.log('                  npm run preview  →  http://127.0.0.1:8799/galeria-exames.html');
console.log('galeria portátil: ferramentas/galeria-exames-portatil.html  (arquivo único, abre em qualquer lugar)');
console.log(`${EXAMS.length} imagens — ${EXAMS.length - semUso} em uso, ${semUso} sem uso em nenhum caso.`);
