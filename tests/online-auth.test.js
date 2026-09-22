// Autorização do modo online: identidade verificável, isolamento entre salas,
// papéis, revogação e reconexão. Estes testes não tocam em serviço remoto —
// o Supabase é substituído por um `fetch` de mentira. A conferência contra um
// projeto real fica em scripts/audit-online.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonical, conteudoAssinado, gerarParDeChaves, exportarPublica, importarPublica,
  criarAssinador, verificarMensagem, JanelaDeRepeticao, PAPEL_POR_TIPO, ROLE_DO_PAPEL, MOTIVO,
} from '../public/js/crypto-identity.js';
import { SupabaseSessao, armazenamentoDeMemoria } from '../public/js/supabase-rest.js';
import { SalaOnline } from '../public/js/online-room.js';

const SALA = '11111111-1111-4111-8111-111111111111';
const OUTRA_SALA = '22222222-2222-4222-8222-222222222222';

async function participante(disp, papel, situacao = 'autorizado') {
  const par = await gerarParDeChaves();
  const jwk = await exportarPublica(par.publicKey);
  return {
    disp, papel, situacao, jwk,
    privada: par.privateKey,
    cadastro: { papel, situacao, chave: await importarPublica(jwk) },
    assinar: criarAssinador({ chavePrivada: par.privateKey, sala: SALA, disp, papel }),
  };
}

function sala(...partes) {
  const mapa = new Map(partes.map(p => [p.disp, p.cadastro]));
  return {
    sala: SALA,
    procurar: async d => mapa.get(d) || null,
    repeticao: new JanelaDeRepeticao(),
    mapa,
  };
}

// ------------------------------------------------------------- canônico ---

test('ONLINE: a forma canônica não depende da ordem dos campos e separa conteúdos diferentes', () => {
  assert.equal(canonical({ b: 1, a: [2, { d: 4, c: 3 }] }), canonical({ a: [2, { c: 3, d: 4 }], b: 1 }));
  assert.notEqual(canonical({ hr: 80 }), canonical({ hr: 81 }));
  // Campos ausentes não podem colidir com campos presentes de valor nulo.
  assert.notEqual(canonical({ a: 1, b: null }), canonical({ a: 1 }));
  // O envelope de assinatura nunca entra no que é assinado.
  const a = conteudoAssinado({ type: 'ping', from: 'c1', auth: { sig: 'x' } }, { sala: SALA, disp: 'c1', papel: 'controle', ts: 1, nonce: 'n' });
  const b = conteudoAssinado({ type: 'ping', from: 'c1' }, { sala: SALA, disp: 'c1', papel: 'controle', ts: 1, nonce: 'n' });
  assert.deepEqual([...a], [...b]);
});

// ------------------------------------------------------ identidade e papel ---

test('ONLINE: comando assinado por controle autorizado é aceito', async () => {
  const c = await participante('c1', 'controle');
  const ctx = sala(c);
  const msg = await c.assinar({ type: 'cmd', cmd: 'action', name: 'charge', seq: 1, from: 'c1', role: 'controller' });
  assert.equal((await verificarMensagem(msg, ctx)).ok, true);
});

test('ONLINE: alterar qualquer campo do comando invalida a assinatura', async () => {
  const c = await participante('c1', 'controle');
  const ctx = sala(c);
  const msg = await c.assinar({ type: 'cmd', cmd: 'set', data: { vit: { hr: 80 } }, seq: 1, from: 'c1', role: 'controller' });
  for (const adulterado of [
    { ...msg, data: { vit: { hr: 200 } } },
    { ...msg, cmd: 'action' },
    { ...msg, seq: 99 },
    { ...msg, session: 'outra' },
    { ...msg, lease: 'outro' },
    { ...msg, auth: { ...msg.auth, ts: msg.auth.ts + 1 } },
  ]) {
    const r = await verificarMensagem(adulterado, { ...ctx, repeticao: new JanelaDeRepeticao() });
    assert.equal(r.ok, false, JSON.stringify(Object.keys(adulterado)));
    assert.equal(r.motivo, MOTIVO.assinatura);
  }
});

