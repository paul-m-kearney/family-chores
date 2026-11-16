/* Family Chores: pure logic. No DOM, no storage. Runs in the browser and in Node (tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ChoreLogic = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MILESTONES = [3, 7, 14, 30];
  var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function pad2(n) { return String(n).padStart(2, '0'); }

  /* Dates are keyed by LOCAL year-month-day. Never toISOString(), which shifts to UTC. */
  function dateKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function parseKey(k) { var p = k.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function addDays(k, n) { var d = parseKey(k); d.setDate(d.getDate() + n); return dateKey(d); }
  function todayKey(now) { return dateKey(now || new Date()); }
  function weekdayOf(k) { return parseKey(k).getDay(); }
  function daysBetween(a, b) { return Math.round((parseKey(b) - parseKey(a)) / 86400000); }

  function weekStartKey(k, weekStart) {
    var ws = weekStart || 0;
    var diff = (weekdayOf(k) - ws + 7) % 7;
    return addDays(k, -diff);
  }
  function weekDays(startKey) { var out = []; for (var i = 0; i < 7; i++) out.push(addDays(startKey, i)); return out; }
  function monthKey(k) { return k.slice(0, 7); }
  function monthStartKey(k) { return k.slice(0, 7) + '-01'; }
  function daysInMonth(k) { var p = k.split('-').map(Number); return new Date(p[0], p[1], 0).getDate(); }
  function monthDays(k) { var s = monthStartKey(k), n = daysInMonth(k), out = []; for (var i = 0; i < n; i++) out.push(addDays(s, i)); return out; }

  function describeDay(k, today) {
    if (k === today) return 'Today';
    if (k === addDays(today, -1)) return 'Yesterday';
    if (k === addDays(today, 1)) return 'Tomorrow';
    var d = parseKey(k);
    return WEEKDAYS[d.getDay()] + ' ' + MONTHS[d.getMonth()] + ' ' + d.getDate();
  }
  function shortDate(k) { var d = parseKey(k); return MONTHS[d.getMonth()] + ' ' + d.getDate(); }

  /* Scheduling */
  function isScheduledDaily(task, k) {
    if (!task || task.freq !== 'daily') return false;
    if (!task.days || task.days.length === 0 || task.days.length === 7) return true;
    return task.days.indexOf(weekdayOf(k)) !== -1;
  }
  function snapshotTask(t) { return { id: t.id, title: t.title, freq: t.freq, assignee: t.assignee || null }; }
  function scheduledDaily(tasks, k) {
    return (tasks || []).filter(function (t) { return isScheduledDaily(t, k); }).map(snapshotTask);
  }
  function sameIds(a, b) {
    var x = (a || []).map(function (t) { return t.id; }).sort().join(',');
    var y = (b || []).map(function (t) { return t.id; }).sort().join(',');
    return x === y;
  }

  /* Scoring. Daily chores scheduled that day count toward the total whether or not they are done.
     Weekly and monthly chores count toward the day they are completed, so they can raise a day's
     score but never lower it. */
  function scoreDay(day) {
    var scheduled = (day && day.scheduled) || [];
    var checks = (day && day.checks) || {};
    var ids = {};
    scheduled.forEach(function (s) { if (s.freq === 'daily') ids[s.id] = true; });
    var dailyDone = 0, flexDone = 0;
    Object.keys(checks).forEach(function (id) {
      var c = checks[id];
      if (!c) return;
      var freq = c.freq || (ids[id] ? 'daily' : 'weekly');
      if (freq === 'daily') { ids[id] = true; dailyDone++; } else { flexDone++; }
    });
    var dailyTotal = Object.keys(ids).length;
    var total = dailyTotal + flexDone;
    var done = dailyDone + flexDone;
    return {
      done: done, total: total,
      percent: total ? Math.round(100 * done / total) : null,
      dailyTotal: dailyTotal, dailyDone: dailyDone, flexDone: flexDone
    };
  }

  /* 'hit' = 100%, 'miss' = logged but under 100%, 'skip' = nothing to do, 'missing' = never logged. */
  function dayStatus(days, tasks, k) {
    var d = days[k];
    if (d) {
      var s = scoreDay(d);
      if (s.total === 0) return 'skip';
      return s.percent === 100 ? 'hit' : 'miss';
    }
    return scheduledDaily(tasks, k).length === 0 ? 'skip' : 'missing';
  }

  function earliestKey(days) {
    var keys = Object.keys(days || {}).sort();
    return keys.length ? keys[0] : null;
  }

  function streak(days, tasks, today) {
    var first = earliestKey(days);
    if (!first) return { current: 0, best: 0 };
    if (first > today) first = today;
    var current = 0, k = today, guard = 0;
    var t = dayStatus(days, tasks, today);
    if (t === 'miss' || t === 'missing') k = addDays(today, -1); /* today is unfinished, not failed */
    while (k >= first && guard++ < 4000) {
      var st = dayStatus(days, tasks, k);
      if (st === 'hit') current++;
      else if (st === 'miss' || st === 'missing') break;
      k = addDays(k, -1);
    }
    var best = 0, run = 0;
    k = first; guard = 0;
    while (k <= today && guard++ < 4000) {
      var s2 = dayStatus(days, tasks, k);
      if (s2 === 'hit') { run++; if (run > best) best = run; }
      else if (s2 === 'skip') { /* keep the run */ }
      else if (k === today) { /* today unfinished: pending, not a break */ }
      else run = 0;
      k = addDays(k, 1);
    }
    if (current > best) best = current;
    return { current: current, best: best };
  }

  function badges(best) {
    return MILESTONES.map(function (n) { return { days: n, earned: best >= n }; });
  }

  /* Rollup over a list of day keys (a week or a month). flexFreq is 'weekly' or 'monthly'. */
  function periodRollup(days, tasks, keys, flexFreq, today) {
    var sum = 0, n = 0, flexDone = {}, byPerson = {};
    keys.forEach(function (k) {
      if (k > today) return;
      var d = days[k]; if (!d) return;
      var s = scoreDay(d);
      if (s.total > 0) { sum += s.percent; n++; }
      Object.keys(d.checks || {}).forEach(function (id) {
        var c = d.checks[id]; if (!c) return;
        var who = c.by || '_anyone';
        byPerson[who] = (byPerson[who] || 0) + 1;
        if (c.freq === flexFreq && !flexDone[id]) flexDone[id] = { date: k, by: c.by || null, title: c.title };
      });
    });
    var ids = {};
    (tasks || []).forEach(function (t) { if (t.freq === flexFreq) ids[t.id] = true; });
    Object.keys(flexDone).forEach(function (id) { ids[id] = true; });
    return {
      avgDaily: n ? Math.round(sum / n) : null,
      loggedDays: n,
      flexDone: Object.keys(flexDone).length,
      flexTotal: Object.keys(ids).length,
      flexDoneMap: flexDone,
      byPerson: byPerson
    };
  }

  function personTallies(dayList) {
    var out = {};
    (dayList || []).forEach(function (d) {
      Object.keys((d && d.checks) || {}).forEach(function (id) {
        var c = d.checks[id]; if (!c) return;
        var who = c.by || '_anyone';
        out[who] = (out[who] || 0) + 1;
      });
    });
    return out;
  }

  function champion(tallies) {
    var best = null, n = 0, tie = false;
    Object.keys(tallies).forEach(function (id) {
      if (id === '_anyone') return;
      if (tallies[id] > n) { best = id; n = tallies[id]; tie = false; }
      else if (tallies[id] === n && n > 0) tie = true;
    });
    return (best && !tie) ? { id: best, count: n } : null;
  }

  return {
    MILESTONES: MILESTONES, WEEKDAYS: WEEKDAYS, MONTHS: MONTHS,
    pad2: pad2, dateKey: dateKey, parseKey: parseKey, addDays: addDays, todayKey: todayKey,
    weekdayOf: weekdayOf, daysBetween: daysBetween, weekStartKey: weekStartKey, weekDays: weekDays,
    monthKey: monthKey, monthStartKey: monthStartKey, daysInMonth: daysInMonth, monthDays: monthDays,
    describeDay: describeDay, shortDate: shortDate,
    isScheduledDaily: isScheduledDaily, scheduledDaily: scheduledDaily, snapshotTask: snapshotTask, sameIds: sameIds,
    scoreDay: scoreDay, dayStatus: dayStatus, streak: streak, badges: badges,
    periodRollup: periodRollup, personTallies: personTallies, champion: champion
  };
}));
