import { VITAL_DEFS } from './simulation-config.js';

// Edição direta no monitor, para conduzir a aula sem controle remoto: um clique
// no número abre um campo; Enter aplica o valor e liga o sensor daquele número.
// Perde imersão (os alunos veem a digitação), mas é a alternativa sem celular.
export const CAMPOS_DIGITAVEIS = {
  ecg:   { vit: 'hr',    rotulo: 'FC (bpm)' },
  spo2:  { vit: 'spo2',  rotulo: 'SpO₂ (%)' },
  capno: { vit: 'etco2', rotulo: 'EtCO₂ (mmHg)' },
  resp:  { vit: 'rr',    rotulo: 'FR (irpm)' },
  temp:  { vit: 'temp',  rotulo: 'Temperatura (°C)' },
  nibp:  { rotulo: 'PA (ex.: 120/80)' },
};

const numero = texto => { const t = String(texto).trim().replace(',', '.'); return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN; };
const foraDaFaixa = (k, v) => v < VITAL_DEFS[k].min || v > VITAL_DEFS[k].max;
const faixa = k => `${VITAL_DEFS[k].min}–${VITAL_DEFS[k].max}`;

// Texto digitado → ajuste a aplicar. `estado` é o estado atual do monitor,
// usado para a capnografia (curva e ventilação) e para a FR do oxímetro.
export function lerDigitado(canal, texto, estado) {
  if (canal === 'nibp') {
    const m = String(texto).trim().match(/^(\d{2,3})\s*[/x×\s]\s*(\d{2,3})$/i);
    if (!m) return { erro: 'Digite a PA como 120/80' };
    const sys = +m[1], dia = +m[2];
    if (foraDaFaixa('sys', sys) || foraDaFaixa('dia', dia)) return { erro: `PAS ${faixa('sys')}, PAD ${faixa('dia')}` };
    if (dia >= sys) return { erro: 'A PAD precisa ser menor que a PAS' };
    // O instrutor informa a medida: a leitura aparece na hora, sem o manguito.
    return { patch: { vit: { sys, dia }, show: { nibp: true } }, leituraPni: { sys, dia } };
  }
  const campo = CAMPOS_DIGITAVEIS[canal];
  if (!campo) return { erro: 'Campo desconhecido' };
  const v = numero(texto);
  if (!Number.isFinite(v)) return { erro: 'Digite um número' };
  if (foraDaFaixa(campo.vit, v)) return { erro: `Use um valor entre ${faixa(campo.vit)}` };
  const valor = campo.vit === 'temp' ? Math.round(v * 10) / 10 : Math.round(v);
  const patch = { vit: { [campo.vit]: valor }, show: { [canal]: true } };
  // FR vem do oxímetro, como no controle: ligar um liga o outro.
  if (canal === 'spo2' || canal === 'resp') Object.assign(patch.show, { spo2: true, resp: true });
  if (canal === 'capno') {
    if (estado?.capno === 'none') patch.capno = estado.cpr ? 'rcp' : 'normal';
    // Sem ventilação o EtCO₂ não aparece; o valor digitado precisa de uma FR.
    if (!(estado?.vit?.rr > 0)) patch.vit.rr = estado?.cpr ? 10 : 12;
  }
  return { patch };
}

// Desligar pelo mesmo campo: tira o sensor daquele número. SpO₂ e FR saem
// juntos, porque a FR vem do oxímetro.
export function desligarSensor(canal) {
  if (!CAMPOS_DIGITAVEIS[canal]) return null;
  return { show: canal === 'spo2' || canal === 'resp' ? { spo2: false, resp: false } : { [canal]: false } };
}

export function initEdicaoRapida({ document, getState, aplicar }) {
  let aberto = null;
  function fechar() { aberto?.form.remove(); aberto = null; }
  function abrir(caixa) {
    const canal = caixa.dataset.ch, campo = CAMPOS_DIGITAVEIS[canal];
    if (!campo) return;
    fechar();
    const S = getState();
    const atual = canal === 'nibp' ? (S.vit.sys != null ? `${Math.round(S.vit.sys)}/${Math.round(S.vit.dia)}` : '')
      : String(canal === 'temp' ? S.vit.temp.toFixed(1).replace('.', ',') : Math.round(S.vit[campo.vit]));
    const form = document.createElement('form');
    form.className = 'edit-rapida';
    const ligado = !!S.show?.[canal];
    form.innerHTML = `<label>${campo.rotulo}<input inputmode="${canal === 'nibp' ? 'text' : 'decimal'}" autocomplete="off" spellcheck="false"></label><div class="er-pe"><small>Enter aplica · Esc cancela</small>${ligado ? '<button type="button" class="er-off">Desligar sensor</button>' : ''}</div>`;
    const input = form.querySelector('input'), aviso = form.querySelector('small');
    input.value = atual;
    form.addEventListener('submit', e => {
      e.preventDefault();
      const r = lerDigitado(canal, input.value, getState());
      if (r.erro) { aviso.textContent = r.erro; aviso.classList.add('erro'); input.select(); return; }
      fechar(); aplicar(r.patch, r.leituraPni);
    });
    const off = form.querySelector('.er-off');
    // mousedown sem foco: o campo não perde o foco e não fecha antes do clique.
    off?.addEventListener('mousedown', e => e.preventDefault());
    off?.addEventListener('click', () => { fechar(); aplicar(desligarSensor(canal)); });
    input.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); fechar(); } });
    input.addEventListener('blur', () => setTimeout(() => { if (aberto?.form === form && !form.contains(document.activeElement)) fechar(); }, 150));
    caixa.append(form);
    aberto = { form, caixa };
    input.focus(); input.select();
  }
  for (const caixa of document.querySelectorAll('.num[data-ch]')) {
    if (!CAMPOS_DIGITAVEIS[caixa.dataset.ch]) continue;
    caixa.classList.add('digitavel');
    caixa.title = 'Clique para digitar o valor';
    caixa.addEventListener('click', e => {
      // Botões dentro do quadro (Medir PNI, Ritmo, ECG, Raio-X) seguem normais.
      if (e.target.closest('button, form')) return;
      abrir(caixa);
    });
  }
  return { fechar };
}
