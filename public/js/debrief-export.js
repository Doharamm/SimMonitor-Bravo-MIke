import { historyText } from './history.js';

const EXPORT_TIMEOUT_MS = 20000;
const MAX_PAGE = 250;

function saveFile(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// One export at a time, bound to the monitor session that supplied its first page.
export function createDebriefExport({
  getState, act, setStatus, save = saveFile,
  schedule = setTimeout, cancel = clearTimeout,
}) {
  let pending = null;
  let timeout;

  function finish(message) {
    cancel(timeout);
    pending = null;
    setStatus(message);
  }

  function start() {
    if (pending) return;
    pending = { events: [], page: 0, session: getState()?.session };
    timeout = schedule(() => {
      if (pending) finish('Exportação interrompida. Confira a conexão e tente novamente.');
    }, EXPORT_TIMEOUT_MS);
    setStatus('Buscando eventos…');
    if (!act('debrief', 0)) finish('Exportação não iniciada. Confira a conexão.');
  }

  function ack(message) {
    if (!pending || !Array.isArray(message.events)) return;
    if (!message.ok || getState()?.session !== pending.session) {
      finish('Caso mudou; refaça a exportação.');
      return;
    }
    pending.events.push(...message.events);
    if (pending.events.length < message.total && pending.page < MAX_PAGE) {
      act('debrief', ++pending.page);
      return;
    }
    save(historyText(pending.events), 'debrief-simmonitor.txt');
    finish('Debrief exportado.');
  }

  return { start, ack };
}
