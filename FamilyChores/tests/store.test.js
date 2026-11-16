/* Contract test: the same checks run against LocalStore (with a fake localStorage) and an
   in-memory fake of the Firestore adapter, so the UI can rely on identical behaviour. */
const test = require('node:test');
const assert = require('node:assert/strict');

function fakeLocalStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } };
}
global.self = global; global.crypto = require('node:crypto').webcrypto;
global.localStorage = fakeLocalStorage();
const S = require('../js/store.js');

/* A fake Firestore-backed store that honours the same interface using nested-map merge semantics. */
class FakeSyncStore {
  constructor() { this.mode = 'sync'; this.config = null; this.days = {}; this.fns = []; }
  init() { return Promise.resolve(this); }
  getConfig() { return this.config; }
  setConfig(c) { this.config = JSON.parse(JSON.stringify(c)); this.emit(); return Promise.resolve(); }
  getDay(k) { return this.days[k] || null; }
  listDays() { return this.days; }
  setCheck(key, id, check, scheduled) {
    const d = this.days[key] || { date: key, scheduled: [], checks: {} };
    if (scheduled) d.scheduled = scheduled;
    if (check) d.checks[id] = check; else delete d.checks[id];
    this.days[key] = d; this.emit(); return Promise.resolve();
  }
  patchDay(key, patch) { this.days[key] = Object.assign(this.days[key] || { date: key, scheduled: [], checks: {} }, patch); this.emit(); return Promise.resolve(); }
  onChange(f) { this.fns.push(f); return () => { this.fns = this.fns.filter(x => x !== f); }; }
  emit() { this.fns.forEach(f => f('remote')); }
  exportAll() { return { app: 'family-chores', version: 1, config: this.config, days: this.days }; }
  importAll(d) { if (d.config) this.config = d.config; Object.assign(this.days, d.days || {}); return Promise.resolve(); }
}

async function contract(name, make) {
  await test(`${name}: config round-trips`, async () => {
    const s = await make().init();
    assert.equal(s.getConfig(), null);
    await s.setConfig({ familyName: 'K', members: [], tasks: [{ id: 'a', title: 'A', freq: 'daily' }], settings: { weekStart: 0 } });
    assert.equal(s.getConfig().familyName, 'K');
  });
  await test(`${name}: checks are added, removed and keep the schedule`, async () => {
    const s = await make().init();
    const sched = [{ id: 'a', title: 'A', freq: 'daily', assignee: null }];
    await s.setCheck('2026-11-16', 'a', { by: 'm1', at: 'x', title: 'A', freq: 'daily' }, sched);
    await s.setCheck('2026-11-16', 'w', { by: 'm2', at: 'x', title: 'W', freq: 'weekly' });
    const d = s.getDay('2026-11-16');
    assert.equal(Object.keys(d.checks).length, 2);
    assert.deepEqual(d.scheduled, sched);
    await s.setCheck('2026-11-16', 'a', null);
    assert.equal(s.getDay('2026-11-16').checks.a, undefined);
    assert.equal(s.getDay('2026-11-16').checks.w.by, 'm2');
    assert.deepEqual(s.getDay('2026-11-16').scheduled, sched, 'unchecking keeps the schedule');
  });
  await test(`${name}: patchDay creates or merges, listDays indexes by date`, async () => {
    const s = await make().init();
    await s.patchDay('2026-11-15', { scheduled: [{ id: 'a', freq: 'daily' }] });
    await s.patchDay('2026-11-15', { final: { percent: 0 } });
    const all = s.listDays();
    assert.deepEqual(Object.keys(all), ['2026-11-15']);
    assert.equal(all['2026-11-15'].final.percent, 0);
    assert.equal(all['2026-11-15'].scheduled.length, 1);
  });
  await test(`${name}: onChange fires and export/import round-trips`, async () => {
    const s = await make().init();
    let n = 0; const off = s.onChange(() => n++);
    await s.setConfig({ familyName: 'X', members: [], tasks: [] });
    await s.setCheck('2026-01-01', 'a', { by: null, at: 'x', title: 'A', freq: 'daily' });
    assert.ok(n >= 2); off();
    const dump = s.exportAll();
    const t = await make().init();
    await t.importAll(JSON.parse(JSON.stringify(dump)));
    assert.equal(t.getConfig().familyName, 'X');
    assert.equal(t.getDay('2026-01-01').checks.a.title, 'A');
  });
}

contract('LocalStore', () => new S.LocalStore(fakeLocalStorage()));
contract('FakeSyncStore', () => new FakeSyncStore());

test('random family codes are long, lowercase and valid', () => {
  const c = S.randomCode(24);
  assert.match(c, /^[a-z0-9]{24}$/);
  assert.ok(S.validCode(c));
  assert.equal(S.validCode('short'), false);
  assert.equal(S.validCode('ABCDEFGHIJKLMNOPQRST'), false);
});

test('LocalStore.wipe keeps backups and the sync code', async () => {
  const ls = fakeLocalStorage();
  ls.setItem('fc:backup:1', '{}'); ls.setItem('fc:sync:code', 'abc');
  const s = new S.LocalStore(ls);
  await s.setConfig({ familyName: 'X', members: [], tasks: [] });
  await s.wipe();
  assert.equal(s.getConfig(), null);
  assert.equal(ls.getItem('fc:backup:1'), '{}');
  assert.equal(ls.getItem('fc:sync:code'), 'abc');
});