test('ONLINE: um controle autorizado não consegue assumir a identidade de outro', async () => {
  const c1 = await participante('c1', 'controle');
  const c2 = await participante('c2', 'controle');
  const ctx = sala(c1, c2);
  // c1 assina, mas diz ser c2 no campo `from`.
  const msg = await c1.assinar({ type: 'cmd', cmd: 'action', name: 'shock', seq: 1, from: 'c2', role: 'controller' });
  assert.deepEqual(await verificarMensagem(msg, ctx), { ok: false, motivo: MOTIVO.remetente });

  // c1 reescreve o envelope inteiro para apontar c2: a assinatura não fecha
  // porque a chave cadastrada de c2 é outra.
  const forjado = { ...msg, from: 'c2', auth: { ...msg.auth, disp: 'c2' } };
  assert.deepEqual(await verificarMensagem(forjado, ctx), { ok: false, motivo: MOTIVO.assinatura });
});

test('ONLINE: um controle não consegue se passar pelo monitor nem publicar estado', async () => {
  const mon = await participante('m1', 'monitor');
  const c1 = await participante('c1', 'controle');
  const ctx = sala(mon, c1);

  // Assinando como controle, mas declarando papel de monitor na assinatura.
  const comoMonitor = criarAssinador({ chavePrivada: c1.privada, sala: SALA, disp: 'c1', papel: 'monitor' });
  const msg = await comoMonitor({ type: 'state', state: {}, from: 'c1', role: 'monitor' });
  assert.deepEqual(await verificarMensagem(msg, ctx), { ok: false, motivo: MOTIVO.papel });

  // Assinando corretamente como controle, mas enviando uma mensagem de monitor.
  const estado = await c1.assinar({ type: 'state', state: {}, from: 'c1', role: 'controller' });
  assert.deepEqual(await verificarMensagem(estado, ctx), { ok: false, motivo: MOTIVO.tipo });

  // E o inverso: o monitor não emite comandos.
  const cmd = await mon.assinar({ type: 'cmd', cmd: 'action', name: 'shock', seq: 1, from: 'm1', role: 'monitor' });
  assert.deepEqual(await verificarMensagem(cmd, sala(mon, c1)), { ok: false, motivo: MOTIVO.tipo });
});

test('ONLINE: o campo role do payload precisa concordar com o papel cadastrado', async () => {
  const c = await participante('c1', 'controle');
  const ctx = sala(c);
  const msg = await c.assinar({ type: 'ping', from: 'c1', role: 'monitor' });
  assert.deepEqual(await verificarMensagem(msg, ctx), { ok: false, motivo: MOTIVO.papel });
  assert.equal(ROLE_DO_PAPEL.controle, 'controller');
  assert.equal(ROLE_DO_PAPEL.monitor, 'monitor');
});

test('ONLINE: a tabela de papel por tipo repete as regras do servidor Go', () => {
  assert.deepEqual(PAPEL_POR_TIPO, {
    state: 'monitor', ack: 'monitor', bye: 'monitor', notice: 'monitor',
    cmd: 'controle', 'pair-request': 'controle',
    hello: null, ping: null, 'peer-left': null,
  });
});

test('ONLINE: tipo desconhecido é recusado', async () => {
  const c = await participante('c1', 'controle');
  const msg = await c.assinar({ type: 'exec', from: 'c1', role: 'controller' });
  assert.deepEqual(await verificarMensagem(msg, sala(c)), { ok: false, motivo: MOTIVO.tipo });
});

// ------------------------------------------------------------ isolamento ---

