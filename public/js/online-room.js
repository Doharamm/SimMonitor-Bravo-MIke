// Ciclo de vida da sala no modo online.
//
// Junta três coisas que o modo local resolvia com o socket do servidor Go:
//   • quem é este aparelho  → par de chaves ECDSA guardado no navegador;
//   • quem está na sala     → tabela sim_participantes, lida com o token do usuário;
//   • quem pode mandar o quê → situação 'autorizado' + papel, ambos do cadastro.
//
// O monitor abre a sala e autoriza/revoga. O controle entra pelo código curto e
// fica pendente até ser autorizado. Enquanto pendente ele não entra no canal:
// as políticas de realtime.messages recusam leitura e envio, então um controle
// não autorizado não recebe estado nem consegue enviar comando algum.

import { SupabaseSessao } from './supabase-rest.js';
import {
  gerarParDeChaves, exportarPublica, importarPublica, exportarPrivada, importarPrivada,
  criarAssinador, verificarMensagem, JanelaDeRepeticao, webcryptoDisponivel, SEM_WEBCRYPTO,
} from './crypto-identity.js';

const CHAVE_LOCAL = 'bmsim-chave-aparelho';
const ATUALIZA_MS = 4000;   // releitura da lista de participantes
const PING_MS = 10000;      // batimento que mantém visto_em em dia

// Par de chaves por aparelho, reaproveitado entre aulas. Fica no localStorage:
// protege contra outro participante da sala, não contra quem já tem o aparelho.
export async function identidadeDoAparelho(armazenamento) {
  let guardado = null;
  try { guardado = JSON.parse(armazenamento.getItem(CHAVE_LOCAL) || 'null'); } catch (e) { guardado = null; }
  if (guardado?.privada && guardado?.publica) {
    try {
      return { privada: await importarPrivada(guardado.privada), publica: guardado.publica };
    } catch (e) { /* formato antigo ou ilegível: gera outro par */ }
  }
  const par = await gerarParDeChaves();
  const publica = await exportarPublica(par.publicKey);
  const privada = await exportarPrivada(par.privateKey);
  try { armazenamento.setItem(CHAVE_LOCAL, JSON.stringify({ privada, publica })); } catch (e) { /* aba anônima */ }
  return { privada: par.privateKey, publica };
}

export class SalaOnline {
  constructor({ url, chave, codigo, dispositivo, papel, armazenamento, fetchImpl, agora = () => Date.now(), aoMudar = () => {} }) {
    this.sessao = new SupabaseSessao({ url, chave, armazenamento, fetchImpl, agora });
    this.codigo = String(codigo);
    this.dispositivo = dispositivo;
    this.papel = papel === 'monitor' ? 'monitor' : 'controle';
    this.armazenamento = armazenamento;
    this.agora = agora;
    this.aoMudar = aoMudar;
    this.repeticao = new JanelaDeRepeticao(30000, agora);
    this.participantes = new Map();  // dispositivo → {id, papel, situacao, chave: CryptoKey, jwk}
    this.salaId = null; this.topico = null; this.participanteId = null;
    this.situacao = this.papel === 'monitor' ? 'autorizado' : 'pendente';
    this.motivo = '';
    this.ultimaLista = 0;
    this.assinar = null;
    this.timers = [];
  }

  get pronto() { return !!this.topico && this.situacao === 'autorizado'; }
  get token() { return this.sessao.token; }

  // Abre (monitor) ou entra (controle). Lança em caso de recusa do banco.
  async conectar() {
    // Antes de qualquer chamada de rede: sem WebCrypto nada aqui funciona, e o
    // instrutor precisa ler o porquê em vez de "sem conexão".
    if (!webcryptoDisponivel()) throw new Error(SEM_WEBCRYPTO);
    await this.sessao.garantir();
    const ident = await identidadeDoAparelho(this.armazenamento);
    this.chavePrivada = ident.privada;
    this.chavePublica = ident.publica;

    const r = this.papel === 'monitor'
      ? await this.sessao.rpc('sim_abrir_sala', { p_codigo: this.codigo, p_dispositivo: this.dispositivo, p_chave: ident.publica })
      : await this.sessao.rpc('sim_entrar_sala', { p_codigo: this.codigo, p_dispositivo: this.dispositivo, p_chave: ident.publica });

    this.salaId = r.sala_id;
    this.topico = r.topico;
    this.participanteId = r.participante_id;
    this.situacao = r.situacao || 'autorizado';
    this.expiraEm = r.expira_em;

    this.assinar = criarAssinador({
      chavePrivada: this.chavePrivada, sala: this.salaId,
      disp: this.dispositivo, papel: this.papel, agora: this.agora,
    });

    if (r.monitor?.chave && r.monitor?.dispositivo) {
      await this.guardarParticipante({ dispositivo: r.monitor.dispositivo, papel: 'monitor', situacao: 'autorizado', chave: r.monitor.chave });
    }
    // A primeira leitura da lista não pode derrubar a conexão: se ela falhar e
    // a exceção subir, `salaId` já está preenchido, a retomada de startOnline()
    // pula `conectar()` e as tarefas de fundo nunca começam — a sala ficaria
    // sem fila de autorização, sem detectar revogação e com `visto_em` parado,
    // o que deixaria outro aparelho assumir a sala em 30 s. O temporizador
    // abaixo repete a leitura sozinho.
    await this.atualizarParticipantes(true).catch(() => {});
    this.iniciarTarefas();
    return { salaId: this.salaId, topico: this.topico, situacao: this.situacao };
  }

