import test from 'node:test';
import assert from 'node:assert/strict';
import { createDebriefExport } from '../public/js/debrief-export.js';

function fixture() {
  let session = 'first', allowed = true;
  const sent = [], saved = [], status = [], jobs = new Map();
  let sequence = 0;
  const exporter = createDebriefExport({
    getState: () => ({ session }),
    act: (...command) => { sent.push(command); return allowed; },
    setStatus: text => status.push(text),
    save: (...file) => saved.push(file),
    schedule: callback => { jobs.set(++sequence, callback); return sequence; },
    cancel: id => jobs.delete(id),
  });
  return { exporter, sent, saved, status, jobs,
    changeCase: () => { session = 'second'; },
    disconnect: () => { allowed = false; },
  };
}
const event = text => ({ text, at: 1000, elapsedMs: 0, actor: 'instrutor', origin: 'informado', caseName: 'Teste' });

test('debrief combines pages in order and starts only one export at a time', () => {
  const f = fixture();
  f.exporter.start();f.exporter.start();
  assert.deepEqual(f.sent, [['debrief', 0]]);
  f.exporter.ack({ ok: true, events: [event('Primeiro')], total: 2 });
  assert.deepEqual(f.sent.at(-1), ['debrief', 1]);
  f.exporter.ack({ ok: true, events: [event('Segundo')], total: 2 });
  assert.equal(f.saved.length, 1);
  assert.match(f.saved[0][0], /Primeiro[\s\S]*Segundo/);
  assert.equal(f.saved[0][1], 'debrief-simmonitor.txt');
  assert.equal(f.jobs.size, 0);
  assert.equal(f.status.at(-1), 'Debrief exportado.');
});
test('debrief never exports old pages after the case changes', () => {
  const f = fixture();f.exporter.start();f.changeCase();
  f.exporter.ack({ ok: true, events: [event('Antigo')], total: 1 });
  assert.equal(f.saved.length, 0);assert.equal(f.jobs.size, 0);
  assert.equal(f.status.at(-1), 'Caso mudou; refaça a exportação.');
});
test('debrief timeout releases the export for a new attempt', () => {
  const f = fixture();f.exporter.start();[...f.jobs.values()][0]();
  f.exporter.ack({ ok: true, events: [], total: 0 });
  assert.equal(f.saved.length, 0);assert.match(f.status.at(-1), /interrompida/);
  f.exporter.start();assert.equal(f.sent.length, 2);
});
test('debrief handles offline start, unrelated acknowledgements and empty history', () => {
  const f = fixture();f.disconnect();f.exporter.start();
  assert.equal(f.jobs.size, 0);assert.match(f.status.at(-1), /não iniciada/);
  const online = fixture();online.exporter.start();online.exporter.ack({ ok: true });
  assert.equal(online.saved.length, 0);
  online.exporter.ack({ ok: true, events: [], total: 0 });assert.equal(online.saved.length, 1);
});