test('ONLINE: mensagem assinada para outra sala não vale nesta sala', async () => {
  const c = await participante('c1', 'controle');
  const ctx = sala(c);
  const deOutraSala = criarAssinador({ chavePrivada: c.privada, sala: OUTRA_SALA, disp: 'c1', papel: 'controle' });
  const msg = await deOutraSala({ type: 'cmd', cmd: 'action', name: 'shock', seq: 1, from: 'c1', role: 'controller' });
  assert.deepEqual(await verificarMensagem(msg, ctx), { ok: false, motivo: MOTIVO.sala });
  // E o mesmo comando vale na sala de origem: o que separa é a sala assinada.
  assert.equal((await verificarMensagem(msg, { ...ctx, sala: OUTRA_SALA, repeticao: new JanelaDeRepeticao() })).ok, true);
});

test('ONLINE: aparelho não cadastrado e aparelho revogado são recusados', async () => {
  const c = await participante('c1', 'controle');
  const rev = await participante('c9', 'controle', 'revogado');
  const msg = await c.assinar({ type: 'cmd', cmd: 'action', name: 'charge', seq: 1, from: 'c1', role: 'controller' });
  assert.deepEqual(await verificarMensagem(msg, sala(rev)), { ok: false, motivo: MOTIVO.desconhecido });

  const msgRev = await rev.assinar({ type: 'cmd', cmd: 'action', name: 'charge', seq: 1, from: 'c9', role: 'controller' });
  assert.deepEqual(await verificarMensagem(msgRev, sala(rev)), { ok: false, motivo: MOTIVO.naoAutorizado });
});

test('ONLINE: revogar durante a aula passa a recusar o mesmo aparelho', async () => {
  const c = await participante('c1', 'controle');
  const ctx = sala(c);
  const antes = await c.assinar({ type: 'cmd', cmd: 'action', name: 'charge', seq: 1, from: 'c1', role: 'controller' });
  assert.equal((await verificarMensagem(antes, ctx)).ok, true);
  ctx.mapa.get('c1').situacao = 'revogado';
  const depois = await c.assinar({ type: 'cmd', cmd: 'action', name: 'charge', seq: 2, from: 'c1', role: 'controller' });
  assert.deepEqual(await verificarMensagem(depois, ctx), { ok: false, motivo: MOTIVO.naoAutorizado });
});

// -------------------------------------------------- repetição e atraso ---

test('ONLINE: a mesma mensagem assinada não é aceita duas vezes', async () => {
  const c = await participante('c1', 'controle');
  const ctx = sala(c);
  const msg = await c.assinar({ type: 'cmd', cmd: 'action', name: 'shock', seq: 1, from: 'c1', role: 'controller' });
  assert.equal((await verificarMensagem(msg, ctx)).ok, true);
  assert.deepEqual(await verificarMensagem(msg, ctx), { ok: false, motivo: MOTIVO.repetida });
});

test('ONLINE: mensagem fora da janela de tempo é recusada nos dois sentidos', async () => {
  const c = await participante('c1', 'controle');
  const ctx = sala(c);
  const msg = await c.assinar({ type: 'cmd', cmd: 'action', name: 'shock', seq: 1, from: 'c1', role: 'controller' });
  const atrasada = { ...ctx, agora: () => msg.auth.ts + 31000, repeticao: new JanelaDeRepeticao() };
  assert.deepEqual(await verificarMensagem(msg, atrasada), { ok: false, motivo: MOTIVO.atraso });
  const adiantada = { ...ctx, agora: () => msg.auth.ts - 31000, repeticao: new JanelaDeRepeticao() };
  assert.deepEqual(await verificarMensagem(msg, adiantada), { ok: false, motivo: MOTIVO.atraso });
});

test('ONLINE: a janela de repetição esquece nonces antigos sem esquecer os recentes', () => {
  let t = 0;
  const j = new JanelaDeRepeticao(1000, () => t);
  assert.equal(j.registrar('c1', 'a'), true);
  assert.equal(j.registrar('c1', 'a'), false);
  // O mesmo nonce vindo de outro aparelho é outra mensagem.
  assert.equal(j.registrar('c2', 'a'), true);
  t = 1500;
  assert.equal(j.registrar('c1', 'a'), true, 'fora da janela, o nonce pode voltar');
});

