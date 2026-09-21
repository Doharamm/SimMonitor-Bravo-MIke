// One monotonic timeline for waves, transitions and therapy timers.
export class SimulationClock {
  constructor(now=()=>performance.now(), schedule=(f,n)=>setTimeout(f,n), cancel=id=>clearTimeout(id)) {
    Object.assign(this,{raw:now,schedule,cancel,offset:0,paused:false,stopped:0,next:0,jobs:new Map()});
  }
  now(){return (this.paused?this.stopped:this.raw())-this.offset;}
  later(fn,ms,repeat=false){
    const id=++this.next, job={fn,ms,repeat,due:this.now()+ms,handle:null};this.jobs.set(id,job);this.arm(id,job);return id;
  }
  arm(id,j){if(this.paused)return;j.handle=this.schedule(()=>{if(!this.jobs.has(id)||this.paused)return;if(!j.repeat)this.jobs.delete(id);else j.due=this.now()+j.ms;j.fn();if(j.repeat&&this.jobs.has(id))this.arm(id,j);},Math.max(0,j.due-this.now()));}
  clear(id){const j=this.jobs.get(id);if(j)this.cancel(j.handle);this.jobs.delete(id);}
  pause(){if(this.paused)return;this.stopped=this.raw();this.paused=true;for(const j of this.jobs.values())this.cancel(j.handle);}
  resume(){if(!this.paused)return;this.offset+=this.raw()-this.stopped;this.paused=false;for(const [id,j] of this.jobs)this.arm(id,j);}
}