  iniciarTarefas() {
    this.pararTarefas();
    this.timers.push(setInterval(() => { this.atualizarParticipantes().catch(() => {}); }, ATUALIZA_MS));
    this.timers.push(setInterval(() => { this.bater().catch(() => {}); }, PING_MS));
  }
  pararTarefas() { for (const t of this.timers) clearInterval(t); this.timers = []; }

  async guardarParticipante(linha) {
    if (!linha?.dispositivo || !linha?.chave) return;
    const anterior = this.participantes.get(linha.dispositivo);
    const mesmaChave = anterior && JSON.stringify(anterior.jwk) === JSON.stringify(linha.chave);
    let chave = anterior?.chave;
    if (!mesmaChave) {
      try { chave = await importarPublica(linha.chave); } catch (e) { return; }
    }
    this.participantes.set(linha.dispositivo, {
      id: linha.id ?? anterior?.id ?? null,
      papel: linha.papel, situacao: linha.situacao, chave, jwk: linha.chave,
    });
  }

  async atualizarParticipantes(forcar = false) {
    if (!this.salaId) return this.participantes;
    if (!forcar && this.agora() - this.ultimaLista < 1500) return this.participantes;
    this.ultimaLista = this.agora();
    const linhas = await this.sessao.selecionar(
      `sim_participantes?sala_id=eq.${encodeURIComponent(this.salaId)}&select=id,dispositivo,papel,chave,situacao,visto_em`);
    if (!Array.isArray(linhas)) return this.participantes;
    const vistos = new Set();
    for (const l of linhas) { vistos.add(l.dispositivo); await this.guardarParticipante(l); }
    for (const d of [...this.participantes.keys()]) if (!vistos.has(d)) this.participantes.delete(d);
    const meu = this.participantes.get(this.dispositivo);
    if (meu && meu.situacao !== this.situacao) { this.situacao = meu.situacao; this.aoMudar(this); }
    return this.participantes;
  }

  // Confere se este aparelho continua valendo. Usado para revogação e para
  // detectar que outra aba assumiu o papel de monitor desta sala.
  async bater() {
    if (!this.salaId) return null;
    const r = await this.sessao.rpc('sim_ping', { p_sala: this.salaId, p_dispositivo: this.dispositivo });
    const antes = this.situacao;
    if (r && r.valido === false) {
      this.situacao = r.situacao || 'revogado';
      this.motivo = r.motivo || '';
    } else if (r?.situacao) {
      this.situacao = r.situacao; this.motivo = '';
    }
    if (this.situacao !== antes) this.aoMudar(this);
    return r;
  }

  // Lista de controles aguardando autorização (usada pelo monitor).
  pendentes() {
    const fila = [];
    for (const [dispositivo, p] of this.participantes) {
      if (p.papel === 'controle' && p.situacao === 'pendente') fila.push({ dispositivo, id: p.id });
    }
    return fila;
  }
  autorizados() {
    const lista = [];
    for (const [dispositivo, p] of this.participantes) {
      if (p.papel === 'controle' && p.situacao === 'autorizado') lista.push({ dispositivo, id: p.id });
    }
    return lista;
  }

  async definirSituacao(participanteId, situacao) {
    const r = await this.sessao.rpc('sim_definir_situacao', { p_participante: participanteId, p_situacao: situacao });
    await this.atualizarParticipantes(true);
    return r;
  }
  autorizar(participanteId) { return this.definirSituacao(participanteId, 'autorizado'); }
  revogar(participanteId) { return this.definirSituacao(participanteId, 'revogado'); }

  async encerrar() {
    this.pararTarefas();
    if (this.papel === 'monitor' && this.salaId) {
      try { await this.sessao.rpc('sim_encerrar_sala', { p_sala: this.salaId }); } catch (e) { /* sala já fechada */ }
    }
  }

  // ------------------------------------------------ uso pelo transporte ---

  // Procura a chave de um aparelho. Se for desconhecido, tenta reler a lista
  // uma vez (um controle recém-autorizado pode aparecer entre duas leituras).
  async procurar(dispositivo) {
    let p = this.participantes.get(dispositivo);
    if (!p) { await this.atualizarParticipantes().catch(() => {}); p = this.participantes.get(dispositivo); }
    return p || null;
  }

  async verificar(msg) {
    return verificarMensagem(msg, {
      sala: this.salaId,
      procurar: d => this.procurar(d),
      repeticao: this.repeticao,
      agora: this.agora,
    });
  }

  async tokenAtual() { await this.sessao.garantir(); return this.sessao.token; }
}