test('ONLINE: mensagem sem assinatura é recusada', async () => {
  const c = await participante('c1', 'controle');
  const ctx = sala(c);
  for (const msg of [
    { type: 'cmd', from: 'c1' },
    { type: 'cmd', from: 'c1', auth: {} },
    { type: 'cmd', from: 'c1', auth: { sala: SALA, disp: 'c1', papel: 'controle', ts: Date.now(), nonce: 'n', alg: 'none', sig: 'x' } },
  ]) {
    assert.deepEqual(await verificarMensagem(msg, ctx), { ok: false, motivo: MOTIVO.semAuth });
  }
});

// ------------------------------------------------------------- sessão ---

function fetchFalso(rotas) {
  const chamadas = [];
  const f = async (url, opcoes = {}) => {
    chamadas.push({ url: String(url), opcoes });
    for (const [padrao, resposta] of rotas) {
      if (String(url).includes(padrao)) {
        const r = typeof resposta === 'function' ? resposta(opcoes, chamadas) : resposta;
        return { ok: r.ok !== false, status: r.status || 200, json: async () => r.corpo };
      }
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  f.chamadas = chamadas;
  return f;
}

test('ONLINE: a sessão anônima é criada uma vez e reaproveitada entre aulas', async () => {
  const guarda = armazenamentoDeMemoria();
  let agora = 1000;
  const f = fetchFalso([
    ['/auth/v1/signup', { corpo: { access_token: 't1', refresh_token: 'r1', expires_in: 3600, user: { id: 'u1' } } }],
  ]);
  const s1 = new SupabaseSessao({ url: 'https://x.invalid', chave: 'pub', armazenamento: guarda, fetchImpl: f, agora: () => agora });
  await s1.garantir();
  assert.equal(s1.token, 't1');
  assert.equal(s1.usuario, 'u1');
  assert.equal(f.chamadas.length, 1);

  // Outra aula, mesmo aparelho: nenhum usuário novo é criado.
  const s2 = new SupabaseSessao({ url: 'https://x.invalid', chave: 'pub', armazenamento: guarda, fetchImpl: f, agora: () => agora });
  await s2.garantir();
  assert.equal(s2.token, 't1');
  assert.equal(f.chamadas.length, 1, 'não pode gastar a cota de 30 logins anônimos por hora');
});

test('ONLINE: token perto de vencer é renovado; renovação recusada recomeça a sessão', async () => {
  const guarda = armazenamentoDeMemoria();
  let agora = 1000;
  const f = fetchFalso([
    ['grant_type=refresh_token', (_o, c) => (c.filter(x => x.url.includes('refresh_token')).length === 1
      ? { corpo: { access_token: 't2', refresh_token: 'r2', expires_in: 3600 } }
      : { ok: false, status: 400, corpo: { error: 'invalid_grant' } })],
    ['/auth/v1/signup', { corpo: { access_token: 't9', refresh_token: 'r9', expires_in: 3600, user: { id: 'u9' } } }],
  ]);
  guarda.setItem('bmsim-sessao', JSON.stringify({ access_token: 't1', refresh_token: 'r1', user_id: 'u1', expira_em: 2000 }));
  const s = new SupabaseSessao({ url: 'https://x.invalid', chave: 'pub', armazenamento: guarda, fetchImpl: f, agora: () => agora });

  await s.garantir();
  assert.equal(s.token, 't2', 'renova antes de vencer');

  agora = 10_000_000;
  await s.garantir();
  assert.equal(s.token, 't9', 'renovação recusada cai para uma sessão nova');
});

test('ONLINE: chamadas levam o token do usuário, não só a chave publicável', async () => {
  const guarda = armazenamentoDeMemoria();
  const f = fetchFalso([
    ['/auth/v1/signup', { corpo: { access_token: 't1', refresh_token: 'r1', expires_in: 3600, user: { id: 'u1' } } }],
    ['/rest/v1/rpc/sim_ping', { corpo: { valido: true, situacao: 'autorizado' } }],
  ]);
  const s = new SupabaseSessao({ url: 'https://x.invalid', chave: 'pub', armazenamento: guarda, fetchImpl: f });
  await s.rpc('sim_ping', { p_sala: SALA, p_dispositivo: 'c1' });
  const chamada = f.chamadas.at(-1);
  assert.equal(chamada.opcoes.headers.Authorization, 'Bearer t1');
  assert.equal(chamada.opcoes.headers.apikey, 'pub');
});

// --------------------------------------------------------------- sala ---

function salaFalsa({ papel = 'controle', entrada, participantes = [] } = {}) {
  const guarda = armazenamentoDeMemoria();
  const rpc = [];
  const f = fetchFalso([
    ['/auth/v1/signup', { corpo: { access_token: 't1', refresh_token: 'r1', expires_in: 3600, user: { id: 'u1' } } }],
    ['/rest/v1/rpc/sim_abrir_sala', o => { rpc.push(['sim_abrir_sala', JSON.parse(o.body)]); return { corpo: entrada }; }],
    ['/rest/v1/rpc/sim_entrar_sala', o => { rpc.push(['sim_entrar_sala', JSON.parse(o.body)]); return { corpo: entrada }; }],
    ['/rest/v1/rpc/sim_definir_situacao', o => { rpc.push(['sim_definir_situacao', JSON.parse(o.body)]); return { corpo: { ok: true } }; }],
    ['/rest/v1/rpc/sim_ping', o => { rpc.push(['sim_ping', JSON.parse(o.body)]); return { corpo: { valido: true, situacao: 'autorizado' } }; }],
    ['/rest/v1/sim_participantes', { corpo: participantes }],
  ]);
  const sala = new SalaOnline({
    url: 'https://x.invalid', chave: 'pub', codigo: '4321',
    dispositivo: papel === 'monitor' ? 'm1' : 'c1', papel,
    armazenamento: guarda, fetchImpl: f,
  });
  return { sala, rpc, fetch: f, participantes };
}

test('ONLINE: o controle entra pendente e só fica pronto quando o monitor autoriza', async () => {
  const chave = await exportarPublica((await gerarParDeChaves()).publicKey);
  const lista = [{ id: 'p1', dispositivo: 'c1', papel: 'controle', chave, situacao: 'pendente' }];
  const { sala, rpc } = salaFalsa({
    entrada: { sala_id: SALA, topico: 'sala-abc', participante_id: 'p1', papel: 'controle', situacao: 'pendente' },
    participantes: lista,
  });
  await sala.conectar();
  try {
    assert.equal(rpc[0][0], 'sim_entrar_sala');
    assert.equal(rpc[0][1].p_codigo, '4321');
    assert.ok(rpc[0][1].p_chave.x, 'a chave pública é registrada na entrada');
    assert.equal(sala.situacao, 'pendente');
    assert.equal(sala.pronto, false, 'pendente não entra no canal da sala');

    lista[0].situacao = 'autorizado';
    await sala.atualizarParticipantes(true);
    assert.equal(sala.situacao, 'autorizado');
    assert.equal(sala.pronto, true);
  } finally { sala.pararTarefas(); }
});

test('ONLINE: o monitor vê a fila de pendentes e autoriza pelo identificador do banco', async () => {
  const chave = await exportarPublica((await gerarParDeChaves()).publicKey);
  const lista = [
    { id: 'pm', dispositivo: 'm1', papel: 'monitor', chave, situacao: 'autorizado' },
    { id: 'p1', dispositivo: 'c1', papel: 'controle', chave, situacao: 'pendente' },
    { id: 'p2', dispositivo: 'c2', papel: 'controle', chave, situacao: 'autorizado' },
  ];
  const { sala, rpc } = salaFalsa({
    papel: 'monitor',
    entrada: { sala_id: SALA, topico: 'sala-abc', participante_id: 'pm', papel: 'monitor' },
    participantes: lista,
  });
  await sala.conectar();
  try {
    assert.deepEqual(sala.pendentes(), [{ dispositivo: 'c1', id: 'p1' }]);
    assert.deepEqual(sala.autorizados(), [{ dispositivo: 'c2', id: 'p2' }]);
    await sala.autorizar('p1');
    assert.deepEqual(rpc.at(-1), ['sim_definir_situacao', { p_participante: 'p1', p_situacao: 'autorizado' }]);
    await sala.revogar('p2');
    assert.deepEqual(rpc.at(-1), ['sim_definir_situacao', { p_participante: 'p2', p_situacao: 'revogado' }]);
  } finally { sala.pararTarefas(); }
});

test('ONLINE: a sala verifica mensagens com as chaves lidas do banco', async () => {
  const par = await gerarParDeChaves();
  const jwk = await exportarPublica(par.publicKey);
  const lista = [{ id: 'pm', dispositivo: 'm1', papel: 'monitor', chave: jwk, situacao: 'autorizado' }];
  const { sala } = salaFalsa({
    entrada: { sala_id: SALA, topico: 'sala-abc', participante_id: 'p1', papel: 'controle', situacao: 'autorizado' },
    participantes: lista,
  });
  await sala.conectar();
  try {
    const assinarMonitor = criarAssinador({ chavePrivada: par.privateKey, sala: SALA, disp: 'm1', papel: 'monitor' });
    const estado = await assinarMonitor({ type: 'state', state: { hr: 80 }, from: 'm1', role: 'monitor' });
    assert.equal((await sala.verificar(estado)).ok, true);
    assert.equal((await sala.verificar({ ...estado, state: { hr: 200 } })).ok, false);

    // Um aparelho fora da lista do banco não é aceito nem com assinatura boa.
    const intruso = await gerarParDeChaves();
    const assinarIntruso = criarAssinador({ chavePrivada: intruso.privateKey, sala: SALA, disp: 'mX', papel: 'monitor' });
    const falso = await assinarIntruso({ type: 'state', state: {}, from: 'mX', role: 'monitor' });
    assert.deepEqual(await sala.verificar(falso), { ok: false, motivo: MOTIVO.desconhecido });
  } finally { sala.pararTarefas(); }
});

test('ONLINE: o batimento derruba o aparelho quando a sala responde que ele não vale mais', async () => {
  const chave = await exportarPublica((await gerarParDeChaves()).publicKey);
  const guarda = armazenamentoDeMemoria();
  let resposta = { valido: true, situacao: 'autorizado' };
  const f = fetchFalso([
    ['/auth/v1/signup', { corpo: { access_token: 't1', refresh_token: 'r1', expires_in: 3600, user: { id: 'u1' } } }],
    ['/rest/v1/rpc/sim_entrar_sala', { corpo: { sala_id: SALA, topico: 'sala-abc', participante_id: 'p1', papel: 'controle', situacao: 'autorizado' } }],
    ['/rest/v1/rpc/sim_ping', () => ({ corpo: resposta })],
    ['/rest/v1/sim_participantes', { corpo: [{ id: 'p1', dispositivo: 'c1', papel: 'controle', chave, situacao: 'autorizado' }] }],
  ]);
  const mudancas = [];
  const sala = new SalaOnline({
    url: 'https://x.invalid', chave: 'pub', codigo: '4321', dispositivo: 'c1', papel: 'controle',
    armazenamento: guarda, fetchImpl: f, aoMudar: s => mudancas.push(s.situacao),
  });
  await sala.conectar();
  try {
    assert.equal(sala.pronto, true);
    resposta = { valido: false, situacao: 'revogado', motivo: 'revogado' };
    await sala.bater();
    assert.equal(sala.situacao, 'revogado');
    assert.equal(sala.pronto, false);
    assert.deepEqual(mudancas, ['revogado']);
  } finally { sala.pararTarefas(); }
});

test('ONLINE: sem WebCrypto a sala recusa com uma frase legível, antes de qualquer rede', async () => {
  const { SEM_WEBCRYPTO, webcryptoDisponivel } = await import('../public/js/crypto-identity.js');
  assert.equal(webcryptoDisponivel(), true, 'este ambiente tem WebCrypto');

  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  let chamouRede = false;
  const f = fetchFalso([['', () => { chamouRede = true; return { corpo: {} }; }]]);
  // Simula http://192.168.x.x: getRandomValues existe, subtle não.
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { getRandomValues: a => original.value.getRandomValues(a) },
  });
  try {
    const sala = new SalaOnline({
      url: 'https://x.invalid', chave: 'pub', codigo: '4321',
      dispositivo: 'c1', papel: 'controle',
      armazenamento: armazenamentoDeMemoria(), fetchImpl: f,
    });
    await assert.rejects(() => sala.conectar(), e => {
      assert.equal(e.message, SEM_WEBCRYPTO);
      assert.match(e.message, /HTTPS/);
      return true;
    });
    assert.equal(chamouRede, false, 'não pode nem tentar criar usuário sem ter como assinar');
  } finally { Object.defineProperty(globalThis, 'crypto', original); }
});

