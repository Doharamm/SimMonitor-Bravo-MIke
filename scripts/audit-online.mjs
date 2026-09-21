// Suíte de aceite do modo online, contra um projeto Supabase de verdade.
//
// Este script ESCREVE no projeto: cria usuários anônimos, abre uma sala de
// teste e conecta ao Realtime. Por isso ele não roda junto com `npm test` e
// exige confirmação explícita:
//
//   node scripts/audit-online.mjs --confirmo
//
// Ele usa `public/js/config.js` por padrão. Para apontar para outro projeto:
//   SUPABASE_URL=... SUPABASE_KEY=... node scripts/audit-online.mjs --confirmo
//
// Cada participante recebe um armazenamento próprio, ou seja, um usuário
// anônimo próprio — é isso que torna o teste de isolamento verdadeiro. A sala
// de teste é encerrada no final; os usuários anônimos ficam no projeto (a
// limpeza está descrita em ENTREGA_PARA_REVISAO.md).
import { CONFIG } from '../public/js/config.js';
import { SalaOnline, identidadeDoAparelho } from '../public/js/online-room.js';
import { SupabaseSessao, armazenamentoDeMemoria } from '../public/js/supabase-rest.js';
import { criarAssinador, verificarMensagem, JanelaDeRepeticao } from '../public/js/crypto-identity.js';

const URL_BASE = process.env.SUPABASE_URL || CONFIG.supabaseUrl;
const CHAVE = process.env.SUPABASE_KEY || CONFIG.supabaseKey;

if (!process.argv.includes('--confirmo')) {
  console.error('Este teste escreve no projeto Supabase. Rode com --confirmo para autorizar.');
  console.error(`Projeto alvo: ${URL_BASE}`);
  process.exit(2);
}

const resultados = [];
let salaCriada = null;
function registrar(nome, ok, detalhe = '') {
  resultados.push({ nome, ok, detalhe });
  console.log(`${ok ? 'OK  ' : 'FALHA'} ${nome}${detalhe ? ' — ' + detalhe : ''}`);
}
async function conferir(nome, fn) {
  try { const d = await fn(); registrar(nome, true, typeof d === 'string' ? d : ''); }
  catch (e) { registrar(nome, false, e?.message || String(e)); }
}
const precisa = (cond, msg) => { if (!cond) throw new Error(msg); };
const codigo = String(1000 + Math.floor(Math.random() * 9000));
const codigoB = String(1000 + Math.floor(Math.random() * 9000));

function participante(papel, dispositivo, cod = codigo) {
  return new SalaOnline({
    url: URL_BASE, chave: CHAVE, codigo: cod, dispositivo, papel,
    armazenamento: armazenamentoDeMemoria(),   // usuário anônimo próprio
  });
}

// ---------------------------------------------------- cliente Phoenix mínimo ---
// Escrito aqui de propósito: o teste precisa poder tentar entrar num canal e
// observar a recusa, coisa que o transporte da aplicação esconde.
function entrarNoCanal({ topico, token, privado = true, aoReceber = () => {} }) {
  const host = URL_BASE.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://${host}/realtime/v1/websocket?apikey=${encodeURIComponent(CHAVE)}&vsn=1.0.0`);
    const alvo = 'realtime:' + topico;
    let ref = 0, joinRef = null, pronto = false;
    const prazo = setTimeout(() => { try { ws.close(); } catch (e) {} reject(new Error('tempo esgotado ao entrar no canal')); }, 15000);
    const empurrar = (event, payload, topic = alvo) => ws.send(JSON.stringify({ topic, event, payload, ref: String(++ref) }));
    ws.onopen = () => {
      empurrar('phx_join', {
        config: { broadcast: { self: false, ack: false }, presence: { key: '' }, postgres_changes: [], private: privado },
        access_token: token,
      });
      joinRef = String(ref);
    };
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch (_) { return; }
      if (m.event === 'phx_reply' && m.ref === joinRef) {
        clearTimeout(prazo);
        if (m.payload?.status === 'ok') {
          pronto = true;
          resolve({
            ws,
            enviar: msg => empurrar('broadcast', { type: 'broadcast', event: 'm', payload: msg }),
            fechar: () => { try { ws.close(); } catch (_) {} },
          });
        } else {
          try { ws.close(); } catch (_) {}
          reject(new Error('canal recusou a entrada: ' + JSON.stringify(m.payload || {})));
        }
      } else if (m.event === 'broadcast' && m.topic === alvo) {
        aoReceber(m.payload?.payload);
      } else if ((m.event === 'phx_error' || m.event === 'phx_close') && m.topic === alvo) {
        if (!pronto) { clearTimeout(prazo); reject(new Error('canal encerrado antes de entrar')); }
      }
    };
    ws.onerror = () => { if (!pronto) { clearTimeout(prazo); reject(new Error('falha de rede no canal')); } };
    ws.onclose = () => { if (!pronto) { clearTimeout(prazo); reject(new Error('canal fechado sem autorizar')); } };
  });
}
const esperar = ms => new Promise(r => setTimeout(r, ms));

