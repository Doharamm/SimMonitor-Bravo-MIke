import { escapeHTML as esc, SCENARIO_BY_ID, readLibrary, saveLibrary, duplicateScenario, validateScenario, registerScenario, caseSources } from './classroom.js';
import { RHYTHMS } from './rhythm-catalog.js';
import { VITAL_DEFS } from './simulation-config.js';

const $ = id => document.getElementById(id);

// Owns the local library and editor draft; never mutates the shipped scenarios.
export function initScenarioEditor({ getState, act, toast }) {
  let library = readLibrary(localStorage);
  let draft = null;
  for (const scenario of library) registerScenario(scenario);

  function list() {
    const box = $('customCases');
    box.replaceChildren();
    for (const scenario of library) {
      const row = document.createElement('div');
      const title = document.createElement('p');
      title.textContent = scenario.titulo + ' • v' + scenario.revision + ' • revisão clínica pendente';
      row.append(title);
      const actions = [
        ['Editar', () => edit(scenario)],
        ['Iniciar', () => {
          if (getState()?.scn.id && !confirm('Encerrar o caso atual e iniciar esta cópia?')) return;
          act('custom-load', scenario);
        }],
      ];
      for (const [label, run] of actions) {
        const button = document.createElement('button');
        button.textContent = label;
        button.className = 'btn';
        button.onclick = run;
        row.append(button);
      }
      box.append(row);
    }
  }

  function select(name, values, current) {
    return '<select class="sel" data-field="' + name + '">' + values.map(([value, label]) =>
      '<option value="' + value + '" ' + (String(current ?? '') === value ? 'selected' : '') + '>' + esc(label) + '</option>'
    ).join('') + '</select>';
  }

  function edit(scenario) {
    draft = structuredClone(scenario);
    $('editTitle').value = draft.titulo;
    $('editSummary').value = draft.resumo;
    $('editSources').value = caseSources(scenario);
    drawSteps();
    $('scenarioEditor').showModal();
  }

 function drawSteps(){
 $('editSteps').innerHTML=draft.etapas.map((e,i)=>`<fieldset data-step="${i}"><legend>Etapa ${i+1}</legend><label>Título<input class="sel" data-field="titulo" maxlength="100" required value="${esc(e.titulo)}"></label><label>Orientações<textarea class="sel" data-field="nota" maxlength="1200" required>${esc(e.nota)}</textarea></label><label>Espera antes de avançar (segundos; 0 = manual)<input class="sel" data-field="wait" type="number" min="0" max="600" required value="${e.wait??120}"></label><label>Transição dos sinais (segundos)<input class="sel" data-field="dur" type="number" min="0" max="600" required value="${e.dur||0}"></label><label>Ritmo${select('rhythm',[['','Manter'],...RHYTHMS.map(r=>[r.id,r.nome])],e.set.rhythm)}</label><div class="grid2">${Object.entries(VITAL_DEFS).map(([k,d])=>'<label>'+esc(d.nome)+' ('+esc(d.un)+')<input class="sel" type="number" step="any" min="'+d.min+'" max="'+d.max+'" data-vital="'+k+'" placeholder="Manter" value="'+(e.set.vit?.[k]??'')+'"></label>').join('')}</div><label>Pulso${select('pulse',[['','Manter'],['auto','Conforme ritmo'],['on','Presente'],['off','Ausente']],e.set.pulse)}</label><label>Capnografia${select('capno',[['','Manter'],['none','Desligada'],['normal','Normal'],['rcp','RCP'],['bronco','Broncoespasmo']],e.set.capno)}</label><label>Compressões${select('cpr',[['','Manter'],['true','Ativas'],['false','Paradas']],e.set.cpr)}</label><label>Gatilho automático${select('trigger',[['','Nenhum'],['shock','Choque'],['sync','Choque sincronizado'],['capture','Captura do marcapasso']],e.onCapture?'capture':e.onShock?(e.requireSync?'sync':'shock'):'')}</label><button type="button" class="btn" data-remove="${i}">Remover etapa</button></fieldset>`).join('');
 }

  function collect() {
    return [...$('editSteps').querySelectorAll('[data-step]')].map((box, index) => {
      const get = key => box.querySelector('[data-field="' + key + '"]').value;
      const step = {
        ...draft.etapas[index],
        titulo: get('titulo'), nota: get('nota'), dur: Number(get('dur')), wait:Number(get('wait')),
        set: structuredClone(draft.etapas[index].set),
      };
      for (const key of ['rhythm', 'pulse', 'capno', 'cpr']) {
        const value = get(key);
        if (value === '') delete step.set[key];
        else step.set[key] = key === 'cpr' ? value === 'true' : value;
      }
      delete step.set.vit;
      const vitals = {};
      for (const input of box.querySelectorAll('[data-vital]')) {
        if (input.value !== '') vitals[input.dataset.vital] = Number(input.value);
      }
      if (Object.keys(vitals).length) step.set.vit = vitals;
      delete step.onShock;
      delete step.onCapture;
      delete step.requireSync;
      const trigger = get('trigger');
      if (trigger === 'capture') step.onCapture = 'next';
      else if (trigger) {
        step.onShock = 'next';
        step.requireSync = trigger === 'sync';
      }
      return step;
    });
  }

  function save(event) {
    event.preventDefault();
    const raw = {
      ...draft, updatedAt: new Date().toISOString(),
      titulo: $('editTitle').value, resumo: $('editSummary').value,
      source: $('editSources').value, etapas: collect(),
      revision: (library.find(scenario => scenario.id === draft.id)?.revision || 0) + 1,
    };
    const scenario = validateScenario(raw);
    if (!scenario) return toast('Revise os campos. Cada etapa precisa de título, orientação e ao menos um ajuste válido.');
    const next = [...library.filter(item => item.id !== scenario.id), scenario];
    if (next.length > 30) return toast('Limite de 30 cópias locais');
    try { saveLibrary(localStorage, next); }
    catch { return toast('Não foi possível salvar neste navegador.'); }
    library = next;
    registerScenario(scenario);
    list();
    $('scenarioEditor').close();
    toast('Cópia salva. O original foi preservado.');
  }

  $('editSteps').onclick = event => {
    const button = event.target.closest('[data-remove]');
    if (!button) return;
    if (draft.etapas.length === 1) return toast('Mantenha ao menos uma etapa.');
    draft.etapas = collect();
    draft.etapas.splice(Number(button.dataset.remove), 1);
    drawSteps();
  };
  $('bAddStep').onclick = () => {
    if (draft.etapas.length >= 20) return toast('Limite de 20 etapas');
    draft.etapas = collect();
    draft.etapas.push({ titulo: 'Nova etapa', nota: 'Defina as orientações.', dur: 0, set: { pulse: 'auto' } });
    drawSteps();
  };
  $('bDuplicate').onclick = () => edit(duplicateScenario(SCENARIO_BY_ID[$('caseTemplate').value]));
  $('bCancelEdit').onclick = () => $('scenarioEditor').close();
  $('scenarioForm').onsubmit = save;
  list();
}
