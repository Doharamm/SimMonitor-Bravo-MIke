// Guardas de manutenção: coisas que não quebram nada hoje, mas quebrariam o
// app sem aviso quando alguém mexer depois. Cada teste explica o que protege.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { VERSION, registerScenario } from '../public/js/classroom.js';
import { createControllerCases } from '../public/js/controller-cases.js';
import { SCENARIOS } from '../public/js/scenario-catalog.js';
import { defaultState, sanitizeSet, restoreState } from '../public/js/simulation-state.js';
import { PULSE_MODES, VF_AMPLITUDES, CAPNO_MODES, SPO2_SIGNALS, CHANNELS } from '../public/js/simulation-config.js';
import { copiarPublico, FORA_DA_PUBLICACAO } from '../scripts/copiar-publico.mjs';

const raiz = new URL('../', import.meta.url);
const ler = rel => fs.readFileSync(new URL(rel, raiz), 'utf8');

test('a versão é a mesma no package.json, no app e no servidor Go', () => {
  // O monitor recusa comandos de controle com versão diferente, e o Go informa
  // a sua em /api/info. Três cópias escritas à mão divergem fácil: se trocar a
  // versão, troque nas três.
  const pacote = JSON.parse(ler('package.json')).version;
  const go = ler('server-go/main.go').match(/"version":\s*"([^"]+)"/)?.[1];
  assert.equal(VERSION, pacote, 'public/js/classroom.js (VERSION) difere do package.json');
  assert.equal(go, pacote, 'server-go/main.go (/api/info) difere do package.json');
});

test('listas de valores permitidos: o padrão do estado é o primeiro de cada lista', () => {
  const s = defaultState();
  assert.equal(s.pulse, PULSE_MODES[0]);
  assert.equal(s.vfAmp, VF_AMPLITUDES[0]);
  assert.equal(s.capno, CAPNO_MODES[0]);
  assert.equal(s.spo2Signal, SPO2_SIGNALS[0]);
  assert.deepEqual(Object.keys(s.show), CHANNELS);
});

test('listas de valores permitidos: saneamento e restauração aceitam todos e só eles', () => {
  for (const [campo, lista] of [['pulse', PULSE_MODES], ['vfAmp', VF_AMPLITUDES], ['capno', CAPNO_MODES], ['spo2Signal', SPO2_SIGNALS]]) {
    for (const v of lista) {
      assert.equal(sanitizeSet({ [campo]: v })[campo], v, `${campo}=${v} recusado pelo saneamento`);
      assert.equal(restoreState({ ...defaultState(), [campo]: v })[campo], v, `${campo}=${v} perdido na restauração`);
    }
    assert.equal(sanitizeSet({ [campo]: 'inventado' })[campo], undefined);
    assert.equal(restoreState({ ...defaultState(), [campo]: 'inventado' })[campo], lista[0]);
  }
  for (const canal of CHANNELS) assert.equal(sanitizeSet({ show: { [canal]: false } }).show[canal], false);
});

