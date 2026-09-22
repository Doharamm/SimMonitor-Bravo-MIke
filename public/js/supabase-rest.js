// Acesso ao Supabase sem biblioteca externa: sessão anônima, REST e RPC.
//
// A sessão é guardada e reaproveitada de propósito. O Supabase limita criação
// de usuário anônimo a 30 por hora por IP; numa sala de aula todos os alunos
// saem do mesmo Wi-Fi, então cada aparelho precisa assinar uma vez só e
// continuar renovando o mesmo usuário nas aulas seguintes.
//
// A chave publicável (config.js) identifica o projeto, não o instrutor. Quem
// autoriza é o token do usuário mais as políticas do banco.

const MARGEM_MS = 60000; // renova antes de vencer, nunca em cima da hora

export class SupabaseSessao {
  // `armazenamento` precisa de getItem/setItem/removeItem; em teste pode ser um Map adaptado.
  constructor({ url, chave, armazenamento, fetchImpl, chaveArmazenamento = 'bmsim-sessao', agora = () => Date.now() }) {
    this.url = String(url || '').replace(/\/$/, '');
    this.chave = chave;
    this.fetch = fetchImpl || ((...a) => globalThis.fetch(...a));
    this.agora = agora;
    this.nomeChave = chaveArmazenamento;
    this.armazenamento = armazenamento || memoria();
    this.sessao = null;
    this.emAndamento = null;
  }

  ler() {
    try { return JSON.parse(this.armazenamento.getItem(this.nomeChave) || 'null'); } catch (e) { return null; }
  }
  gravar(s) {
    this.sessao = s;
    try {
      if (s) this.armazenamento.setItem(this.nomeChave, JSON.stringify(s));
      else this.armazenamento.removeItem(this.nomeChave);
    } catch (e) { /* aba anônima: a sessão vive só em memória */ }
  }

  cabecalhos(extra = {}) {
    const h = { apikey: this.chave, 'Content-Type': 'application/json', ...extra };
    if (this.sessao?.access_token) h.Authorization = 'Bearer ' + this.sessao.access_token;
    return h;
  }

  guardarResposta(dados) {
    if (!dados?.access_token) throw new Error('resposta de sessão sem token');
    const s = {
      access_token: dados.access_token,
      refresh_token: dados.refresh_token,
      user_id: dados.user?.id || this.sessao?.user_id || null,
      expira_em: this.agora() + Math.max(0, (dados.expires_in || 3600) * 1000),
    };
    this.gravar(s);
    return s;
  }

  async entrarAnonimo() {
    const r = await this.fetch(`${this.url}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: this.chave, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: {}, gotrue_meta_security: {} }),
    });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok || !corpo.access_token) {
      const erro = new Error(corpo.msg || corpo.error_description || corpo.error || 'login anônimo indisponível');
      erro.status = r.status;
      erro.anonimoDesligado = r.status === 422 || /anonymous/i.test(String(corpo.msg || corpo.error_description || ''));
      throw erro;
    }
    return this.guardarResposta(corpo);
  }

  async renovar() {
    const atual = this.sessao || this.ler();
    if (!atual?.refresh_token) return this.entrarAnonimo();
    const r = await this.fetch(`${this.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: this.chave, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: atual.refresh_token }),
    });
    const corpo = await r.json().catch(() => ({}));
    // Token de renovação queimado ou usuário apagado: recomeça do zero.
    if (!r.ok || !corpo.access_token) { this.gravar(null); return this.entrarAnonimo(); }
    return this.guardarResposta(corpo);
  }

  // Sempre devolve uma sessão válida. Chamadas simultâneas compartilham a mesma promessa.
  async garantir(forcar = false) {
    if (this.emAndamento) return this.emAndamento;
    if (!this.sessao) this.sessao = this.ler();
    const viva = this.sessao?.access_token && this.sessao.expira_em - MARGEM_MS > this.agora();
    if (viva && !forcar) return this.sessao;
    this.emAndamento = (this.sessao?.refresh_token ? this.renovar() : this.entrarAnonimo())
      .finally(() => { this.emAndamento = null; });
    return this.emAndamento;
  }

  get token() { return this.sessao?.access_token || null; }
  get usuario() { return this.sessao?.user_id || null; }

  // `jaRenovou` corta o 401 em uma única segunda tentativa. Sem esse limite, um
  // 401 permanente (usuário anônimo apagado, chave rotacionada) vira laço
  // infinito: cada volta cria outro usuário anônimo e esgota a cota de 30 por
  // hora por IP, trancando a turma inteira que estiver no mesmo Wi-Fi.
  async rpc(nome, args, jaRenovou = false) {
    await this.garantir();
    const r = await this.fetch(`${this.url}/rest/v1/rpc/${nome}`, {
      method: 'POST', headers: this.cabecalhos(), body: JSON.stringify(args || {}),
    });
    if (r.status === 401 && !jaRenovou) { await this.garantir(true); return this.rpc(nome, args, true); }
    const corpo = await r.json().catch(() => null);
    if (!r.ok) {
      const erro = new Error(corpo?.message || corpo?.hint || `rpc ${nome} falhou (${r.status})`);
      erro.status = r.status; erro.detalhe = corpo;
      throw erro;
    }
    return corpo;
  }

  async selecionar(caminho, jaRenovou = false) {
    await this.garantir();
    const r = await this.fetch(`${this.url}/rest/v1/${caminho}`, { headers: this.cabecalhos() });
    if (r.status === 401 && !jaRenovou) { await this.garantir(true); return this.selecionar(caminho, true); }
    const corpo = await r.json().catch(() => null);
    if (!r.ok) {
      const erro = new Error(corpo?.message || `consulta falhou (${r.status})`);
      erro.status = r.status; erro.detalhe = corpo;
      throw erro;
    }
    return corpo;
  }
}

function memoria() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
  };
}

export const armazenamentoDeMemoria = memoria;
