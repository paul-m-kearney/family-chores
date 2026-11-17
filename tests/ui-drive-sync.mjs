// Live sync test: real page in headless Chrome against the user's Firestore project.
// Verifies: create family uploads data; a check-off reaches the server; a server-side write reaches the page.
import fs from 'node:fs';
const SP = process.argv[2]; const URL0 = 'http://127.0.0.1:8765/index.html#today';
const KEY = 'AIzaSyD5LpUPbx803RJazNHDLex-mPiQsf9fwbk';
const REST = 'https://firestore.googleapis.com/v1/projects/family-chores-kearney/databases/(default)/documents';
const today = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();

for (const o of await (await fetch('http://127.0.0.1:9333/json/list')).json()) if (o.type === 'page' && o.url.includes('8765')) await fetch('http://127.0.0.1:9333/json/close/' + o.id);
async function tab() {
  const t = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value || a.description).join(' ')); };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error('page error: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text)); return r.result.result.value; };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  return { send, ev, errors, close: () => ws.close(), shot: async (n) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${SP}/shots/${n}.png`, Buffer.from(r.result.data, 'base64')); } };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra)); if (!cond) fails++; };
const waitFor = async (fn, ms = 10000, step = 250) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v) return v; await sleep(step); } return v; };
const rest = async (path, init) => { const r = await fetch(`${REST}/${path}${path.includes('?') ? '&' : '?'}key=${KEY}`, init); let j = null; try { j = await r.json(); } catch { } return { status: r.status, j }; };

const A = await tab();
await A.send('Page.navigate', { url: URL0 }); await sleep(1000);
await A.ev(`localStorage.clear()`); await A.send('Page.reload', { ignoreCache: true }); await sleep(1200);
await waitFor(() => A.ev(`document.getElementById('dialog').open`));
await A.ev(`(() => { const f = document.getElementById('dialogForm'); f.familyName.value = 'Sync Test'; f.members.value = 'Mom\\nDad'; f.requestSubmit(f.querySelector('button[value=ok]')); })()`); await sleep(400);
check('local setup done', (await A.ev(`document.getElementById('familyName').textContent`)) === 'Sync Test');
check('pill says This device before sync', (await A.ev(`document.getElementById('syncPill').textContent`)) === 'This device');

// Create a shared family (uploads local data, saves code, reloads)
await A.ev(`location.hash = '#family'`); await sleep(300);
check('Create a shared family button present', await A.ev(`!!document.querySelector('[data-action=create-family]')`));
await A.ev(`window.confirm = () => true; document.querySelector('[data-action=create-family]').click()`);
const code = await waitFor(() => A.ev(`localStorage.getItem('fc:sync:code')`), 20000);
check('family code saved (24 chars)', !!code && /^[a-z0-9]{24}$/.test(code), String(code));
console.log('  family code: ' + code);
await sleep(2500); // page reloads itself after create
const pill = await waitFor(async () => { const p = await A.ev(`document.getElementById('syncPill').textContent`); return p === 'Synced' ? p : null; }, 20000);
check('pill says Synced after reload', pill === 'Synced', await A.ev(`document.getElementById('syncPill').title`));
await A.shot('10-sync-family');

// Server has the config
const cfg = await rest(`families/${code}/data/config`);
check('server has config with familyName', cfg.status === 200 && cfg.j?.fields?.familyName?.stringValue === 'Sync Test', JSON.stringify(cfg).slice(0, 200));
const tasks = (cfg.j?.fields?.tasks?.arrayValue?.values || []).map(v => v.mapValue.fields);
check('server has 29 starter tasks', tasks.length === 29, String(tasks.length));

// Client -> server: check a chore in the page
await A.ev(`location.hash = '#today'`); await sleep(400);
await A.ev(`document.querySelector('[data-action=pick-me]').click()`); await sleep(100);
const firstId = await A.ev(`document.querySelector('.check[data-freq=daily]').dataset.id`);
await A.ev(`document.querySelector('.check[data-freq=daily]').click()`);
const day = await waitFor(async () => { const d = await rest(`families/${code}/days/${today}`); return d.status === 200 && d.j?.fields?.checks?.mapValue?.fields?.[firstId] ? d : null; }, 15000);
check('check-off reached the server', !!day, 'no day doc with that check within 15s');
check('server records who did it', day?.j?.fields?.checks?.mapValue?.fields?.[firstId]?.mapValue?.fields?.by?.stringValue?.length > 0);
check('server day has 9 scheduled', (day?.j?.fields?.scheduled?.arrayValue?.values || []).length === 9);

