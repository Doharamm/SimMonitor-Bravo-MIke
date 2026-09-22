// Comunicação entre monitor e controle.
// local  → WebSocket no programa do notebook (funciona sem internet)
// online → Supabase Realtime, protocolo Phoenix direto (sem bibliotecas externas)
// demo   → BroadcastChannel (abas no mesmo aparelho)
import { CONFIG } from './config.js';

export async function detectMode() {
  const forced = new URLSearchParams(location.search).get('modo');
  if (forced === 'demo') return {mode:'demo'};
  const probe = new AbortController();
  const timeout = setTimeout(() => probe.abort(), 2000);
  try {
    const r = await fetch('/api/info', { cache: 'no-store', signal: probe.signal });
    if (r.ok) {
      const info = await r.json();
      if (info.preview) return { mode: 'demo' };
      if (info.local && forced !== 'online' && forced !== 'demo') return { mode: 'local', info };
    }
  } catch (e) { /* O servidor local pode estar reiniciando. */ }
  finally { clearTimeout(timeout); }
  // Uma queda do programa local não deve transferir a sala para o serviço online.
  const host = location.hostname || '';
  const privateHost = /^(localhost|127\.[\d.]+|\[?::1\]?|10\.[\d.]+|192\.168\.[\d.]+|172\.(1[6-9]|2\d|3[01])\.[\d.]+)$/.test(host);
  if (forced === 'local' || (privateHost && forced !== 'online')) return {mode:'local'};
  if (CONFIG.supabaseUrl && CONFIG.supabaseKey) return { mode: 'online' };
  return { mode: 'demo' };
}

export class Transport {
  // id: identificador fixo deste aparelho (usado para ignorar o próprio eco e para a trava da sala)
  // opcoes.criarSeguranca: função assíncrona que devolve a SalaOnline deste
  //   aparelho. Só é chamada no modo online; os modos local e demonstração não
  //   dependem dela. O transporte não sabe montar identidade sozinho de
  //   propósito: assim os testes existentes continuam carregando este arquivo
  //   sem nenhuma dependência nova.
  constructor(room, onMessage, onStatus, id, opcoes = {}) {
    this.room = room;
    this.onMessage = onMessage;
    this.onStatus = onStatus || (() => {});
    this.id = id || Math.random().toString(36).slice(2, 10);
    this.connected = false;
    this.criarSeguranca = opcoes.criarSeguranca || null;
    this.aoRecusar = opcoes.aoRecusar || (() => {});
    this.seguranca = null;
    this.motivo = '';
    this.geracao = 0;
    this.fila = Promise.resolve();        // ordem na entrada
    this.filaEnvio = Promise.resolve();   // ordem na saída
  }

  async start() {
    const { mode, info } = await detectMode();
    this.mode = mode; this.info = info;
    if (mode === 'local') this.startLocal();
    else if (mode === 'online') this.startOnline();
    else this.startDemo();
    return mode;
  }

  status(s) { this.connected = s === 'on'; this.onStatus(s, this.mode, this.motivo); }

  receive(msg) { if (!msg || typeof msg !== 'object' || msg.from === this.id) return; this.onMessage(msg); }

  // No modo online nada é entregue sem conferir a assinatura. A verificação é
  // assíncrona (WebCrypto), então as mensagens passam por uma fila para chegar
  // na mesma ordem em que foram recebidas.
  receberAssinada(bruto) {
    const geracao = this.geracao;
    this.fila = this.fila.then(async () => {
      if (this.geracao !== geracao || !this.seguranca) return;
      if (!bruto || typeof bruto !== 'object' || bruto.from === this.id) return;
      let r;
      try { r = await this.seguranca.verificar(bruto); } catch (e) { r = { ok: false, motivo: 'falha ao verificar' }; }
      if (this.geracao !== geracao) return;
      if (!r.ok) { this.aoRecusar(r.motivo, bruto); return; }
      this.onMessage(bruto);
    }).catch(() => {});
  }