// ---------------------------------------------- correções da revisão 22/09 ---

test('ONLINE: 401 permanente tenta renovar uma vez só e desiste, sem queimar a cota', async () => {
  let chamadas = 0, logins = 0;
  const f = async (url) => {
    chamadas++;
    if (String(url).includes('/auth/v1/signup')) {
      logins++;
      return { ok: true, status: 200, json: async () => ({ access_token: 't' + logins, refresh_token: null, expires_in: 3600, user: { id: 'u1' } }) };
    }
    return { ok: false, status: 401, json: async () => ({ message: 'JWT rejeitado' }) };
  };
  const s = new SupabaseSessao({ url: 'https://x.invalid', chave: 'pub', armazenamento: armazenamentoDeMemoria(), fetchImpl: f });

  await assert.rejects(() => s.rpc('sim_ping', {}), e => e.status === 401);
  // Um login inicial, uma renovação, e para. Nunca um laço.
  assert.ok(logins <= 2, 'gastou ' + logins + ' logins anônimos; o limite do Supabase é 30 por hora por IP');
  assert.ok(chamadas <= 4, 'fez ' + chamadas + ' chamadas de rede para uma única RPC');

  chamadas = 0; logins = 0;
  const s2 = new SupabaseSessao({ url: 'https://x.invalid', chave: 'pub', armazenamento: armazenamentoDeMemoria(), fetchImpl: f });
  await assert.rejects(() => s2.selecionar('sim_participantes?select=id'), e => e.status === 401);
  assert.ok(logins <= 2 && chamadas <= 4, 'selecionar() também precisa parar');
});

