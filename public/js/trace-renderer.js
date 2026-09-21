import { clamp } from './simulation-state.js';

// Varredura, limpeza do canvas e marcadores SINC; não gera o sinal.
export class Trace {
  constructor(canvas, color, secs, sr, fn, range, browser = globalThis) {
    Object.assign(this, { canvas, color, secs, sr, fn, range, browser });
    this.ctx = canvas.getContext('2d');
    this.resize(); this.lastT = null; this.lastX = null; this.lastY = null; this.wrapped = false;
    new browser.ResizeObserver(() => this.resize()).observe(canvas);
  }
  resize() {
    const r = this.canvas.getBoundingClientRect(), dpr = Math.min(2, this.browser.devicePixelRatio || 1);
    this.canvas.width = Math.max(10, r.width * dpr); this.canvas.height = Math.max(10, r.height * dpr);
    this.dpr = dpr; this.lastX = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  x(t) { const w = this.canvas.width; return ((t / this.secs) % 1) * w; }
  y(v) { const [a, b] = typeof this.range === 'function' ? this.range() : this.range; const h = this.canvas.height, pad = h * 0.1; return clamp(h - pad - (v - a) / (b - a) * (h - 2 * pad), 1, h - 1); }
  draw(t, hidden) {
    const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
    if (this.lastT === null) this.lastT = t;
    const gap = 14 * this.dpr;
    ctx.lineWidth = 2.2 * this.dpr; ctx.strokeStyle = this.color; ctx.lineJoin = 'round';
    const dt = 1 / this.sr;
    let tt = this.lastT;
    if (t - tt > 1) tt = t - 1;
    ctx.beginPath();
    let started = false;
    while (tt < t) {
      tt += dt;
      const x = this.x(tt), v = hidden ? null : this.fn(tt);
      const y = v === null ? null : this.y(v);
      // apaga faixa à frente
      const xe = x + gap;
      ctx.clearRect(x, 0, Math.min(gap, w - x), h); if (xe > w) ctx.clearRect(0, 0, xe - w, h);
      if (y !== null && this.lastX !== null && this.lastY !== null && x >= this.lastX) {
        if (!started) { ctx.moveTo(this.lastX, this.lastY); started = true; }
        ctx.lineTo(x, y);
      } else if (y !== null) { ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y); started = true; }
      if (this.lastX !== null && x < this.lastX) this.wrapped = true;
      this.lastX = x; this.lastY = y;
    }
    ctx.stroke();
    this.lastT = t;
  }
  mark(t) { // marcador de sincronismo
    const ctx = this.ctx, x = this.x(t), s = 7 * this.dpr;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x - s, s); ctx.lineTo(x + s, s); ctx.lineTo(x, s * 2.4); ctx.fill();
  }
}

