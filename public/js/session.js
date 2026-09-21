// Leases use the monitor's monotonic clock; device wall clocks are irrelevant.
// A lease is valid for LEASE_MS after the state that carried it was published.
// The controller only sends while its last state is younger than STATE_MAX_AGE_MS,
// which leaves at least 1.5 s for the command to travel.
export const LEASE_MS = 4500;
export const STATE_MAX_AGE_MS = 3000;

// Motivos legíveis para recusas (mostrados ao instrutor).
export const REFUSAL_TEXT = {
  hidden: 'o monitor está em segundo plano ou com a tela bloqueada',
  session: 'o caso foi trocado ou o monitor reiniciado',
  lease: 'o comando chegou atrasado',
  replay: 'comando repetido',
  invalid: 'comando inválido',
  busy: 'muitos controles conectados',
};

export class CommandGate {
  constructor(now = () => performance.now(), token = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2,'0')).join('')) {
    this.now = now; this.token = token; this.session = token(); this.leases = new Map(); this.seen = new Map(); this.reason = '';
  }
  issue() {
    const now = this.now();
    for (const [k,v] of this.leases) if (v < now) this.leases.delete(k);
    const lease = this.token(); this.leases.set(lease, now + LEASE_MS);
    return { session: this.session, lease };
  }
  // Retorna true/false (compatível) e guarda o motivo da recusa em this.reason.
  accept(msg) {
    const now = this.now(); this.reason = '';
    if (msg.session !== this.session) { this.reason = 'session'; return false; }
    if (!this.leases.has(msg.lease) || this.leases.get(msg.lease) < now) { this.reason = 'lease'; return false; }
    if (typeof msg.from !== 'string' || !Number.isSafeInteger(msg.seq) || msg.seq < 1) { this.reason = 'invalid'; return false; }
    for (const [k,v] of this.seen) if (v.until < now) this.seen.delete(k);
    const prev = this.seen.get(msg.from);
    if (prev && msg.seq <= prev.seq) { this.reason = 'replay'; return false; }
    if (!prev && this.seen.size >= 100) { this.reason = 'busy'; return false; }
    this.seen.set(msg.from, {seq:msg.seq,until:now+10000}); return true;
  }
  invalidate() { this.leases.clear(); }
  rotate() { this.session = this.token(); this.leases.clear(); this.seen.clear(); }
}
export function remoteTimerSeconds(timer, receivedAt, now = performance.now()) {
  return Math.floor(Math.max(0, timer.elapsedMs + (timer.running ? now - receivedAt : 0)) / 1000);
}

// Presença dos monitores numa sala, vista pelo controle. Não é autenticação.
// Cada monitor tem um id estável na aba (sobrevive à recarga) e um "boot" novo a cada abertura.
// - Mesmo id com boot novo = recarga: substitui na hora, sem aviso de conflito.
// - Se o boot antigo voltar a publicar depois disso, as duas abas estão vivas (ex.: aba duplicada) = conflito.
// - Ids diferentes publicando dentro de 5 s = conflito.
// - Mensagem "bye" (fechamento/recarga) remove o monitor na hora.
export class MonitorPresence {
  constructor(now=()=>performance.now()) {this.now=now;this.peers=new Map();this.retired=new Map();}
  observe(id, boot='') {
    const now=this.now();
    for(const [key,p] of this.peers) if(now-p.at>=5000)this.peers.delete(key);
    for(const [key,at] of this.retired) if(now-at>=5000)this.retired.delete(key);
    if(typeof id!=='string'||id.length>128||typeof boot!=='string'||boot.length>128)return false;
    const key=id+'/'+boot;
    if(!this.peers.has(key)){
      if(this.retired.has(key)){ this.retired.delete(key); }
      else for(const [k,p] of this.peers) if(p.id===id){ this.peers.delete(k); this.retired.set(k,now); }
      if(this.peers.size>=10)return false;
    }
    this.peers.set(key,{id,at:now});return this.peers.size===1;
  }
  forget(id, boot='') { const key=id+'/'+boot; this.peers.delete(key); this.retired.delete(key); }
  clear(){this.peers.clear();this.retired.clear();}
}
