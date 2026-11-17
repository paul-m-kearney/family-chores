/* Family Chores: UI. Depends on ChoreLogic (js/logic.js) and ChoreStore (js/store.js). */
(function () {
  'use strict';
  var L = window.ChoreLogic, S = window.ChoreStore, Sync = S.Sync;
  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function attr(s) { return esc(s); }

  var COLORS = ['#2a6f6a', '#c2553a', '#5b6fb5', '#b58b2a', '#8a4fa3', '#2e8b57', '#c75f8b', '#5a7d8f'];
  var EMOJIS = ['😀', '😎', '🦊', '🐻', '🐼', '🦄', '🐸', '🐯', '🦁', '🐶', '🐱', '🐵', '🌟', '⚡', '🌈', '🚀', '👩', '👨', '👧', '👦'];
  var STARTER = [
    ['Vacuum Main Floor', 'daily'], ["Vacuum Liam's Room", 'daily'], ["Vacuum Emma's Room", 'daily'], ['Vacuum Play Room', 'daily'],
    ['Vacuum Office', 'daily'], ['Vacuum Upstairs Hallway', 'daily'], ['Empty Dishwasher', 'daily'], ["Make Emma's Bed", 'daily'], ["Make Liam's Bed", 'daily'],
    ['Bona Upstairs', 'weekly'], ['Bona Main Floor', 'weekly'], ['Yard Work', 'weekly'], ['Put out Trashbins', 'weekly'], ['Take In Trashbins', 'weekly'],
    ["Wash Emma's Sheets", 'weekly'], ["Wash Liam's Sheets", 'weekly'], ['Wash Master Sheets', 'weekly'], ['Swiffer Kids Bathroom', 'weekly'],
    ['Steam Master Bath', 'weekly'], ['Steam Laundry Room', 'weekly'], ['Steam Gym', 'weekly'], ['Clean Toilet Bowls', 'weekly'], ["Empty Kid's Trash Bins", 'weekly'],
    ['Change Water Filter', 'monthly'], ['Change Air Filters', 'monthly'], ['Check Reverse Osmosis Filters', 'monthly'], ['Cut Grass', 'monthly'], ['Powerwash Walkway', 'monthly'], ['Powerwash Garage', 'monthly']
  ];

  var store, config, today = L.todayKey(), viewDate = today, tab = 'today', me = null, onlyMine = false, lastPercent = null;

  /* ---------- small UI helpers ---------- */
  function toast(msg, ms) {
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    $('#toasts').appendChild(t); setTimeout(function () { t.remove(); }, ms || 2600);
  }
  function openDialog(html, onSubmit) {
    var dlg = $('#dialog'), form = $('#dialogForm');
    form.innerHTML = html;
    form.onsubmit = function (e) {
      var btn = e.submitter; if (btn && btn.value === 'cancel') return;
      if (onSubmit) { var r = onSubmit(new FormData(form), form, btn); if (r === false) e.preventDefault(); }
    };
    dlg.showModal();
    var first = form.querySelector('input[type=text]'); if (first) first.focus();
  }
  function closeDialog() { $('#dialog').close(); }
  function showError(title, msg) {
    openDialog('<h2>' + esc(title) + '</h2><p class="small">' + esc(msg) + '</p><div class="row" style="justify-content:flex-end"><button class="btn primary" value="cancel">OK</button></div>');
  }
  function member(id) { return (config.members || []).filter(function (m) { return m.id === id; })[0] || null; }
  function memberName(id) { var m = member(id); return m ? m.name : (id ? 'Someone' : 'Anyone'); }
  function memberChip(m, pressed, count) {
    var c = m ? m.color : '#8a9494';
    return '<button type="button" class="chip" data-action="pick-me" data-id="' + attr(m ? m.id : '') + '" aria-pressed="' + (pressed ? 'true' : 'false') + '" style="--c:' + attr(c) + '">' +
      (m ? avatarHtml(m, 'xs') : '<span class="dot"></span>') + esc(m ? m.name : 'Someone') +
      (count != null ? '<span class="count">' + count + '</span>' : '') + '</button>';
  }
  /* Who completed a check: prefer the current member record, fall back to the snapshot in the check. */
  function completer(check) {
    if (!check) return null;
    var m = check.by ? member(check.by) : null;
    if (m) return { id: m.id, name: m.name, emoji: m.emoji, color: m.color };
    if (check.by || check.byName) return { id: check.by || null, name: check.byName || 'Someone', emoji: check.emoji || '👤', color: check.color || '#8a9494' };
    return { id: null, name: 'someone', emoji: '✓', color: null };
  }
  function avatarHtml(a, cls) {
    if (!a) return '';
    return '<span class="avatar ' + (cls || '') + '" style="--c:' + attr(a.color || 'var(--card-2)') + '" title="' + attr(a.name) + '" aria-hidden="true">' + esc(a.emoji) + '</span>';
  }
  function timeOf(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  function tasks() { return config.tasks || []; }
  function weekStart() { return (config.settings && config.settings.weekStart) || 0; }

  /* ---------- data upkeep ---------- */
  function scheduledFor(key) {
    if (key >= today) return L.scheduledDaily(tasks(), key);
    var d = store.getDay(key);
    return (d && d.scheduled && d.scheduled.length) ? d.scheduled : L.scheduledDaily(tasks(), key);
  }
  function ensureToday() {
    var want = L.scheduledDaily(tasks(), today), have = store.getDay(today);
    if (!have || !L.sameIds(have.scheduled, want)) return store.patchDay(today, { scheduled: want });
    return Promise.resolve();
  }
  function finalizePastDays() {
    var days = store.listDays(), p = Promise.resolve();
    Object.keys(days).forEach(function (k) {
      var d = days[k];
      if (k >= today || d.final || L.daysBetween(k, today) > 60) return;
      var s = L.scoreDay(d);
      p = p.then(function () { return store.patchDay(k, { final: { done: s.done, total: s.total, percent: s.percent, at: new Date().toISOString() } }); });
    });
    return p;
  }
  function rolloverCheck() {
    var t = L.todayKey();
    if (t !== today) {
      var wasToday = viewDate === today;
      today = t; if (wasToday) viewDate = today;
      ensureToday().then(finalizePastDays).then(render);
    }
  }

  /* ---------- boot ---------- */
  function boot() {
    Sync.open().then(function (s) {
      store = s;
      config = store.getConfig();
      try { me = localStorage.getItem('fc:me') || null; } catch (e) { me = null; }
      store.onChange(function () { config = store.getConfig() || config; render(); });
      window.addEventListener('hashchange', route);
      setInterval(rolloverCheck, 30000);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) rolloverCheck(); });
      $('#app').addEventListener('click', onClick);
      $('#app').addEventListener('change', onChange);
      var m = location.hash.match(/#join=([a-z0-9]+)/i);
      if (m) { var already = Sync.getCode() === m[1].toLowerCase(); history.replaceState(null, '', already ? '#today' : '#family'); if (!already) return promptJoin(m[1].toLowerCase()); }
      if (!config) { $$('nav.tabs a').forEach(function (a) { if (a.dataset.tab === 'today') a.setAttribute('aria-current', 'page'); }); $('#app').innerHTML = '<div class="card"><h2>Family Chores</h2><p class="muted small">One shared list for the whole family. Daily, weekly and monthly chores, a check-off anyone can tap, and a score for every day.</p></div>'; return wizard(); }
      if (me && !member(me)) me = null;
      ensureToday().then(finalizePastDays).then(function () { route(); showRecap(); });
    }).catch(function (e) {
      $('#app').innerHTML = '<div class="card banner err">Could not start: ' + esc(e.message || e) + '</div>';
    });
  }
  function route() {
    var h = (location.hash || '#today').replace('#', '');
    tab = ['today', 'history', 'chores', 'family'].indexOf(h) >= 0 ? h : 'today';
    $$('nav.tabs a').forEach(function (a) { if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    render();
  }

  /* ---------- first run ---------- */
  function wizard() {
    var html = '<h2>Welcome! Set up your family</h2>' +
      '<label class="field"><span>Family name</span><input type="text" name="familyName" value="Our Family" required maxlength="40"></label>' +
      '<label class="field"><span>Family members (one per line)</span><textarea name="members" rows="4" placeholder="Mom&#10;Dad&#10;Liam&#10;Emma"></textarea></label>' +
      '<label class="row"><input type="checkbox" name="starter" checked> Start with our chore list (9 daily, 14 weekly, 6 monthly). You can edit it any time.</label>' +
      '<label class="field"><span>Week starts on</span><select name="weekStart"><option value="0">Sunday</option><option value="1">Monday</option></select></label>' +
      '<div class="row" style="justify-content:flex-end"><button class="btn primary" value="ok">Let\'s go</button></div>';
    openDialog(html, function (fd) {
      var names = String(fd.get('members') || '').split(/\n|,/).map(function (s) { return s.trim(); }).filter(Boolean);
      var members = names.map(function (n, i) { return { id: S.uid(), name: n.slice(0, 30), emoji: EMOJIS[i % EMOJIS.length], color: COLORS[(i + Math.floor(i / COLORS.length)) % COLORS.length] }; });
      var ts = fd.get('starter') ? STARTER.map(function (t, i) { return { id: S.uid(), title: t[0], freq: t[1], assignee: null, order: i }; }) : [];
      config = { familyName: String(fd.get('familyName') || 'Our Family').slice(0, 40), members: members, tasks: ts, settings: { weekStart: Number(fd.get('weekStart')) || 0 }, createdAt: new Date().toISOString() };
      store.setConfig(config).then(ensureToday).then(function () { toast('All set. Tap a chore to check it off.'); render(); });
    });
  }

  /* ---------- recap of yesterday ---------- */
  function showRecap() {
    var y = L.addDays(today, -1), seen = null;
    try { seen = localStorage.getItem('fc:recapSeen'); } catch (e) { }
    if (seen === y) return;
    var d = store.getDay(y), status = L.dayStatus(store.listDays(), tasks(), y);
    if (status === 'skip') return;
    var el = $('#recap'); if (!el) return;
    var msg;
    if (status === 'missing') msg = 'Yesterday was not logged. Nobody opened the list.';
    else { var s = L.scoreDay(d); msg = 'Yesterday: ' + s.percent + '% (' + s.done + ' of ' + s.total + ' chores done)' + (s.percent === 100 ? ' 🎉' : ''); }
    el.innerHTML = '<div class="banner"><span>' + esc(msg) + '</span><button class="btn sm" data-action="dismiss-recap" data-day="' + y + '">OK</button></div>';
    el.classList.remove('hidden');
  }

  /* ---------- render ---------- */
  function render() {
    if (!config) return;
    $('#familyName').textContent = config.familyName || 'Family Chores';
    var pill = $('#syncPill');
    if (store.syncError) { pill.textContent = 'Sync off'; pill.className = 'sync-pill err'; pill.title = store.syncError; }
    else if (store.mode === 'sync') { pill.textContent = 'Synced'; pill.className = 'sync-pill on'; pill.title = 'Shared with your family'; }
    else { pill.textContent = 'This device'; pill.className = 'sync-pill'; pill.title = 'Data is stored on this device only'; }
    var app = $('#app');
    if (tab === 'today') app.innerHTML = renderToday();
    else if (tab === 'history') app.innerHTML = renderHistory();
    else if (tab === 'chores') app.innerHTML = renderChores();
    else app.innerHTML = renderFamily();
    if (tab === 'today') { showRecap(); wireChart(); }
    if (tab === 'history') wireChart();
  }

  function choreItem(t, check, flexDate) {
    var done = !!check;
    var c = done ? completer(check) : null;
    var who = done ? c.name : null;
    var when = done ? (flexDate && flexDate !== viewDate ? ' on ' + L.describeDay(flexDate, today) : ' at ' + timeOf(check.at)) : '';
    var m = t.assignee ? member(t.assignee) : null;
    var stamp = done ? (c.color ? '<span class="stamp" style="--c:' + attr(c.color) + '">' + esc(c.emoji) + '</span>' : '✓') : '';
    return '<li class="chore' + (done ? ' done' : '') + '">' +
      '<button type="button" class="check' + (done && c.color ? ' stamped' : '') + '" role="checkbox" aria-checked="' + done + '" data-action="toggle" data-id="' + attr(t.id) + '" data-freq="' + attr(t.freq) + '" data-date="' + attr(flexDate || viewDate) + '" aria-label="' + attr(t.title + (done ? ', done by ' + who : '')) + '">' + stamp + '</button>' +
      '<div class="info"><div class="title">' + esc(t.title) + '</div><div class="meta">' +
      (t.freq !== 'daily' ? '<span class="tag freq-' + t.freq + '">' + t.freq + '</span>' : '') +
      (m ? '<span class="who" title="Assigned to ' + attr(m.name) + '">' + avatarHtml(m, 'xs') + '<span class="tiny">for</span> ' + esc(m.name) + '</span>' : (t.freq === 'daily' ? '<span class="tiny">anyone</span>' : '')) +
      (done ? '<span>· done by ' + esc(who) + esc(when) + '</span>' : '') +
      '</div></div></li>';
  }
  function visible(t) {
    if (!onlyMine || !me) return true;
    return t.assignee === me || !t.assignee;
  }
  function renderToday() {
    var isToday = viewDate === today, days = store.listDays(), day = store.getDay(viewDate) || { date: viewDate, scheduled: [], checks: {} };
    var sched = scheduledFor(viewDate);
    var checks = day.checks || {};
    var score = L.scoreDay({ scheduled: sched, checks: checks });
    var st = L.streak(days, tasks(), today);
    var wk = L.weekDays(L.weekStartKey(viewDate, weekStart())), mo = L.monthDays(viewDate);
    var wr = L.periodRollup(days, tasks(), wk, 'weekly', viewDate), mr = L.periodRollup(days, tasks(), mo, 'monthly', viewDate);
    var pct = score.percent == null ? 0 : score.percent, circ = 2 * Math.PI * 46;

    var h = '<div id="recap" class="hidden"></div>';
    h += '<div class="card"><div class="today-head">' +
      '<button class="btn icon" data-action="nav-day" data-n="-1" aria-label="Previous day">‹</button>' +
      '<div class="title"><h1>' + esc(L.describeDay(viewDate, today)) + '</h1><div class="tiny">' + esc(L.WEEKDAYS[L.weekdayOf(viewDate)]) + ', ' + esc(L.shortDate(viewDate)) + (isToday ? '' : ' · <a href="#today" data-action="nav-today">back to today</a>') + '</div></div>' +
      '<button class="btn icon" data-action="nav-day" data-n="1" aria-label="Next day"' + (viewDate >= today ? ' disabled' : '') + '>›</button></div>';
    h += '<div class="progress" style="margin-top:12px">' +
      '<svg class="ring" viewBox="0 0 110 110" role="img" aria-label="' + (score.percent == null ? 'No chores' : score.percent + ' percent done') + '"><circle class="track" cx="55" cy="55" r="46"/><circle class="fill" cx="55" cy="55" r="46" stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + (circ * (1 - pct / 100)).toFixed(1) + '"/><text x="55" y="55">' + (score.percent == null ? '–' : score.percent + '%') + '</text></svg>' +
      '<div class="stack" style="gap:6px"><div class="big">' + score.done + ' of ' + score.total + ' done</div>' +
      '<div class="streak">🔥 ' + st.current + '-day streak <span class="tiny">(best ' + st.best + ')</span></div>' +
      '<div class="tiny">Week: ' + wr.flexDone + '/' + wr.flexTotal + ' weekly chores · Month: ' + mr.flexDone + '/' + mr.flexTotal + ' monthly</div></div></div></div>';

    if (config.members.length) {
      var tallies = L.personTallies([day]);
      h += '<div class="card"><div class="row between"><h2>I\'m checking as</h2>' + (me ? '<label class="row small"><input type="checkbox" data-action="only-mine"' + (onlyMine ? ' checked' : '') + '> Only my chores</label>' : '') + '</div><div class="chips">' +
        config.members.map(function (m) { return memberChip(m, me === m.id, tallies[m.id] || 0); }).join('') + memberChip(null, !me, tallies._anyone || 0) + '</div></div>';
    }

    var daily = sched.filter(visible);
    h += '<div class="card"><h2>' + (isToday ? 'Today' : L.describeDay(viewDate, today)) + '\'s chores <span class="tiny">' + score.dailyDone + '/' + score.dailyTotal + '</span></h2>';
    h += daily.length ? '<ul class="chore-list">' + daily.map(function (t) { return choreItem(t, checks[t.id]); }).join('') + '</ul>' : '<div class="empty"><div class="ico">🌤️</div>No daily chores scheduled. <a href="#chores">Add some</a>.</div>';
    // daily chores checked that day but no longer scheduled
    Object.keys(checks).forEach(function (id) {
      var c = checks[id]; if (!c || c.freq !== 'daily') return;
      if (sched.some(function (s) { return s.id === id; })) return;
      h += '<ul class="chore-list" style="margin-top:6px">' + choreItem({ id: id, title: c.title || 'Chore', freq: 'daily', assignee: null }, c) + '</ul>';
    });
    h += '</div>';

    function flexSection(freq, label, roll) {
      var list = tasks().filter(function (t) { return t.freq === freq && visible(t); });
      var extra = Object.keys(roll.flexDoneMap).filter(function (id) { return !tasks().some(function (t) { return t.id === id; }); });
      if (!list.length && !extra.length) return '';
      var out = '<div class="card"><h2>' + label + ' <span class="tiny">' + roll.flexDone + '/' + roll.flexTotal + ' · can be done any day</span></h2><ul class="chore-list">';
      out += list.map(function (t) { var d = roll.flexDoneMap[t.id]; var c = d ? (store.getDay(d.date).checks || {})[t.id] : null; return choreItem(t, c, d ? d.date : null); }).join('');
      out += extra.map(function (id) { var d = roll.flexDoneMap[id]; var c = (store.getDay(d.date).checks || {})[id]; return choreItem({ id: id, title: d.title || 'Chore', freq: freq, assignee: null }, c, d.date); }).join('');
      return out + '</ul></div>';
    }
    h += flexSection('weekly', 'This week', wr);
    h += flexSection('monthly', 'This month', mr);

    var b = L.badges(st.best), icons = ['🥉', '🥈', '🥇', '🏆'];
    h += '<div class="card"><h2>Badges</h2><div class="badges">' + b.map(function (x, i) { return '<div class="badge' + (x.earned ? ' earned' : '') + '"><span class="ico">' + icons[i] + '</span>' + x.days + ' days</div>'; }).join('') + '</div><div class="tiny" style="margin-top:8px">Earned by keeping a 100% streak. Days with nothing scheduled don\'t break it.</div></div>';
    return h;
  }

  function renderHistory() {
    var days = store.listDays(), keys = [];
    for (var i = 29; i >= 0; i--) keys.push(L.addDays(today, -i));
    var pts = keys.map(function (k) { var d = days[k]; var s = d ? L.scoreDay(d) : null; var st = L.dayStatus(days, tasks(), k); return { k: k, s: s, st: st }; });
    var W = 360, H = 150, padL = 32, padB = 20, padT = 6, bw = (W - padL - 4) / 30, gap = 2;
    var svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Daily completion over the last 30 days">';
    [0, 50, 100].forEach(function (v) { var y = padT + (H - padT - padB) * (1 - v / 100); svg += '<line class="grid" x1="' + padL + '" x2="' + W + '" y1="' + y + '" y2="' + y + '"/><text class="lbl" x="0" y="' + (y + 3) + '">' + v + '%</text>'; });
    pts.forEach(function (p, i) {
      var x = padL + i * bw + gap / 2, w = bw - gap, base = H - padB;
      var val = p.s && p.s.total ? p.s.percent : null;
      if (val == null) { svg += '<rect class="bar na" x="' + x + '" y="' + (base - 5) + '" width="' + w + '" height="5" rx="2"/>'; }
      else { var hgt = Math.max(3, (H - padT - padB) * val / 100), cls = val === 100 ? '' : val >= 50 ? ' mid' : ' low'; svg += '<rect class="bar' + cls + '" x="' + x + '" y="' + (base - hgt) + '" width="' + w + '" height="' + hgt + '" rx="3"/>'; }
      if (i === 0 || i === 14 || i === 29) svg += '<text class="lbl" x="' + (x + w / 2) + '" y="' + (H - 5) + '" text-anchor="' + (i === 0 ? 'start' : i === 29 ? 'end' : 'middle') + '">' + L.shortDate(p.k).replace(' ', ' ') + '</text>';
      var tip = L.describeDay(p.k, today) + ': ' + (val == null ? (p.st === 'skip' ? 'nothing scheduled' : 'not logged') : val + '% (' + p.s.done + ' of ' + p.s.total + ')');
      svg += '<rect class="hit" x="' + (padL + i * bw) + '" y="0" width="' + bw + '" height="' + H + '" data-tip="' + attr(tip) + '"><title>' + esc(tip) + '</title></rect>';
    });
    svg += '</svg>';

    var st = L.streak(days, tasks(), today);
    var wk = L.weekDays(L.weekStartKey(today, weekStart())), wr = L.periodRollup(days, tasks(), wk, 'weekly', today);
    var mr = L.periodRollup(days, tasks(), L.monthDays(today), 'monthly', today);
    var champ = L.champion(wr.byPerson), cm = champ ? member(champ.id) : null;

    var h = '<div class="card"><h2>Last 30 days</h2><div class="chart-wrap">' + svg + '<div class="tooltip hidden" id="tip"></div></div>' +
      '<div class="legend-note" style="margin-top:6px"><span style="--sw:var(--bar)">100%</span><span style="--sw:var(--warn)">50–99%</span><span style="--sw:var(--bad)">under 50%</span><span class="na">not logged</span></div></div>';
    h += '<div class="card"><h2>This week</h2><div class="stats">' +
      '<div class="stat"><div class="v">' + (wr.avgDaily == null ? '–' : wr.avgDaily + '%') + '</div><div class="k">avg daily score (' + wr.loggedDays + ' days logged)</div></div>' +
      '<div class="stat"><div class="v">' + wr.flexDone + '/' + wr.flexTotal + '</div><div class="k">weekly chores done</div></div>' +
      '<div class="stat"><div class="v">🔥 ' + st.current + '</div><div class="k">current streak (best ' + st.best + ')</div></div>' +
      '<div class="stat"><div class="v">' + (cm ? esc(cm.emoji + ' ' + cm.name) : '–') + '</div><div class="k">' + (cm ? 'chore champion, ' + champ.count + ' checked off' : 'chore champion (no leader yet)') + '</div></div></div>';
    if (config.members.length) {
      h += '<div class="chips" style="margin-top:12px">' + config.members.map(function (m) { return '<span class="chip" style="--c:' + attr(m.color) + '"><span aria-hidden="true">' + esc(m.emoji) + '</span>' + esc(m.name) + '<span class="count">' + (wr.byPerson[m.id] || 0) + '</span></span>'; }).join('') + '</div>';
    }
    h += '</div>';
    h += '<div class="card"><h2>This month</h2><div class="stats">' +
      '<div class="stat"><div class="v">' + (mr.avgDaily == null ? '–' : mr.avgDaily + '%') + '</div><div class="k">avg daily score (' + mr.loggedDays + ' days logged)</div></div>' +
      '<div class="stat"><div class="v">' + mr.flexDone + '/' + mr.flexTotal + '</div><div class="k">monthly chores done</div></div></div></div>';

    h += '<div class="card"><h2>Day by day</h2><ul class="day-list">';
    pts.slice().reverse().forEach(function (p) {
      var val = p.s && p.s.total ? p.s.percent : null;
      var lines = [];
      if (p.s) Object.keys(days[p.k].checks || {}).forEach(function (id) { var c = days[p.k].checks[id]; if (!c) return; var w = completer(c); lines.push('<span class="logline">' + (w.color ? avatarHtml(w, 'xs') : '<span class="avatar xs" aria-hidden="true">✓</span>') + '<span>' + esc((c.title || 'Chore')) + ' <span class="tiny">' + esc(w.name) + ' · ' + esc(timeOf(c.at)) + (c.freq !== 'daily' ? ' · ' + c.freq : '') + '</span></span></span>'); });
      h += '<li><details><summary><div><div>' + esc(L.describeDay(p.k, today)) + ' <span class="tiny">' + esc(L.shortDate(p.k)) + '</span></div>' + (val == null ? '' : '<div class="minibar"><i style="width:' + val + '%"></i></div>') + '</div>' +
        '<span class="pct' + (val == null ? ' na' : '') + '">' + (val == null ? (p.st === 'skip' ? 'nothing scheduled' : 'not logged') : val + '% · ' + p.s.done + '/' + p.s.total) + '</span></summary>' +
        '<div class="body">' + (lines.length ? lines.join('') : 'Nothing checked off.') + (p.k < today ? ' <a href="#today" data-action="view-day" data-day="' + p.k + '">Edit this day</a>' : '') + '</div></details></li>';
    });
    h += '</ul></div>';
    return h;
  }

  function renderChores() {
    var groups = [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']];
    var h = '<div class="card"><div class="row between"><h2>Chores</h2><button class="btn primary sm" data-action="add-chore">+ Add chore</button></div><p class="tiny">Daily chores count toward each day\'s score. Weekly and monthly chores can be done on any day and count toward the day they\'re completed.</p></div>';
    groups.forEach(function (g) {
      var list = tasks().filter(function (t) { return t.freq === g[0]; });
      h += '<div class="card"><h2>' + g[1] + ' <span class="tiny">' + list.length + '</span></h2>';
      if (!list.length) { h += '<div class="empty small">None yet.</div></div>'; return; }
      h += '<ul class="edit-list">' + list.map(function (t, i) {
        var m = t.assignee ? member(t.assignee) : null;
        var days = (t.freq === 'daily' && t.days && t.days.length && t.days.length < 7) ? t.days.slice().sort().map(function (d) { return L.WEEKDAYS[d]; }).join(' ') : '';
        return '<li><span class="avatar" style="--c:' + attr(m ? m.color : 'var(--card-2)') + '" title="' + attr(m ? m.name : 'Anyone') + '">' + esc(m ? m.emoji : '👥') + '</span>' +
          '<div><div style="font-weight:600">' + esc(t.title) + '</div><div class="tiny">' + esc(m ? m.name : 'Anyone') + (days ? ' · ' + days : '') + '</div></div>' +
          '<div class="actions"><button class="btn" data-action="move-chore" data-id="' + attr(t.id) + '" data-n="-1" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>↑</button><button class="btn" data-action="move-chore" data-id="' + attr(t.id) + '" data-n="1" aria-label="Move down"' + (i === list.length - 1 ? ' disabled' : '') + '>↓</button><button class="btn" data-action="edit-chore" data-id="' + attr(t.id) + '" aria-label="Edit">✎</button></div></li>';
      }).join('') + '</ul></div>';
    });
    return h;
  }

  function renderFamily() {
    var h = '<div class="card"><div class="row between"><h2>Family members</h2><button class="btn primary sm" data-action="add-member">+ Add</button></div>';
    h += config.members.length ? '<ul class="edit-list">' + config.members.map(function (m) {
      return '<li><span class="avatar" style="--c:' + attr(m.color) + '">' + esc(m.emoji) + '</span><div style="font-weight:600">' + esc(m.name) + '</div><div class="actions"><button class="btn" data-action="edit-member" data-id="' + attr(m.id) + '" aria-label="Edit ' + attr(m.name) + '">✎</button></div></li>';
    }).join('') + '</ul>' : '<div class="empty small">No members yet. Add the family so chores can be assigned and credited.</div>';
    h += '</div>';

    h += '<div class="card"><h2>Settings</h2><div class="stack">' +
      '<label class="field"><span>Family name</span><input type="text" data-setting="familyName" value="' + attr(config.familyName) + '" maxlength="40"></label>' +
      '<label class="field"><span>Week starts on</span><select data-setting="weekStart"><option value="0"' + (weekStart() === 0 ? ' selected' : '') + '>Sunday</option><option value="1"' + (weekStart() === 1 ? ' selected' : '') + '>Monday</option></select></label>' +
      '<label class="field"><span>Appearance</span><select data-setting="theme"><option value="">Match device</option><option value="light"' + (theme() === 'light' ? ' selected' : '') + '>Light</option><option value="dark"' + (theme() === 'dark' ? ' selected' : '') + '>Dark</option></select></label></div></div>';

    h += '<div class="card"><h2>Sync across phones</h2>';
    if (store.mode === 'sync') {
      var link = location.origin + location.pathname + '#join=' + store.code;
      h += '<p class="small">This family is shared. Anyone who opens the invite link joins it. <strong>Don\'t post the link publicly</strong>: whoever has it can see and edit your chores.</p>' +
        '<div class="code block" id="inviteLink">' + esc(link) + '</div>' +
        '<div class="row" style="margin-top:10px"><button class="btn primary" data-action="copy-link">Copy invite link</button><button class="btn" data-action="share-link">Share…</button><button class="btn danger" data-action="leave-family">Leave family on this device</button></div>' +
        '<p class="tiny">Family code: <code>' + esc(store.code) + '</code></p>';
    } else {
      if (store.syncError) h += '<div class="banner err" style="margin-bottom:10px"><span>Sync is not working: ' + esc(store.syncError) + '</span><button class="btn sm" data-action="retry-sync">Retry</button></div>';
      if (!Sync.hasFirebaseConfig()) {
        h += '<p class="small">Right now everything is saved on this device only. To let everyone check chores off from their own phone, set up a free Firebase project (about 10 minutes) and paste its config into <code>js/firebase-config.js</code>. The README walks through it step by step.</p>';
        if (Sync.getCode()) h += '<div class="row" style="margin-top:8px"><button class="btn danger sm" data-action="leave-family">Forget saved family code</button></div>';
      } else {
        h += '<p class="small">Create a family to upload this device\'s chores and history to the shared database, or join one with a code from another phone.</p>' +
          '<div class="row" style="margin-top:8px"><button class="btn primary" data-action="create-family">Create a shared family</button><button class="btn" data-action="join-family">Join with a code</button></div>';
      }
    }
    h += '</div>';

    var backups = Sync.listBackups();
    h += '<div class="card"><h2>Backup</h2><div class="row"><button class="btn" data-action="export">Download backup (JSON)</button><label class="btn">Restore from file<input type="file" accept="application/json,.json" data-action="import" class="sr-only"></label></div>' +
      (backups.length ? '<p class="tiny" style="margin-top:8px">' + backups.length + ' automatic local backup' + (backups.length > 1 ? 's' : '') + ' saved on this device from before joining a family. <button class="btn sm" data-action="export-backup">Download latest</button></p>' : '') +
      (store.mode === 'local' ? '<p class="tiny" style="margin-top:10px"><button class="btn danger sm" data-action="reset">Erase everything on this device</button></p>' : '') + '</div>';
    h += '<p class="tiny" style="text-align:center">Family Chores · data stays ' + (store.mode === 'sync' ? 'in your own Firebase project' : 'on this device') + '. Add to your phone\'s home screen for an app-like feel.</p>';
    return h;
  }
  function theme() { try { return localStorage.getItem('fc:theme') || ''; } catch (e) { return ''; } }
  function applyTheme() { var t = theme(); if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); }

  /* ---------- chart tooltip ---------- */
  function wireChart() {
    var wrap = $('.chart-wrap'), tip = $('#tip'); if (!wrap || !tip) return;
    wrap.addEventListener('mousemove', function (e) {
      var r = e.target.closest('.hit'); if (!r) { tip.classList.add('hidden'); return; }
      var b = wrap.getBoundingClientRect(), rb = r.getBoundingClientRect();
      tip.textContent = r.dataset.tip; tip.style.left = (rb.left - b.left + rb.width / 2) + 'px'; tip.style.top = (e.clientY - b.top) + 'px'; tip.classList.remove('hidden');
    });
    wrap.addEventListener('mouseleave', function () { tip.classList.add('hidden'); });
  }

  /* ---------- events ---------- */
  function onChange(e) {
    var el = e.target;
    if (el.dataset.action === 'only-mine') { onlyMine = el.checked; render(); return; }
    if (el.dataset.action === 'import') { importFile(el.files[0]); return; }
    var k = el.dataset.setting;
    if (k === 'familyName') { config.familyName = el.value.trim().slice(0, 40) || 'Our Family'; store.setConfig(config); return; }
    if (k === 'weekStart') { config.settings = config.settings || {}; config.settings.weekStart = Number(el.value) || 0; store.setConfig(config).then(render); return; }
    if (k === 'theme') { try { if (el.value) localStorage.setItem('fc:theme', el.value); else localStorage.removeItem('fc:theme'); } catch (x) { } applyTheme(); return; }
  }
  function onClick(e) {
    var el = e.target.closest('[data-action]'); if (!el) return;
    var a = el.dataset.action, id = el.dataset.id;
    if (a === 'toggle') { e.preventDefault(); return toggle(id, el.dataset.freq, el.dataset.date, el.getAttribute('aria-checked') === 'true'); }
    if (a === 'pick-me') { me = id || null; try { if (me) localStorage.setItem('fc:me', me); else localStorage.removeItem('fc:me'); } catch (x) { } if (!me) onlyMine = false; return render(); }
    if (a === 'nav-day') { var nd = L.addDays(viewDate, Number(el.dataset.n)); if (nd <= today) { viewDate = nd; render(); } return; }
    if (a === 'nav-today') { viewDate = today; return; }
    if (a === 'view-day') { viewDate = el.dataset.day; return; }
    if (a === 'dismiss-recap') { try { localStorage.setItem('fc:recapSeen', el.dataset.day); } catch (x) { } $('#recap').classList.add('hidden'); return; }
    if (a === 'add-chore') return choreForm(null);
    if (a === 'edit-chore') return choreForm(tasks().filter(function (t) { return t.id === id; })[0]);
    if (a === 'move-chore') return moveChore(id, Number(el.dataset.n));
    if (a === 'add-member') return memberForm(null);
    if (a === 'edit-member') return memberForm(member(id));
    if (a === 'export') return download(store.exportAll(), 'family-chores-' + today + '.json');
    if (a === 'export-backup') { var b = Sync.listBackups(); if (b.length) { try { download(JSON.parse(localStorage.getItem(b[b.length - 1])), 'family-chores-backup.json'); } catch (x) { toast('Backup unreadable'); } } return; }
    if (a === 'reset') return resetAll();
    if (a === 'create-family') return createFamily();
    if (a === 'join-family') return promptJoin('');
    if (a === 'leave-family') { if (confirm('Stop syncing on this device? Shared data stays in the family; this device goes back to its own local list.')) { Sync.leaveFamily(); location.reload(); } return; }
    if (a === 'retry-sync') { location.reload(); return; }
    if (a === 'copy-link') { var txt = $('#inviteLink').textContent; (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast('Invite link copied'); }, function () { prompt('Copy this link:', txt); }); return; }
    if (a === 'share-link') { var t2 = $('#inviteLink').textContent; if (navigator.share) navigator.share({ title: config.familyName + ' chores', url: t2 }).catch(function () { }); else prompt('Copy this link:', t2); return; }
  }

  function toggle(id, freq, date, isDone) {
    var t = tasks().filter(function (x) { return x.id === id; })[0];
    if (isDone) {
      store.setCheck(date, id, null, date === today ? L.scheduledDaily(tasks(), today) : undefined).then(render);
      return;
    }
    var before = L.scoreDay({ scheduled: scheduledFor(viewDate), checks: (store.getDay(viewDate) || {}).checks || {} }).percent;
    var mm = me ? member(me) : null;
    var check = { by: me, byName: mm ? mm.name : null, emoji: mm ? mm.emoji : null, color: mm ? mm.color : null, at: new Date().toISOString(), title: t ? t.title : 'Chore', freq: freq };
    store.setCheck(viewDate, id, check, scheduledFor(viewDate)).then(function () {
      render();
      var after = L.scoreDay({ scheduled: scheduledFor(viewDate), checks: (store.getDay(viewDate) || {}).checks || {} }).percent;
      if (after === 100 && before !== 100) { confetti(); toast(viewDate === today ? '🎉 Everything done today!' : '🎉 That day is complete!'); }
    });
  }

  function choreForm(t) {
    var isNew = !t; t = t || { id: S.uid(), title: '', freq: 'daily', days: [], assignee: null };
    var html = '<h2>' + (isNew ? 'Add a chore' : 'Edit chore') + '</h2>' +
      '<label class="field"><span>Name</span><input type="text" name="title" required maxlength="60" value="' + attr(t.title) + '"></label>' +
      '<label class="field"><span>How often</span><select name="freq"><option value="daily"' + (t.freq === 'daily' ? ' selected' : '') + '>Daily</option><option value="weekly"' + (t.freq === 'weekly' ? ' selected' : '') + '>Weekly (any day that week)</option><option value="monthly"' + (t.freq === 'monthly' ? ' selected' : '') + '>Monthly (any day that month)</option></select></label>' +
      '<div class="field" id="daysField"' + (t.freq !== 'daily' ? ' style="display:none"' : '') + '><span>Which days <span class="tiny">(leave all unchecked for every day)</span></span><div class="day-picks">' + L.WEEKDAYS.map(function (d, i) { return '<label><input type="checkbox" name="days" value="' + i + '"' + ((t.days || []).indexOf(i) >= 0 ? ' checked' : '') + '>' + d + '</label>'; }).join('') + '</div></div>' +
      '<label class="field"><span>Assigned to</span><select name="assignee"><option value="">Anyone</option>' + config.members.map(function (m) { return '<option value="' + attr(m.id) + '"' + (t.assignee === m.id ? ' selected' : '') + '>' + esc(m.emoji + ' ' + m.name) + '</option>'; }).join('') + '</select></label>' +
      '<div class="row between">' + (isNew ? '<span></span>' : '<button class="btn danger" value="delete" formnovalidate>Delete</button>') + '<span class="row"><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn primary" value="ok">Save</button></span></div>';
    openDialog(html, function (fd, form, btn) {
      if (btn && btn.value === 'delete') {
        if (!confirm('Delete "' + t.title + '"? Past check-offs stay in history.')) return false;
        config.tasks = tasks().filter(function (x) { return x.id !== t.id; });
        store.setConfig(config).then(ensureToday).then(render); return;
      }
      var days = fd.getAll('days').map(Number), freq = fd.get('freq');
      var nt = { id: t.id, title: String(fd.get('title')).trim().slice(0, 60), freq: freq, assignee: fd.get('assignee') || null, days: freq === 'daily' && days.length && days.length < 7 ? days : [] };
      if (!nt.title) return false;
      if (isNew) config.tasks = tasks().concat([nt]); else config.tasks = tasks().map(function (x) { return x.id === t.id ? nt : x; });
      store.setConfig(config).then(ensureToday).then(render);
    });
    $('#dialogForm select[name=freq]').addEventListener('change', function (e) { $('#daysField').style.display = e.target.value === 'daily' ? '' : 'none'; });
  }
  function moveChore(id, n) {
    var all = tasks(), t = all.filter(function (x) { return x.id === id; })[0]; if (!t) return;
    var group = all.filter(function (x) { return x.freq === t.freq; }), gi = group.indexOf(t), gj = gi + n;
    if (gj < 0 || gj >= group.length) return;
    var i = all.indexOf(t), j = all.indexOf(group[gj]);
    all[i] = group[gj]; all[j] = t;
    config.tasks = all; store.setConfig(config).then(render);
  }
  function firstUnused(list, key) {
    var used = config.members.map(function (x) { return x[key]; });
    for (var i = 0; i < list.length; i++) if (used.indexOf(list[i]) < 0) return list[i];
    return list[config.members.length % list.length];
  }
  function memberForm(m) {
    var isNew = !m; m = m || { id: S.uid(), name: '', emoji: firstUnused(EMOJIS, 'emoji'), color: firstUnused(COLORS, 'color') };
    var usedEmoji = {}, usedColor = {};
    config.members.forEach(function (x) { if (x.id !== m.id) { usedEmoji[x.emoji] = x.name; usedColor[x.color] = x.name; } });
    var html = '<h2>' + (isNew ? 'Add a family member' : 'Edit ' + esc(m.name)) + '</h2>' +
      '<label class="field"><span>Name</span><input type="text" name="name" required maxlength="30" value="' + attr(m.name) + '"></label>' +
      '<div class="field"><span>Avatar <span class="tiny">(each person gets their own; greyed ones are taken)</span></span><div class="emoji-picks">' + EMOJIS.map(function (e) { var taken = usedEmoji[e]; return '<label class="' + (taken ? 'taken' : '') + '" title="' + attr(taken ? 'Used by ' + taken : '') + '"><input type="radio" name="emoji" value="' + e + '"' + (m.emoji === e ? ' checked' : '') + (taken ? ' disabled' : '') + '>' + e + '</label>'; }).join('') + '</div></div>' +
      '<div class="field"><span>Colour</span><div class="swatches">' + COLORS.map(function (c) { var taken = usedColor[c]; return '<label class="' + (taken ? 'taken' : '') + '" style="--c:' + c + '" title="' + attr(taken ? 'Used by ' + taken : '') + '"><input type="radio" name="color" value="' + c + '"' + (m.color === c ? ' checked' : '') + (taken ? ' disabled' : '') + '><span class="sr-only">' + c + '</span></label>'; }).join('') + '</div></div>' +
      '<div class="row small" style="gap:8px"><span class="muted">Preview:</span><span class="avatar lg" id="avPreview" style="--c:' + attr(m.color) + '">' + esc(m.emoji) + '</span></div>' +
      '<div class="row between">' + (isNew ? '<span></span>' : '<button class="btn danger" value="delete" formnovalidate>Remove</button>') + '<span class="row"><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn primary" value="ok">Save</button></span></div>';
    openDialog(html, function (fd, form, btn) {
      if (btn && btn.value === 'delete') {
        if (!confirm('Remove ' + m.name + '? Their chores become "Anyone"; history keeps their name.')) return false;
        config.members = config.members.filter(function (x) { return x.id !== m.id; });
        config.tasks = tasks().map(function (t) { return t.assignee === m.id ? Object.assign({}, t, { assignee: null }) : t; });
        if (me === m.id) me = null;
        store.setConfig(config).then(render); return;
      }
      var nm = { id: m.id, name: String(fd.get('name')).trim().slice(0, 30), emoji: fd.get('emoji') || m.emoji, color: fd.get('color') || m.color };
      if (!nm.name) return false;
      var clash = config.members.filter(function (x) { return x.id !== nm.id && x.emoji === nm.emoji && x.color === nm.color; })[0];
      if (clash) { toast(clash.name + ' already has that avatar. Pick a different icon or colour.'); return false; }
      if (isNew) config.members = config.members.concat([nm]); else config.members = config.members.map(function (x) { return x.id === m.id ? nm : x; });
      store.setConfig(config).then(render);
    });
    $('#dialogForm').addEventListener('change', function (e) {
      var f = $('#dialogForm'), pv = $('#avPreview'); if (!pv) return;
      var em = f.querySelector('input[name=emoji]:checked'), co = f.querySelector('input[name=color]:checked');
      if (em) pv.textContent = em.value; if (co) pv.style.setProperty('--c', co.value);
    });
  }

  function download(obj, name) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function importFile(file) {
    if (!file) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var data = JSON.parse(r.result);
        if (!data || data.app !== 'family-chores' || !data.config) throw new Error('Not a Family Chores backup');
        if (!confirm('Restore ' + Object.keys(data.days || {}).length + ' days and ' + (data.config.tasks || []).length + ' chores from this file? Existing chores and settings will be replaced; days are merged.')) return;
        store.importAll(data).then(function () { config = store.getConfig(); toast('Backup restored'); render(); });
      } catch (e) { toast('Could not restore: ' + e.message); }
    };
    r.readAsText(file);
  }
  function resetAll() {
    if (!confirm('Erase all chores, members and history on this device? Download a backup first if you want to keep it.')) return;
    if (prompt('Type ERASE to confirm') !== 'ERASE') return;
    store.wipe().then(function () { location.reload(); });
  }
  function createFamily() {
    if (!confirm('Create a shared family? This device\'s chores and history will be uploaded to your Firebase project, and you\'ll get an invite link for the rest of the family.')) return;
    toast('Creating family…');
    Sync.createFamily(store).then(function () { location.hash = '#family'; location.reload(); }, function (e) { showError('Could not create the family', e.message || String(e)); });
  }
  function promptJoin(code) {
    var html = '<h2>Join a family</h2><p class="small">Paste the family code (or open the invite link on this phone). Your current local list is backed up first.</p>' +
      '<label class="field"><span>Family code</span><input type="text" name="code" required autocomplete="off" spellcheck="false" value="' + attr(code) + '"></label>' +
      '<div class="row" style="justify-content:flex-end"><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn primary" value="ok">Join</button></div>';
    openDialog(html, function (fd) {
      var c = String(fd.get('code') || '').trim().toLowerCase().replace(/^.*#join=/, '');
      var local = store.mode === 'local' ? store : new S.LocalStore();
      Sync.joinFamily(c, local).then(function () { location.hash = '#today'; location.reload(); }, function (e) { setTimeout(function () { showError('Could not join', e.message || String(e)); }, 50); });
    });
    if (!config) { config = { familyName: 'Family Chores', members: [], tasks: [], settings: {} }; render(); config = null; }
  }

  /* ---------- confetti ---------- */
  function confetti() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var c = $('#confetti'), ctx = c.getContext('2d'); c.width = innerWidth; c.height = innerHeight;
    var ps = [], cols = ['#2a6f6a', '#c2553a', '#5b6fb5', '#b58b2a', '#8a4fa3', '#c75f8b'];
    for (var i = 0; i < 120; i++) ps.push({ x: c.width / 2 + (Math.random() - .5) * 200, y: c.height * 0.4, vx: (Math.random() - .5) * 14, vy: -Math.random() * 14 - 4, r: 4 + Math.random() * 4, col: cols[i % cols.length], a: Math.random() * 6, s: (Math.random() - .5) * .3 });
    var t0 = performance.now();
    (function frame(t) {
      var dt = (t - t0) / 1000; ctx.clearRect(0, 0, c.width, c.height);
      ps.forEach(function (p) { p.x += p.vx; p.y += p.vy; p.vy += .45; p.a += p.s; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.col; ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore(); });
      if (dt < 1.8) requestAnimationFrame(frame); else ctx.clearRect(0, 0, c.width, c.height);
    })(t0);
  }

  applyTheme();
  boot();
}());
