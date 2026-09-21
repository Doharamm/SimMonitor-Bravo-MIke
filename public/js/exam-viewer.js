export class ExamViewer {
  constructor(root) {
    this.root = root; this.document = root.ownerDocument; this.img = root.querySelector('img'); this.status = root.querySelector('[data-exam-status]');
    this.close = root.querySelector('[data-exam-close]'); this.zoom = 1; this.current = null; this.version = 0;
    root.querySelector('[data-zoom-in]').addEventListener('click',()=>this.setZoom(this.zoom+.5));
    root.querySelector('[data-zoom-out]').addEventListener('click',()=>this.setZoom(this.zoom-.5));
    root.querySelector('[data-zoom-fit]').addEventListener('click',()=>this.setZoom(1));
    root.querySelector('[data-exam-retry]').addEventListener('click',()=>this.show(this.current, true));
    root.addEventListener('keydown',e=>{
      if (e.key === 'Escape') { e.preventDefault(); this.close.click(); }
      if (e.key === 'Tab') {
        const controls = [...root.querySelectorAll('button')].filter(b=>!b.hidden && !b.disabled);
        const first=controls[0],last=controls.at(-1);
        if (e.shiftKey && this.document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && this.document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }
  setZoom(n) {
    this.zoom = Math.max(1,Math.min(4,n)); this.root.querySelector('[data-zoom-label]').textContent = Math.round(this.zoom*100)+'%';
    this.img.style.width = this.zoom === 1 ? '' : (this.img.naturalWidth*this.zoom)+'px';
    this.img.style.maxWidth = this.zoom === 1 ? '100%' : 'none'; this.img.style.maxHeight = this.zoom === 1 ? '100%' : 'none';
    this.root.querySelector('[data-zoom-out]').disabled = this.zoom === 1;
    this.root.querySelector('[data-zoom-in]').disabled = this.zoom === 4;
  }
  show(exam, retry=false) {
    if (!retry && this.current?.id === exam?.id) return;
    const wasOpen = !!this.current; this.current=exam; this.version++; const version=this.version;
    this.root.hidden = !exam;
    const background=this.document.getElementById('app');
    if (background) background.inert=!!exam;
    if (!exam) { this.img.removeAttribute('src'); this.img.hidden=true; if(wasOpen)this.previousFocus?.focus(); return; }
    if (!wasOpen) this.previousFocus=this.document.activeElement;
    this.root.querySelector('h2').textContent = exam.kind === 'ecg' ? 'ECG de 12 derivações' : 'Radiografia';
    this.status.textContent='Carregando exame…';this.img.hidden=true;
    this.root.querySelector('[data-exam-retry]').hidden=true;
    this.img.onload=()=>{if(version!==this.version)return;this.img.hidden=false;this.setZoom(1);this.status.textContent='Exame carregado. Amplie para inspecionar os detalhes.';};
    this.img.onerror=()=>{if(version!==this.version)return;this.status.textContent='Não foi possível carregar o exame.';this.root.querySelector('[data-exam-retry]').hidden=false;};
    this.img.src=exam.src;this.close.focus();
  }
}