  // Envia na hora ou descarta. Nada fica guardado para depois:
  // um "Choque" tocado sem conexão nunca deve acontecer mais tarde.
  send(msg) {
    msg.from = this.id;
    msg.role = location.pathname.endsWith('controle.html')?'controller':'monitor';
    msg.sentAt = Date.now();
    if (!this.connected) return false;
    try {
      if (this.mode === 'local') {
        if (this.ws.readyState !== WebSocket.OPEN) return false;
        this.ws.send(JSON.stringify(msg));
      } else if (this.mode === 'online') {
        if (!this.rt || this.rt.readyState !== WebSocket.OPEN || !this.joined || !this.seguranca?.assinar) return false;
        // A assinatura é assíncrona, mas nada fica guardado: se a conexão cair
        // ou for substituída antes de assinar, a mensagem morre aqui. Um
        // "Choque" tocado sem conexão continua não acontecendo mais tarde.
        //
        // A fila mantém a ordem de envio. Sem ela, duas assinaturas disparadas
        // quase juntas poderiam terminar fora de ordem e um comando legítimo
        // chegaria com sequência menor que outro já visto — o CommandGate do
        // monitor o recusaria como "comando repetido".
        const geracao = this.geracao, ws = this.rt;
        this.filaEnvio = this.filaEnvio.then(async () => {
          if (this.geracao !== geracao || this.rt !== ws || ws.readyState !== WebSocket.OPEN || !this.joined) return;
          const assinado = await this.seguranca.assinar(msg);
          if (this.geracao !== geracao || this.rt !== ws || ws.readyState !== WebSocket.OPEN || !this.joined) return;
          this.rtPush('broadcast', { type: 'broadcast', event: 'm', payload: assinado });
        }).catch(() => {});
      } else this.bc.postMessage(msg);
      return true;
    } catch (e) { return false; }
  }

