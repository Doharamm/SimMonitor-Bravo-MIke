import { hasPulse } from './simulation-state.js';

// Números e alarmes calculados. Os limites foram preservados da versão 2.3.2.
export function evaluateReadings(S, eng, {t, epochNow, bootT, acquisitionUntil}) {
  const pulse = hasPulse(S);
  const hr = eng.measuredHr(t);
  const spo2 = S.spo2Signal==='normal' && pulse && S.cur.spo2 > 0 && !S.cpr ? Math.round(S.cur.spo2) : null;
  const etco2 = S.capno === 'none' || S.cur.rr <= 0 ? null : Math.round(S.cur.etco2);
  const rr = Math.round(S.cur.rr);
  const displayed = { hr, spo2, etco2, rr, temp: S.cur.temp };

  const A = [];
  if (S.alarms.enabled) {
    const r = S.rhythm, cap = eng.captured();
    if (r === 'vf' && S.show.ecg) A.push(['high', 'Fibrilação ventricular', 'ecg']);
    else if (r === 'tdp' && S.show.ecg) A.push(['high', 'TV polimórfica', 'ecg']);
    else if (r === 'vt' && S.show.ecg) A.push(['high', 'Taquicardia ventricular', 'ecg']);
    else if ((r === 'asys' || (hr === null && t >= acquisitionUntil)) && S.show.ecg && !cap && !S.cpr) A.push(['high', 'Assistolia', 'ecg']);
    else if (hr !== null && S.show.ecg) {
      if (hr < 40) A.push(['high', `FC muito baixa ${hr}`, 'ecg']); else if (hr < 50) A.push(['med', `FC baixa ${hr}`, 'ecg']);
      else if (hr > 150) A.push(['high', `FC muito alta ${hr}`, 'ecg']); else if (hr > 120) A.push(['med', `FC alta ${hr}`, 'ecg']);
    }
    if (S.show.spo2) {
      if (spo2 === null) A.push(['med', S.spo2Signal==='absent'?'SpO₂: sensor desconectado':S.spo2Signal==='low'?'SpO₂: baixa perfusão':'SpO₂: sem sinal', 'spo2']);
      else if (spo2 < 85) A.push(['high', `SpO₂ baixa ${spo2}`, 'spo2']); else if (spo2 < 90) A.push(['med', `SpO₂ baixa ${spo2}`, 'spo2']);
    }
    if (S.show.nibp && S.nibp.sys !== null && epochNow - S.nibp.at < 15 * 60000) {
      if (S.nibp.sys < 80) A.push(['high', `PAS baixa ${S.nibp.sys}`, 'nibp']); else if (S.nibp.sys < 90) A.push(['med', `PAS baixa ${S.nibp.sys}`, 'nibp']);
      else if (S.nibp.sys > 180) A.push(['med', `PAS alta ${S.nibp.sys}`, 'nibp']);
    }
    if (S.show.resp) { if (rr === 0 && !S.cpr) A.push(['high', 'Apneia', 'resp']); else if (rr > 0 && rr < 8) A.push(['med', `FR baixa ${rr}`, 'resp']); else if (rr > 30) A.push(['med', `FR alta ${rr}`, 'resp']); }
    if (S.show.capno && S.capno !== 'none' && rr > 0) { if (etco2 < (S.cpr ? 10 : 25)) A.push(['med', `EtCO₂ baixo ${etco2}`, 'capno']); else if (etco2 > 50) A.push(['med', `EtCO₂ alto ${etco2}`, 'capno']); }
  }
  A.sort((a, b) => (a[0] === 'high' ? 0 : 1) - (b[0] === 'high' ? 0 : 1));
  if (t < bootT + 4) A.length = 0; // evita alarme falso ao abrir
  const alarmsNow = A.map(a => ({ level: a[0], txt: a[1], ch: a[2] }));

  return { displayed, alarmsNow };
}