test('ONLINE: leitura inicial de participantes que falha não impede as tarefas de fundo', async () => {
  const guarda = armazenamentoDeMemoria();
  let listar = 0;
  const f = async (url, o) => {
    if (String(url).includes('/auth/v1/signup'))
      return { ok: true, status: 200, json: async () => ({ access_token: 't1', refresh_token: 'r1', expires_in: 3600, user: { id: 'u1' } }) };
    if (String(url).includes('/rest/v1/rpc/sim_abrir_sala'))
      return { ok: true, status: 200, json: async () => ({ sala_id: SALA, topico: 'sala-abc', participante_id: 'pm', papel: 'monitor' }) };
    if (String(url).includes('/rest/v1/sim_participantes')) {
      listar++;
      if (listar === 1) throw new Error('rede oscilou');     // só a primeira falha
      return { ok: true, status: 200, json: async () => [] };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const sala = new SalaOnline({
    url: 'https://x.invalid', chave: 'pub', codigo: '4321',
    dispositivo: 'm1', papel: 'monitor', armazenamento: guarda, fetchImpl: f,
  });

  await assert.doesNotReject(() => sala.conectar(), 'a falha na lista não pode derrubar a conexão');
  try {
    assert.equal(sala.salaId, SALA);
    assert.ok(sala.timers.length > 0, 'sem temporizador, a sala não relê participantes nem bate ponto');
    // E a releitura seguinte funciona.
    await sala.atualizarParticipantes(true);
    assert.equal(listar, 2);
  } finally { sala.pararTarefas(); }
});