test('confirmação de troca de caso mostra o título como foi escrito', () => {
  // confirmAction() usa textContent. Escapar o título antes fazia aspas e &
  // aparecerem como &#39; e &amp; na janela de confirmação.
  const custom = registerScenario({
    id: 'custom-teste-aspas', titulo: "Dor 'aguda' & sudorese", resumo: 'teste',
    etapas: [{ titulo: 'Etapa', nota: 'nota', dur: 0, set: { rhythm: 'nsr' } }],
  });
  assert.ok(custom, 'cenário de teste inválido');
  // Os dois títulos da frase precisam sair crus: o do caso em andamento e o do
  // caso escolhido. Roda nos dois sentidos para cobrir os dois.
  for (const [atual, escolhido] of [[SCENARIOS[0].id, custom.id], [custom.id, SCENARIOS[0].id]]) {
    let pedido = null;
    const elementos = {};
    const el = id => (elementos[id] ??= { id, innerHTML: '', dataset: {}, listeners: {}, addEventListener(t, f) { this.listeners[t] = f; } });
    const casos = createControllerCases({
      document: { getElementById: el },
      getState: () => ({ scn: { id: atual, step: 0 } }),
      act: () => {}, vibrate: () => {}, interruptList: () => [],
      confirmAction: (titulo, texto) => { pedido = texto; },
    });
    casos.buildScenarios();
    el('scnList').listeners.click({ target: { closest: () => ({ dataset: { scn: escolhido } }) } });
    assert.ok(pedido.includes("“Dor 'aguda' & sudorese”"), pedido);
    assert.ok(!/&#39;|&amp;/.test(pedido), 'título saiu escapado: ' + pedido);
  }
});

test('a lista de casos escapa o texto que vai para o HTML', () => {
  const elementos = {};
  const el = id => (elementos[id] ??= { id, innerHTML: '', dataset: {}, addEventListener() {} });
  createControllerCases({ document: { getElementById: el }, getState: () => ({}), act() {}, vibrate() {}, interruptList: () => [], confirmAction() {} }).buildScenarios();
  for (const s of SCENARIOS) assert.ok(el('scnList').innerHTML.includes(s.titulo.replace(/&/g, '&amp;')), s.titulo);
});

test('a cópia de public/ apaga o que sobrou da cópia anterior', () => {
  // Antes, só a build do site apagava o destino. O executável Go continuava
  // levando arquivos já removidos de public/.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'simmon-'));
  try {
    const origem = path.join(tmp, 'origem'), destino = path.join(tmp, 'destino');
    fs.mkdirSync(origem); fs.mkdirSync(destino);
    fs.writeFileSync(path.join(origem, 'index.html'), 'ok');
    fs.writeFileSync(path.join(origem, FORA_DA_PUBLICACAO[0]), 'galeria');
    fs.writeFileSync(path.join(destino, 'removido-de-public.html'), 'velho');
    copiarPublico(destino, origem);
    assert.deepEqual(fs.readdirSync(destino).sort(), ['index.html']);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('seletor de casos: cada cartão mostra a chegada e o que o caso vai exigir', () => {
  const elementos = {};
  const el = id => (elementos[id] ??= { id, innerHTML: '', dataset: {}, addEventListener() {} });
  createControllerCases({ document: { getElementById: el }, getState: () => ({}), act() {}, vibrate() {}, interruptList: () => [], confirmAction() {} }).buildScenarios();
  const html = el('scnList').innerHTML;
  const cartaoDe = id => html.split('<article').find(c => c.includes(`data-scn="${id}"`));
  assert.match(cartaoDe('tsv'), /Cardioversão sincronizada/);
  assert.match(cartaoDe('tsv'), /FC 188 · PA 82\/50 · SpO₂ 94%/);
  assert.match(cartaoDe('bradi'), /Marcapasso/);
  assert.match(cartaoDe('bradi'), /data-ritmo="bav3" data-hr="36"/);
  assert.match(cartaoDe('fv'), /Sem pulso/);
  assert.match(cartaoDe('fv'), /Desfibrilação/);
  assert.match(cartaoDe('fv'), /PCR/);
  assert.doesNotMatch(cartaoDe('tsv'), /PCR/, 'TSV não tem etapa sem pulso');
  assert.match(html, /data-scnfiltro="APH"/);
});

test('seletor de casos: a busca acha o caso por um ritmo de etapa posterior', () => {
  const elementos = {};
  const grade = { innerHTML: '' };
  const el = id => (elementos[id] ??= { id, innerHTML: '', dataset: {}, listeners: {}, addEventListener(t, f) { this.listeners[t] = f; },
    querySelector: () => grade, querySelectorAll: () => [] });
  createControllerCases({ document: { getElementById: el }, getState: () => ({}), act() {}, vibrate() {}, interruptList: () => [], confirmAction() {} }).buildScenarios();
  el('scnList').listeners.input({ target: { value: 'fibrilacao', classList: { contains: c => c === 'cx-busca' } } });
  for (const id of ['fv', 'assis', 'iam']) assert.match(grade.innerHTML, new RegExp(`data-scn="${id}"`), id);
  assert.doesNotMatch(grade.innerHTML, /data-scn="tsv"/);
});

test('app instalável: manifesto com ícones que existem, e as três páginas registram o service worker', () => {
  const pub = new URL('../public/', import.meta.url);
  const m = JSON.parse(fs.readFileSync(new URL('manifest.webmanifest', pub), 'utf8'));
  const tamanhos = m.icons.filter(i => i.type === 'image/png').map(i => `${i.sizes}:${i.purpose}`);
  for (const t of ['192x192:any', '512x512:any', '192x192:maskable', '512x512:maskable']) assert.ok(tamanhos.includes(t), 'falta ícone ' + t);
  for (const i of m.icons) assert.ok(fs.existsSync(new URL(i.src, pub)), 'ícone inexistente: ' + i.src);
  for (const s of m.shortcuts) assert.ok(fs.existsSync(new URL(s.url, pub)), 'atalho para página inexistente: ' + s.url);
  for (const pagina of ['index.html', 'monitor.html', 'controle.html']) {
    const html = fs.readFileSync(new URL(pagina, pub), 'utf8');
    assert.match(html, /rel="manifest"/, pagina);
    assert.match(html, /src="js\/pwa\.js"/, pagina);
    assert.match(html, /rel="apple-touch-icon"/, pagina);
  }
  // O service worker não pode guardar o canal ao vivo, a detecção do modo local
  // nem nada de outro endereço (Supabase).
  const sw = fs.readFileSync(new URL('sw.js', pub), 'utf8');
  assert.match(sw, /url\.origin !== self\.location\.origin/);
  assert.match(sw, /startsWith\('\/ws'\)/);
  assert.match(sw, /startsWith\('\/api'\)/);
});