// ------------------------------------------------------------------ roteiro ---
const mon = participante('monitor', 'm' + 'a'.repeat(23));
const ctrl = participante('controle', 'c' + '1'.repeat(32));
// Segundo controle autorizado: é a vítima do teste de identidade falsificada.
// Sem ele o teste seria inconclusivo, porque o canal é `self: false` e quem
// publica nunca recebe a própria mensagem de volta.
const ctrl2 = participante('controle', 'c' + '3'.repeat(32));
const intruso = participante('controle', 'c' + '2'.repeat(32));
const outraSala = participante('monitor', 'm' + 'b'.repeat(23), codigoB);
const canais = [];

try {
  console.log(`Projeto: ${URL_BASE}`);
  console.log(`Sala de teste: ${codigo} (segunda sala: ${codigoB})\n`);

  await conferir('login anônimo disponível', async () => {
    const s = new SupabaseSessao({ url: URL_BASE, chave: CHAVE, armazenamento: armazenamentoDeMemoria() });
    await s.garantir();
    precisa(s.token, 'sem token');
    return 'usuário ' + String(s.usuario).slice(0, 8);
  });

  await conferir('monitor abre a sala e fica autorizado', async () => {
    const r = await mon.conectar();
    salaCriada = mon;
    precisa(mon.situacao === 'autorizado', 'monitor não ficou autorizado');
    precisa(/^sala-/.test(r.topico), 'tópico não veio da sala');
    precisa(!r.topico.includes(codigo), 'o tópico não pode conter o código curto');
    return r.topico;
  });

  await conferir('controle entra e fica PENDENTE', async () => {
    const r = await ctrl.conectar();
    precisa(r.situacao === 'pendente', 'entrou já autorizado: ' + r.situacao);
    precisa(ctrl.pronto === false, 'pendente não pode estar pronto');
    precisa(r.topico === mon.topico, 'entrou em outro tópico');
  });

  await conferir('controle PENDENTE não consegue entrar no canal da sala', async () => {
    let entrou = false;
    try { const c = await entrarNoCanal({ topico: mon.topico, token: await ctrl.tokenAtual() }); canais.push(c); entrou = true; }
    catch (e) { /* recusa esperada */ }
    precisa(!entrou, 'um controle não autorizado entrou no canal');
  });

  await conferir('controle PENDENTE não consegue se autorizar sozinho', async () => {
    let conseguiu = false;
    try { await ctrl.sessao.rpc('sim_definir_situacao', { p_participante: ctrl.participanteId, p_situacao: 'autorizado' }); conseguiu = true; }
    catch (e) { /* recusa esperada */ }
    precisa(!conseguiu, 'o controle se autorizou sozinho');
  });

  await conferir('o monitor vê o controle na fila de pendentes', async () => {
    await mon.atualizarParticipantes(true);
    const fila = mon.pendentes();
    precisa(fila.some(p => p.dispositivo === ctrl.dispositivo), 'controle ausente da fila');
    return fila.length + ' pendente(s)';
  });

  let canalMonitor = null, canalControle = null, canalControle2 = null;
  const recebidasPeloControle = [], recebidasPeloMonitor = [], recebidasPeloControle2 = [];

  await conferir('após autorizar, os dois entram no canal privado', async () => {
    const fila = mon.pendentes().find(p => p.dispositivo === ctrl.dispositivo);
    await mon.autorizar(fila.id);
    await ctrl.atualizarParticipantes(true);
    precisa(ctrl.situacao === 'autorizado', 'o controle não ficou autorizado: ' + ctrl.situacao);
    canalMonitor = await entrarNoCanal({ topico: mon.topico, token: await mon.tokenAtual(), aoReceber: m => recebidasPeloMonitor.push(m) });
    canalControle = await entrarNoCanal({ topico: mon.topico, token: await ctrl.tokenAtual(), aoReceber: m => recebidasPeloControle.push(m) });
    canais.push(canalMonitor, canalControle);
  });

  await conferir('um segundo controle também é autorizado e entra na sala', async () => {
    await ctrl2.conectar();
    await mon.atualizarParticipantes(true);
    const fila = mon.pendentes().find(p => p.dispositivo === ctrl2.dispositivo);
    precisa(fila, 'o segundo controle não apareceu na fila');
    await mon.autorizar(fila.id);
    await ctrl2.atualizarParticipantes(true);
    precisa(ctrl2.situacao === 'autorizado', 'situação: ' + ctrl2.situacao);
    canalControle2 = await entrarNoCanal({ topico: mon.topico, token: await ctrl2.tokenAtual(), aoReceber: m => recebidasPeloControle2.push(m) });
    canais.push(canalControle2);
  });

  await conferir('o estado assinado pelo monitor é aceito pelo controle', async () => {
    const assinar = criarAssinador({ chavePrivada: mon.chavePrivada, sala: mon.salaId, disp: mon.dispositivo, papel: 'monitor' });
    canalMonitor.enviar(await assinar({ type: 'state', from: mon.dispositivo, role: 'monitor', state: { hr: 80 } }));
    await esperar(2500);
    precisa(recebidasPeloControle.length > 0, 'o controle não recebeu o estado');
    const r = await ctrl.verificar(recebidasPeloControle.at(-1));
    precisa(r.ok, 'estado recusado: ' + r.motivo);
  });

  await conferir('o comando assinado pelo controle é aceito pelo monitor', async () => {
    const assinar = criarAssinador({ chavePrivada: ctrl.chavePrivada, sala: ctrl.salaId, disp: ctrl.dispositivo, papel: 'controle' });
    canalControle.enviar(await assinar({ type: 'cmd', from: ctrl.dispositivo, role: 'controller', cmd: 'action', name: 'charge', seq: 1 }));
    await esperar(2500);
    precisa(recebidasPeloMonitor.length > 0, 'o monitor não recebeu o comando');
    const r = await mon.verificar(recebidasPeloMonitor.at(-1));
    precisa(r.ok, 'comando recusado: ' + r.motivo);
  });

  await conferir('um controle não consegue se passar pelo monitor para outro controle', async () => {
    // Cenário real: um aluno autorizado tenta publicar um estado falso como se
    // fosse o monitor, para enganar outro aluno. Ele CONSEGUE publicar — está
    // autorizado no canal. O que ele não consegue é assinar como o monitor.
    const comoMonitor = criarAssinador({ chavePrivada: ctrl.chavePrivada, sala: ctrl.salaId, disp: mon.dispositivo, papel: 'monitor' });
    const forjada = await comoMonitor({ type: 'state', from: mon.dispositivo, role: 'monitor', state: { hr: 999 } });
    const antes = recebidasPeloControle2.length;
    canalControle.enviar(forjada);
    await esperar(3000);
    precisa(recebidasPeloControle2.length > antes, 'a mensagem forjada não chegou ao segundo controle — teste inconclusivo');
    const r = await ctrl2.verificar(recebidasPeloControle2.at(-1));
    precisa(!r.ok, 'o segundo controle ACEITOU um estado forjado');
    // E o monitor, que também recebe, recusa pelo mesmo motivo.
    const rm = await mon.verificar(recebidasPeloMonitor.at(-1));
    precisa(!rm.ok, 'o monitor ACEITOU um estado assinado em seu nome por outro aparelho');
    return 'recusada por ambos: ' + r.motivo;
  });

  await conferir('um controle não consegue enviar comando no lugar de outro controle', async () => {
    const comoOutro = criarAssinador({ chavePrivada: ctrl.chavePrivada, sala: ctrl.salaId, disp: ctrl2.dispositivo, papel: 'controle' });
    const forjado = await comoOutro({ type: 'cmd', from: ctrl2.dispositivo, role: 'controller', cmd: 'action', name: 'shock', seq: 99 });
    const antes = recebidasPeloMonitor.length;
    canalControle.enviar(forjado);
    await esperar(3000);
    precisa(recebidasPeloMonitor.length > antes, 'o comando forjado não chegou ao monitor — teste inconclusivo');
    const r = await mon.verificar(recebidasPeloMonitor.at(-1));
    precisa(!r.ok, 'o monitor ACEITOU um comando assinado por outro aparelho');
    return 'recusado: ' + r.motivo;
  });

  await conferir('outra sala não lê nem escreve na sala alvo', async () => {
    await outraSala.conectar();
    precisa(outraSala.salaId !== mon.salaId, 'as duas salas colidiram');
    let entrou = false;
    try { const c = await entrarNoCanal({ topico: mon.topico, token: await outraSala.tokenAtual() }); canais.push(c); entrou = true; }
    catch (e) { /* recusa esperada */ }
    precisa(!entrou, 'um participante de outra sala entrou no canal alvo');
  });

  await conferir('quem não é da sala não lê a lista de participantes', async () => {
    const linhas = await intruso.sessao.selecionar(
      `sim_participantes?sala_id=eq.${encodeURIComponent(mon.salaId)}&select=id,dispositivo,chave`);
    precisa(Array.isArray(linhas) && linhas.length === 0, 'vazou a lista da sala: ' + JSON.stringify(linhas).slice(0, 200));
  });

  await conferir('canal público com o mesmo tópico é recusado (acesso público desligado)', async () => {
    let entrou = false;
    try { const c = await entrarNoCanal({ topico: mon.topico, token: await intruso.tokenAtual(), privado: false }); canais.push(c); entrou = true; }
    catch (e) { /* recusa esperada */ }
    precisa(!entrou, "'Allow public access' continua ligado nas configurações do Realtime: qualquer um escuta a sala");
  });

  await conferir('revogação tira o acesso ao canal', async () => {
    const alvo = mon.autorizados().find(p => p.dispositivo === ctrl.dispositivo);
    precisa(alvo, 'controle não consta como autorizado');
    await mon.revogar(alvo.id);
    await ctrl.atualizarParticipantes(true);
    precisa(ctrl.situacao === 'revogado', 'situação após revogar: ' + ctrl.situacao);
    const r = await ctrl.bater();
    precisa(r?.valido === false, 'o batimento continuou dizendo que o aparelho vale');
    // Reconexão: já revogado, não entra de novo.
    let entrou = false;
    try { const c = await entrarNoCanal({ topico: mon.topico, token: await ctrl.tokenAtual() }); canais.push(c); entrou = true; }
    catch (e) { /* recusa esperada */ }
    precisa(!entrou, 'um controle revogado reentrou no canal ao reconectar');
  });

  await conferir('controle revogado não volta sozinho ao entrar de novo pelo código', async () => {
    let voltou = false;
    try { await ctrl.sessao.rpc('sim_entrar_sala', { p_codigo: codigo, p_dispositivo: ctrl.dispositivo, p_chave: ctrl.chavePublica }); voltou = true; }
    catch (e) { /* recusa esperada */ }
    precisa(!voltou, 'o controle revogado recuperou acesso apenas reentrando');
  });

  await conferir('a chave de um aparelho não pode ser trocada por outra conta', async () => {
    const chaveIntruso = await identidadeDoAparelho(armazenamentoDeMemoria());
    let conseguiu = false;
    try {
      await intruso.sessao.rpc('sim_entrar_sala', { p_codigo: codigo, p_dispositivo: ctrl.dispositivo, p_chave: chaveIntruso.publica });
      conseguiu = true;
    } catch (e) { /* recusa esperada */ }
    precisa(!conseguiu, 'outra conta assumiu o aparelho de um controle existente');
  });

  await conferir('somente o monitor autoriza', async () => {
    let conseguiu = false;
    try { await intruso.sessao.rpc('sim_definir_situacao', { p_participante: ctrl.participanteId, p_situacao: 'autorizado' }); conseguiu = true; }
    catch (e) { /* recusa esperada */ }
    precisa(!conseguiu, 'um estranho autorizou um controle');
  });

} catch (e) {
  registrar('roteiro interrompido', false, e?.message || String(e));
} finally {
  for (const c of canais) { try { c.fechar(); } catch (e) {} }
  for (const p of [mon, ctrl, ctrl2, intruso, outraSala]) { try { p.pararTarefas(); } catch (e) {} }
  try { await mon.encerrar(); } catch (e) {}
  try { await outraSala.encerrar(); } catch (e) {}
}

const falhas = resultados.filter(r => !r.ok);
console.log(`\n${resultados.length - falhas.length}/${resultados.length} verificações online aprovadas.`);
if (salaCriada) console.log('Salas de teste encerradas.');
if (falhas.length) {
  console.log('\nFalhas:');
  for (const f of falhas) console.log(' - ' + f.nome + (f.detalhe ? ': ' + f.detalhe : ''));
}
process.exit(falhas.length ? 1 : 0);