  startLocal() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const open = () => {
      this.status('connecting');
      const ws = new WebSocket(`${proto}://${location.host}/ws?sala=${encodeURIComponent(this.room)}`);
      this.ws = ws;
      ws.onopen = () => this.status('on');
      ws.onmessage = e => { try { this.receive(JSON.parse(e.data)); } catch (_) {} };
      ws.onclose = () => { this.status('off'); setTimeout(open, 1500); };
      ws.onerror = () => ws.close();
    };
    open();
  }

  // --- Supabase Realtime (Phoenix) ---
  rtPush(event, payload, topic = this.topic) {
    this.rt.send(JSON.stringify({ topic, event, payload, ref: String(++this.ref) }));
  }

  // Modo online: canal PRIVADO do Supabase Realtime.
  //
  // O tópico não é mais derivado do código de quatro dígitos: ele vem da sala
  // criada no banco, então não é adivinhável. As políticas de realtime.messages
  // só liberam leitura e envio para quem está autorizado naquela sala, e a
  // assinatura de cada mensagem prova quem a escreveu.
  async startOnline() {
    const geracao = ++this.geracao;
    this.joined = false;
    this.status('connecting');
    if (!this.criarSeguranca) {
      this.motivo = 'modo online indisponível nesta página';
      this.status('off');
      return;
    }
    try {
      if (!this.seguranca) this.seguranca = await this.criarSeguranca();
      if (this.geracao !== geracao) return;
      if (!this.seguranca.salaId) await this.seguranca.conectar();
    } catch (e) {
      if (this.geracao !== geracao) return;
      this.motivo = e?.message || 'não foi possível entrar na sala';
      this.status('off');
      this.reabrir(geracao, 5000);
      return;
    }
    if (this.geracao !== geracao) return;
    // Um controle pendente não entra no canal. As políticas recusariam de
    // qualquer forma; parar aqui deixa o motivo legível para o instrutor.
    if (!this.seguranca.pronto) {
      this.motivo = this.seguranca.situacao === 'revogado'
        ? 'acesso revogado pelo monitor'
        : 'aguardando autorização do monitor';
      this.status('off');
      this.reabrir(geracao, 2000);
      return;
    }
    this.motivo = '';
    return this.abrirCanal(geracao);
  }

  reabrir(geracao, ms) {
    setTimeout(() => { if (this.geracao === geracao) this.startOnline(); }, ms);
  }

  async abrirCanal(geracao) {
    const host = CONFIG.supabaseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    this.topic = 'realtime:' + this.seguranca.topico;
    let token;
    try { token = await this.seguranca.tokenAtual(); } catch (e) { token = null; }
    if (this.geracao !== geracao) return;
    if (!token) { this.motivo = 'sessão indisponível'; this.status('off'); this.reabrir(geracao, 5000); return; }

    this.joined = false; this.ref = 0;
    const ws = new WebSocket(`wss://${host}/realtime/v1/websocket?apikey=${encodeURIComponent(CONFIG.supabaseKey)}&vsn=1.0.0`);
    this.rt = ws;
    let hb = null, renova = null, joinRef = null;
    const fail = () => { try { ws.close(); } catch (_) {} };
    const joinTimer = setTimeout(fail, 10000);
    ws.onopen = () => {
      this.rtPush('phx_join', {
        config: { broadcast: { self: false, ack: false }, presence: { key: '' }, postgres_changes: [], private: true },
        access_token: token,
      });
      joinRef = String(this.ref);
      hb = setInterval(() => { if (ws.readyState === WebSocket.OPEN) this.rtPush('heartbeat', {}, 'phoenix'); }, 25000);
      // As permissões do Realtime ficam em cache da conexão e só são
      // recalculadas quando chega um token novo. Reenviar o token com folga
      // faz uma revogação valer sem depender da queda da conexão.
      renova = setInterval(async () => {
        if (ws.readyState !== WebSocket.OPEN || this.geracao !== geracao) return;
        try {
          const novo = await this.seguranca.tokenAtual();
          if (novo && ws.readyState === WebSocket.OPEN && this.geracao === geracao) {
            this.rtPush('access_token', { access_token: novo });
          }
        } catch (e) { /* a próxima tentativa resolve */ }
      }, 45000);
    };
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch (_) { return; }
      if (m.event === 'phx_reply' && m.ref === joinRef) {
        clearTimeout(joinTimer);
        if (m.payload?.status === 'ok') { this.motivo = ''; this.joined = true; this.status('on'); }
        else {
          // Recusa do canal = política negou. Quase sempre autorização retirada.
          this.motivo = 'a sala recusou este aparelho; confira a autorização no monitor';
          this.seguranca?.atualizarParticipantes?.(true)?.catch?.(() => {});
          fail();
        }
      } else if (m.event === 'broadcast' && m.topic === this.topic) {
        this.receberAssinada(m.payload?.payload);
      } else if ((m.event === 'phx_error' || m.event === 'phx_close') && m.topic === this.topic) {
        fail();
      }
    };
    ws.onclose = () => {
      clearInterval(hb); clearInterval(renova); clearTimeout(joinTimer);
      if (this.rt !== ws || this.geracao !== geracao) return;
      this.joined = false; this.status('off');
      // Volta pelo começo: a situação do aparelho pode ter mudado enquanto isso.
      this.reabrir(geracao, 2000);
    };
    ws.onerror = () => fail();
  }

  async encerrar() {
    this.geracao++;
    try { this.rt?.close(); } catch (e) {}
    try { await this.seguranca?.encerrar(); } catch (e) {}
    this.seguranca?.pararTarefas?.();
  }

  startDemo() {
    this.bc = new BroadcastChannel('bmsim-' + this.room);
    this.bc.onmessage = e => this.receive(e.data);
    setTimeout(() => this.status('on'), 50);
  }
}
