// Textos compartilhados de comandos e histórico. Não decide nem executa ações.
import { RHYTHM_BY_ID } from './rhythm-catalog.js';
import { SCENARIO_BY_ID } from './scenario-catalog.js';
import { VITAL_DEFS } from './simulation-config.js';

const CH_NAMES = { ecg: 'ECG', spo2: 'SpO₂', nibp: 'PNI', capno: 'EtCO₂', resp: 'Resp', temp: 'Temp' };
const onOff = v => (v ? 'ligado' : 'desligado');
export function fmtDur(sec) { return sec >= 60 ? `${Math.round(sec / 60)} min` : `${sec} s`; }
export function fmtVital(k, v) { return k === 'temp' ? Number(v).toFixed(1).replace('.', ',') : Math.round(v); }

export function describeSet(d, dur = 0) {
  const parts = [];
  if (!d || typeof d !== 'object') return 'Ajuste';
  if (d.rhythm && RHYTHM_BY_ID[d.rhythm]) parts.push('Ritmo: ' + RHYTHM_BY_ID[d.rhythm].nome);
  if (d.vit) {
    const v = Object.entries(d.vit).filter(([k]) => VITAL_DEFS[k]);
    const sd = v.find(([k]) => k === 'sys'), dd = v.find(([k]) => k === 'dia');
    const txt = v.filter(([k]) => !(sd && dd && (k === 'sys' || k === 'dia'))).map(([k, x]) => `${VITAL_DEFS[k].nome} ${fmtVital(k, x)}`);
    if (sd && dd) txt.push(`PA ${Math.round(sd[1])}/${Math.round(dd[1])}`);
    if (txt.length) parts.push(txt.join(', ') + (dur ? ` (transição de ${fmtDur(dur)})` : ''));
  }
  if ('pulse' in d && !(d.pulse === 'auto' && d.rhythm)) parts.push('Pulso: ' + ({ auto: 'conforme o ritmo', on: 'presente', off: 'ausente' }[d.pulse] || d.pulse));
  if ('vfAmp' in d) parts.push('FV ' + d.vfAmp);
  if ('capno' in d) parts.push('Capnografia: ' + ({ normal: 'normal', bronco: 'broncoespasmo', rcp: 'RCP', none: 'sem curva' }[d.capno] || d.capno));
  if ('spo2Signal' in d) parts.push('Oxímetro: '+({normal:'normal',low:'hipoperfusão',absent:'ausente'}[d.spo2Signal]));
  if ('cpr' in d) parts.push(d.cpr ? 'RCP iniciada' : 'RCP parada');
  if ('shockTo' in d) parts.push('Após o choque: ' + (d.shockTo && RHYTHM_BY_ID[d.shockTo] ? RHYTHM_BY_ID[d.shockTo].nome : 'não mudar'));
  if ('studentPanel' in d) parts.push('Botões dos alunos ' + (d.studentPanel ? 'visíveis' : 'ocultos'));
  if (d.pacer) {
    if ('on' in d.pacer) parts.push('Marcapasso ' + onOff(d.pacer.on));
    if ('rate' in d.pacer) parts.push(`Marcapasso ${d.pacer.rate} ppm`);
    if ('ma' in d.pacer) parts.push(`Marcapasso ${d.pacer.ma} mA`);
    if ('threshold' in d.pacer) parts.push(`Limiar de captura ${d.pacer.threshold} mA`);
  }
  if (d.defib) {
    if ('energy' in d.defib) parts.push(`Energia ${d.defib.energy} J`);
    if ('sync' in d.defib) parts.push('SINC ' + onOff(d.defib.sync));
  }
  if (d.alarms) {
    if ('enabled' in d.alarms) parts.push('Alarmes ' + (d.alarms.enabled ? 'ativados' : 'desativados'));
    if ('beep' in d.alarms) parts.push('Bipe do QRS ' + onOff(d.alarms.beep));
  }
  if (d.show) for (const [k, v] of Object.entries(d.show)) if (CH_NAMES[k]) parts.push(`${CH_NAMES[k]} ${v ? 'visível' : 'oculto'} no monitor`);
  if (d.nibp && 'interval' in d.nibp) parts.push(d.nibp.interval ? `PNI automática a cada ${d.nibp.interval} min` : 'PNI manual');
  return parts.join(' · ') || 'Ajuste';
}
// Chave para agrupar ajustes repetidos do mesmo controle no histórico (ex.: vários toques em + mA).
export function setMergeKey(d) {
  if (!d || typeof d !== 'object') return '';
  return Object.keys(d).filter(k => k !== 'typicalHr').sort().map(k => (d[k] && typeof d[k] === 'object' ? k + ':' + Object.keys(d[k]).sort().join(',') : k)).join('|');
}
export function describeAction(name, arg) {
  switch (name) {
    case 'pause-simulation': return 'Pausar/retomar simulação';
    case 'timed-advance': return 'Avanço por tempo';
    case 'stage-wait': return 'Tempo da etapa';
    case 'advance-mode': return 'Modo de avanço';
    case 'assessment': return 'Modo de ensino';
    case 'annotation': return 'Registro informado';
    case 'custom-load': return 'Iniciar cenário personalizado';
    case 'debrief': return 'Exportar debrief';
    case 'audio-test': return 'Teste de som';
    case 'charge': return 'Carregar desfibrilador';
    case 'shock': return 'Choque';
    case 'disarm': return 'Desarmar desfibrilador';
    case 'nibp': return 'Medir PNI';
    case 'silence': return 'Silenciar alarmes';
    case 'timer': return { start: 'Iniciar cronômetro', pause: 'Pausar cronômetro', toggle: 'Cronômetro', reset: 'Zerar cronômetro' }[arg] || 'Cronômetro';
    case 'scn-load': return 'Iniciar cenário' + (SCENARIO_BY_ID[arg] ? ': ' + SCENARIO_BY_ID[arg].titulo : '');
    case 'scn-go': return Number.isInteger(arg) ? `Ir para a etapa ${arg + 1}` : 'Ir para etapa';
    case 'scn-next': return 'Próxima etapa';
    case 'scn-prev': return 'Etapa anterior';
    case 'scn-stop': return 'Encerrar cenário';
    case 'reset': return 'Reiniciar monitor';
    case 'exam': return arg ? 'Mostrar exame' : 'Ocultar exame';
    default: return 'Comando';
  }
}