// Client uncheck -> server (covers FieldPath handling for ids that start with a digit)
await A.ev(`document.querySelector('.check[data-id="${firstId}"]').click()`);
const gone = await waitFor(async () => { const d = await rest(`families/${code}/days/${today}`); return d.status === 200 && !d.j?.fields?.checks?.mapValue?.fields?.[firstId] ? d : null; }, 15000);
check('uncheck removed the check on the server', !!gone);
await A.ev(`document.querySelector('.check[data-id="${firstId}"]').click()`);
const back = await waitFor(async () => { const d = await rest(`families/${code}/days/${today}`); return d.status === 200 && d.j?.fields?.checks?.mapValue?.fields?.[firstId] ? d : null; }, 15000);
check('re-check reached the server', !!back);

// Server -> client: write a second check via REST, expect the page to show it
const secondId = tasks.find(t => t.freq.stringValue === 'daily' && t.id.stringValue !== firstId).id.stringValue;
const body = { fields: { checks: { mapValue: { fields: { [secondId]: { mapValue: { fields: { by: { nullValue: null }, at: { stringValue: new Date().toISOString() }, title: { stringValue: 'REST write' }, freq: { stringValue: 'daily' } } } } } } } } };
const w = await rest(`families/${code}/days/${today}?updateMask.fieldPaths=${encodeURIComponent('checks.`' + secondId + '`')}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
check('REST write accepted', w.status === 200, String(w.status));
const ring = await waitFor(async () => { const t = await A.ev(`document.querySelector('.ring text').textContent`); return t === '22%' ? t : null; }, 15000);
check('page updated live from server (22%, 2 of 9)', ring === '22%', await A.ev(`document.querySelector('.big').textContent`));
check('second check shows as done by someone', /done by someone/.test(await A.ev(`[...document.querySelectorAll('.chore.done .meta')].map(m => m.textContent).join('|')`)));
await A.shot('11-sync-today');

// A second browser tab joins via the invite link and sees the same state
const B = await tab();
await B.send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html#join=' + code }); await sleep(1500);
check('join link opens join dialog or is already joined', await B.ev(`document.getElementById('dialog').open || localStorage.getItem('fc:sync:code') === '${code}'`));
if (await B.ev(`document.getElementById('dialog').open`)) { await B.ev(`document.getElementById('dialogForm').requestSubmit(document.querySelector('#dialogForm button[value=ok]'))`); await sleep(2500); }
const pillB = await waitFor(async () => { const p = await B.ev(`document.getElementById('syncPill').textContent`); return p === 'Synced' ? p : null; }, 20000);
check('second tab is Synced', pillB === 'Synced', String(pillB));
check('already-joined invite link lands on Today', (await B.ev(`location.hash`)) === '#today', await B.ev(`location.hash`));
const ringB = await waitFor(async () => { const t = await B.ev(`document.querySelector('.ring text') && document.querySelector('.ring text').textContent`); return t === '22%' ? t : null; }, 20000);
check('second tab shows synced state (22%)', ringB === '22%', String(ringB));
await B.shot('12-sync-second-tab');

// Leave family on tab A -> local mode again, data preserved locally? (local data was uploaded; local copy still there)
await A.ev(`location.hash = '#family'`); await sleep(300);
check('invite link shown', (await A.ev(`document.getElementById('inviteLink')?.textContent || ''`)).includes('#join=' + code));

// Cleanup on server
await rest(`families/${code}/days/${today}`, { method: 'DELETE' });
const delCfg = await rest(`families/${code}/data/config`, { method: 'DELETE' });
console.log('  cleanup: day deleted; config delete status ' + delCfg.status + (delCfg.status === 403 ? ' (needs republished rules; harmless leftover, code ' + code + ')' : ''));
await A.ev(`localStorage.clear()`); await B.ev(`localStorage.clear()`);

console.log('\nconsole errors A: ' + (A.errors.length ? '\n  ' + A.errors.join('\n  ') : 'none'));
console.log('console errors B: ' + (B.errors.length ? '\n  ' + B.errors.join('\n  ') : 'none'));
console.log(fails ? `\n${fails} FAILED` : '\nALL LIVE SYNC CHECKS PASSED');
A.close(); B.close(); process.exit(fails ? 1 : 0);
