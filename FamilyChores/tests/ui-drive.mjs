// Drives the real site in headless Chrome via the DevTools protocol.
const SP = process.argv[2]; const URL0 = 'http://127.0.0.1:8765/index.html#today';
for (const o of await (await fetch('http://127.0.0.1:9333/json/list')).json()) if (o.type === 'page' && o.url.includes('8765')) await fetch('http://127.0.0.1:9333/json/close/' + o.id);
const t = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map(); const consoleErrors = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push(m.params.args.map(a => a.value || a.description).join(' ')); };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error('page error: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text) + '\n in: ' + expr.slice(0, 120)); return r.result.result.value; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); await import('node:fs').then(fs => fs.writeFileSync(`${SP}/shots/${name}.png`, Buffer.from(r.result.data, 'base64'))); };
let fails = 0; const check = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra)); if (!cond) fails++; };

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send('Page.navigate', { url: URL0 }); await sleep(800);
await ev(`localStorage.clear()`); await send('Page.reload', { ignoreCache: true }); await sleep(1000);
for (let i = 0; i < 20 && !(await ev(`document.getElementById('dialog').open`)); i++) await sleep(200);
if (!(await ev(`document.getElementById('dialog').open`))) console.log('DEBUG config=', await ev(`localStorage.getItem('fc:config')`), 'main=', await ev(`document.getElementById('app').textContent.slice(0,200)`));

