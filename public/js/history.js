export class EventHistory {
  constructor(now=()=>Date.now(),limit=100) { this.limit=limit;this.now=now;this.events=[];this.next=0; }
  add(text, key='',context={}) {
    const at=this.now(), last=this.events.at(-1);
    // Ajustes repetidos do mesmo controle em sequência viram um único evento com o valor final.
    if (key && last && last.key===key && at-last.at<3000) { last.text=String(text).slice(0,240); last.at=at;Object.assign(last,context); return; }
    this.events.push({id:++this.next,at,text:String(text).slice(0,240),key,...context}); if(this.events.length>this.limit)this.events.shift();
  }
  snapshot() { const list=[];let bytes=0;for(const {key,...e} of this.events.slice(-100).reverse()){bytes+=new TextEncoder().encode(JSON.stringify(e)).length;if(bytes>16000)break;list.unshift({...e});}return list; }
  // Recarregar o monitor não deve apagar o histórico da aula.
  restore(list) {
    if (!Array.isArray(list)) return;
    const now=this.now();
    this.events=list
      .filter(e=>e&&Number.isFinite(e.at)&&e.at>0&&e.at<=now+60000&&typeof e.text==='string')
      .slice(-this.limit)
      .map(e=>({id:0,at:e.at,text:e.text.slice(0,240),key:'',...(Number.isFinite(e.elapsedMs)?{elapsedMs:Math.max(0,e.elapsedMs)}:{}),actor:['aluno','instrutor','sistema'].includes(e.actor)?e.actor:'sistema',origin:e.origin==='informado'?'informado':'detectado',caseName:String(e.caseName||'Livre').slice(0,100),caseRun:String(e.caseRun||'').slice(0,80)}))
      .sort((a,b)=>a.at-b.at);
    this.next=0;
    for(const e of this.events) e.id=++this.next;
  }
}
export function historyLine(e){const secs=Math.floor((e.elapsedMs||0)/1000);return '['+String(Math.floor(secs/60)).padStart(2,'0')+':'+String(secs%60).padStart(2,'0')+'] '+(e.caseName||'Livre')+(e.caseRun?' #'+e.caseRun.slice(-6):'')+' • '+(e.actor||'sistema')+' • '+(e.origin||'detectado')+' — '+e.text;}
export function historyText(events){return 'BRAVO MIKE — Debrief da simulação\nAté 5000 eventos locais. Horários relativos ao caso, sem tempo pausado. Relatos manuais não comprovam execução.\n\n'+events.map(e=>new Date(e.at).toLocaleString('pt-BR')+' '+historyLine(e)).join('\n');}
