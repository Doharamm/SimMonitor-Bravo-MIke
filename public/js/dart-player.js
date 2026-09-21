import { DART } from './dart-data.js';
import { shape } from './ecg-shapes.js';

export { DART };
export function sampleReference(profile, position, join = true) {
  const a=profile.values, length=a.length-1;
  let x=((position%length)+length)%length;
  const i=Math.floor(x), f=x-i;
  let value=a[i]+(a[i+1]-a[i])*f;
  // Só a emenda de até 6 pixels é ajustada para não criar um salto no loop.
  if(join && x>length-6) { const u=(x-length+6)/6; value+=(a[0]-a.at(-1))*u*u*(3-2*u); }
  return value;
}

export class DartPlayer {
  constructor(id, start, hr) {
    this.id=id;this.profile=DART[id];this.start=start;this.time=start;this.position=0;
    this.rate=this.pixelsPerSecond(hr);this.segments=[{t:start,p:0,rate:this.rate}];
  }
  pixelsPerSecond(hr) {
    const p=this.profile,L=p.values.length-1;
    if(!p.events.length) return L/p.duration;
    return Math.max(0,hr)*L/(60*p.events.length);
  }
  advance(now, hr) {
    const nextRate=this.pixelsPerSecond(hr), events=[];
    if(now<this.start) {this.rate=nextRate;this.segments[0].rate=nextRate;return events;}
    const from=this.position, to=from+Math.max(0,now-this.time)*this.rate, L=this.profile.values.length-1;
    if(this.rate>0 && this.profile.events.length) {
      // Depois de suspensão, não toca em rajada todos os bipes atrasados.
      const low=Math.max(from,to-this.rate*1.2);
      const first=Math.floor(low/L),last=Math.floor(to/L);
      for(let cycle=first;cycle<=last;cycle++) for(const mark of this.profile.events) {
        const at=cycle*L+mark;
        if(at>low && at<=to) events.push(this.time+(at-from)/this.rate);
      }
    }
    this.position=to;this.time=Math.max(now,this.time);
    if(nextRate!==this.rate) {
      this.rate=nextRate;this.segments.push({t:this.time,p:to,rate:nextRate});
    }
    while(this.segments.length>2 && this.segments[1].t<now-3) this.segments.shift();
    return events;
  }
  sample(t) {
    if(t<this.start)return 0;
    let lo=0,hi=this.segments.length;
    while(lo+1<hi){const m=(lo+hi)>>1;if(this.segments[m].t<=t)lo=m;else hi=m;}
    const s=this.segments[lo];return sampleReference(this.profile,s.p+(t-s.t)*s.rate);
  }
}

function component(id, first, last, anchor, pixelsPerSecond) {
  const a=DART[id].fullValues, initial=a[first], final=a[last];
  const points=[];
  for(let x=first;x<=last;x++) {
    const u=(x-first)/(last-first);
    points.push([(x-anchor)/pixelsPerSecond+.02,a[x]-(initial+(final-initial)*u)]);
  }
  return shape(points,.02);
}
// Para BAVT: P e QRS seguem relógios independentes; não repetir uma tira fixa
// que reiniciaria a relação AV a cada ciclo. Bigeminismo mantém a alternância.
export const DART_ATRIAL=component('nsr',220,268,246,309);
export const DART_BAV_ATRIAL=component('bav3',258,306,282,301);
export const DART_NORMAL=component('nsr',278,414,295,309);
export const DART_ESCAPE=component('bav3',558,710,584,292);
export const DART_PVC=component('bige',468,640,489,232);
