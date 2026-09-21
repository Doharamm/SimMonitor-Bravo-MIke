import {validateScenario} from './classroom.js';
import { RHYTHM_BY_ID } from './rhythm-catalog.js';
import { VITAL_DEFS, ENERGIES, PACER_LIMITS, NIBP_INTERVALS } from './simulation-config.js';
import { SCENARIO_BY_ID } from './scenario-catalog.js';
import { EXAM_BY_ID } from './exams.js';
const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = v => typeof v === 'number' && Number.isFinite(v);
const bool = v => typeof v === 'boolean';
const own = (o,k) => typeof k === 'string' && Object.hasOwn(o,k);
const bounded = (v,a,b) => finite(v) && v >= a && v <= b;
const token = v => typeof v === 'string' && v.length > 0 && v.length <= 128;
export function validPublicState(s) {
  if (!obj(s) || s.protocol !== 2 || !token(s.session) || !token(s.lease) || !own(RHYTHM_BY_ID,s.rhythm)) return false;
  if (!['normal','low','absent'].includes(s.spo2Signal) || !bool(s.audioMuted)) return false;
  for (const key of ['vit','cur']) {
    if (!obj(s[key])) return false;
    for (const [name,def] of Object.entries(VITAL_DEFS)) if (!bounded(s[key][name],def.min,def.max)) return false;
  }
  if (!obj(s.timer) || !bool(s.timer.running) || !bounded(s.timer.elapsedMs,0,Number.MAX_SAFE_INTEGER)) return false;
  if (!obj(s.nibp) || !bool(s.nibp.measuring) || !NIBP_INTERVALS.includes(s.nibp.interval)) return false;
  for (const k of ['sys','dia','map']) if (s.nibp[k] !== null && !bounded(s.nibp[k],0,400)) return false;
  if (!obj(s.defib) || !ENERGIES.includes(s.defib.energy) || !bool(s.defib.sync) || !['idle','charging','ready','sync'].includes(s.defib.status) || !Number.isSafeInteger(s.defib.shocks) || s.defib.shocks < 0) return false;
  if (!obj(s.pacer) || !bool(s.pacer.on) || !bounded(s.pacer.rate,...PACER_LIMITS.rate) || !bounded(s.pacer.ma,...PACER_LIMITS.ma) || !bounded(s.pacer.threshold,...PACER_LIMITS.threshold)) return false;
  if (!obj(s.alarms) || !bool(s.alarms.enabled) || !bool(s.alarms.beep)) return false;
  if (!obj(s.show) || !['ecg','spo2','nibp','capno','resp','temp'].every(k=>bool(s.show[k]))) return false;
  if (!['auto','on','off'].includes(s.pulse) || !['grossa','fina'].includes(s.vfAmp) || !['normal','bronco','rcp','none'].includes(s.capno)) return false;
  if (![s.hidden,s.studentPanel,s.cpr,s.captured].every(bool)) return false;
  if (s.exam !== null && !own(EXAM_BY_ID,s.exam)) return false;
  if (!obj(s.scn) || !Number.isInteger(s.scn.step)) return false;
  const custom=validateScenario(s.customScenario);
  const scenario=custom?.id===s.scn.id?custom:(own(SCENARIO_BY_ID,s.scn.id)?SCENARIO_BY_ID[s.scn.id]:null);
  if (s.scn.id !== null && (!scenario || s.scn.step < 0 || s.scn.step >= scenario.etapas.length)) return false;
  if (s.shockTo !== null && !own(RHYTHM_BY_ID,s.shockTo)) return false;
  if (!obj(s.displayed) || !Object.values(s.displayed).every(v=>v === null || finite(v))) return false;
  if (!Array.isArray(s.alarmsNow) || s.alarmsNow.length > 30 || !s.alarmsNow.every(a=>obj(a) && ['high','med'].includes(a.level) && typeof a.txt === 'string' && a.txt.length < 250)) return false;
  if (!Array.isArray(s.history) || s.history.length > 100 || !s.history.every(e=>obj(e) && Number.isSafeInteger(e.id) && finite(e.at) && typeof e.text === 'string' && e.text.length <= 240)) return false;
  if(s.version!==undefined){
    if(typeof s.version!=='string'||s.version.length>80||!Array.isArray(s.authorized)||s.authorized.length>16||!s.authorized.every(token))return false;
    if(![s.paused,s.automatic,s.assessment,s.peerRecent].every(bool))return false;
  }
  if(s.timedAdvance!==undefined&&(!bool(s.timedAdvance)||!bounded(s.stageWait,0,600)||!bounded(s.stageRemaining,0,600)))return false;
  return true;
}