// 1. first-run wizard
check('wizard opens on first run', await ev(`document.getElementById('dialog').open`));
await shot('01-wizard');
await ev(`(() => { const f = document.getElementById('dialogForm'); f.familyName.value = 'Test Family'; f.members.value = 'Mom\\nDad\\nLiam\\nEmma'; f.requestSubmit(f.querySelector('button[value=ok]')); })()`);
await sleep(300);
check('wizard closed', !(await ev(`document.getElementById('dialog').open`)));
check('family name in header', (await ev(`document.getElementById('familyName').textContent`)) === 'Test Family');
const counts = await ev(`JSON.stringify([...document.querySelectorAll('.card')].map(c => c.querySelector('h2')?.textContent.trim().split(' ')[0] + ':' + c.querySelectorAll('.chore').length))`);
check('starter chores loaded (9 daily, 14 weekly, 6 monthly)', /Today's:9/.test(counts) && /This:14/.test(counts) && /This:6/.test(counts), counts);
check('ring shows 0%', (await ev(`document.querySelector('.ring text').textContent`)) === '0%');
check('4 member chips + Someone', (await ev(`document.querySelectorAll('[data-action=pick-me]').length`)) === 5);
await shot('02-today-empty');

// 2. pick a person and check off chores
await ev(`document.querySelector('[data-action=pick-me]').click()`); await sleep(100);
check('Mom selected', (await ev(`document.querySelector('[data-action=pick-me]').getAttribute('aria-pressed')`)) === 'true');
await ev(`document.querySelector('.check[data-freq=daily]').click()`); await sleep(200);
check('first daily chore checked', (await ev(`document.querySelector('.check[data-freq=daily]').getAttribute('aria-checked')`)) === 'true');
check('credited to Mom with time', /done by Mom at/.test(await ev(`document.querySelector('.chore.done .meta').textContent`)));
check('ring 11% (1 of 9)', (await ev(`document.querySelector('.ring text').textContent`)) === '11%');
await ev(`document.querySelector('.check[data-freq=weekly]').click()`); await sleep(200);
check('weekly chore raises score to 20% (2 of 10)', (await ev(`document.querySelector('.ring text').textContent`)) === '20%', await ev(`document.querySelector('.big').textContent`));
check('week counter 1/14', /Week: 1\/14/.test(await ev(`document.querySelector('.streak').nextElementSibling.textContent`)));
await ev(`document.querySelector('.check[data-freq=weekly]').click()`); await sleep(200);
check('unchecking weekly returns to 11%', (await ev(`document.querySelector('.ring text').textContent`)) === '11%');
await shot('03-today-partial');

// 3. only-mine filter: assign none yet, so all visible; toggle filter and back
await ev(`document.querySelector('[data-action=only-mine]').click()`); await sleep(100);
check('only-mine keeps unassigned chores visible', (await ev(`document.querySelectorAll('.chore').length`)) === 29);
await ev(`document.querySelector('[data-action=only-mine]').click()`); await sleep(100);

// 4. browse to yesterday, check something, come back
await ev(`document.querySelector('[data-action=nav-day][data-n="-1"]').click()`); await sleep(200);
check('yesterday header', (await ev(`document.querySelector('.today-head h1').textContent`)) === 'Yesterday');
await ev(`document.querySelector('.check[data-freq=daily]').click()`); await sleep(200);
check('yesterday chore checked', (await ev(`document.querySelector('.ring text').textContent`)) === '11%');
await ev(`document.querySelector('[data-action=nav-day][data-n="1"]').click()`); await sleep(200);
check('back to today', (await ev(`document.querySelector('.today-head h1').textContent`)) === 'Today');
check('next-day button disabled on today', await ev(`document.querySelector('[data-action=nav-day][data-n="1"]').disabled`));

// 5. finish the day
await ev(`(async () => { let b, n = 0; while ((b = document.querySelector('.check[data-freq=daily][aria-checked=false]')) && n++ < 20) { b.click(); await new Promise(r => setTimeout(r, 60)); } })()`); await sleep(400);
check('ring 100%', (await ev(`document.querySelector('.ring text').textContent`)) === '100%');
check('celebration toast shown', /Everything done/.test(await ev(`document.getElementById('toasts').textContent`)));
check('streak is 1', /🔥 1-day/.test(await ev(`document.querySelector('.streak').textContent`)));
check('Mom tally 9', (await ev(`document.querySelector('[data-action=pick-me] .count').textContent`)) === '9');
await shot('04-today-complete');

// 6. history
await ev(`location.hash = '#history'`); await sleep(300);
check('chart has 30 hit areas', (await ev(`document.querySelectorAll('.chart .hit').length`)) === 30);
check('today bar is full height class', (await ev(`[...document.querySelectorAll('.chart .bar')].pop().getAttribute('class')`)) === 'bar');
check('day list shows 100% today', /100% · 9\/9/.test(await ev(`document.querySelector('.day-list summary .pct').textContent`)));
check('yesterday shows 11%', /11% · 1\/9/.test(await ev(`document.querySelectorAll('.day-list summary .pct')[1].textContent`)));
check('champion is Mom', /Mom/.test(await ev(`[...document.querySelectorAll('.stat')].find(s => /champion/.test(s.textContent)).textContent`)));
check('not-logged days drawn dashed', (await ev(`document.querySelectorAll('.chart .bar.na').length`)) === 28);
await shot('05-history');

// 7. chores tab: add, edit, delete
await ev(`location.hash = '#chores'`); await sleep(300);
await ev(`document.querySelector('[data-action=add-chore]').click()`); await sleep(100);
await ev(`(() => { const f = document.getElementById('dialogForm'); f.title.value = 'Water plants'; f.freq.value = 'daily'; f.querySelector('input[name=days][value="1"]').checked = true; f.assignee.value = f.assignee.options[3].value; f.requestSubmit(f.querySelector('button[value=ok]')); })()`); await sleep(300);
check('chore added (10 daily)', /Daily 10/.test((await ev(`document.querySelectorAll('.card h2')[1].textContent`)).replace(/\s+/g, ' ')));
check('shows assignee and weekday', /Liam · Mon/.test(await ev(`[...document.querySelectorAll('.edit-list li')].find(l => /Water plants/.test(l.textContent)).textContent`)));
await shot('06-chores');
await ev(`[...document.querySelectorAll('.edit-list li')].find(l => /Water plants/.test(l.textContent)).querySelector('[data-action=edit-chore]').click()`); await sleep(100);
await ev(`(() => { const f = document.getElementById('dialogForm'); window.confirm = () => true; f.requestSubmit(f.querySelector('button[value=delete]')); })()`); await sleep(300);
check('chore deleted (9 daily)', /Daily 9/.test((await ev(`document.querySelectorAll('.card h2')[1].textContent`)).replace(/\s+/g, ' ')));
await ev(`document.querySelector('[data-action=move-chore][data-n="1"]:not([disabled])').click()`); await sleep(200);
check('reorder moved first daily chore down', /Liam's Room/.test(await ev(`document.querySelector('.edit-list li').textContent`)));

// 8. family tab
await ev(`location.hash = '#family'`); await sleep(300);
check('4 members listed', (await ev(`document.querySelectorAll('.edit-list li').length`)) === 4);
check('sync section explains Firebase setup', /firebase-config\.js/.test(await ev(`document.body.textContent`)));
await ev(`(() => { const s = document.querySelector('[data-setting=weekStart]'); s.value = '1'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(200);
check('week start saved', (await ev(`JSON.parse(localStorage.getItem('fc:config')).settings.weekStart`)) === 1);
await shot('07-family');

// 9. persistence across reload
await ev(`location.hash = '#today'`); await send('Page.reload', { ignoreCache: true }); await sleep(1000);
check('data persists after reload (100%)', (await ev(`document.querySelector('.ring text').textContent`)) === '100%');
check('me remembered', (await ev(`document.querySelector('[data-action=pick-me]').getAttribute('aria-pressed')`)) === 'true');
check('no horizontal overflow at 390px', (await ev(`document.documentElement.scrollWidth <= 390`)));

// 10. dark mode + desktop
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }); await sleep(200);
check('dark background applied', (await ev(`getComputedStyle(document.body).backgroundColor`)) === 'rgb(21, 25, 26)');
await shot('08-dark');
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false }); await sleep(300);
await shot('09-desktop');

// 11. export shape
const dump = await ev(`(() => { const d = JSON.parse(localStorage.getItem('fc:config')); const days = Object.keys(localStorage).filter(k => k.startsWith('fc:day:')); return JSON.stringify({ tasks: d.tasks.length, members: d.members.length, days }); })()`);
check('two day records stored', JSON.parse(dump).days.length === 2, dump);

console.log('\nconsole errors: ' + (consoleErrors.length ? '\n  ' + consoleErrors.join('\n  ') : 'none'));
console.log(fails ? `\n${fails} FAILED` : '\nALL UI CHECKS PASSED');
ws.close(); process.exit(fails ? 1 : 0);
