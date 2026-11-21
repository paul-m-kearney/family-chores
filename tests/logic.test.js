const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/logic.js');

const T = (id, freq, extra) => Object.assign({ id, title: id, freq }, extra || {});
const chk = (freq, by) => ({ by: by || null, at: '2026-01-01T10:00:00.000Z', title: 't', freq });

test('date keys use local time and survive year end, leap day, DST', () => {
  assert.equal(L.dateKey(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(L.addDays('2025-12-31', 1), '2026-01-01');
  assert.equal(L.addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(L.addDays('2024-02-29', 1), '2024-03-01');
  assert.equal(L.addDays('2026-03-08', 1), '2026-03-09'); // US DST start
  assert.equal(L.addDays('2026-11-01', 1), '2026-11-02'); // US DST end
  assert.equal(L.daysBetween('2026-01-01', '2026-01-31'), 30);
  assert.equal(L.daysInMonth('2024-02-10'), 29);
  assert.equal(L.daysInMonth('2026-02-10'), 28);
});

test('week starts respect Sunday vs Monday', () => {
  // 2026-11-16 is a Monday
  assert.equal(L.weekdayOf('2026-11-16'), 1);
  assert.equal(L.weekStartKey('2026-11-16', 0), '2026-11-15');
  assert.equal(L.weekStartKey('2026-11-16', 1), '2026-11-16');
  assert.equal(L.weekStartKey('2026-11-15', 1), '2026-11-09');
  assert.equal(L.weekDays('2026-11-15').length, 7);
  assert.equal(L.weekDays('2026-12-28')[6], '2027-01-03');
  assert.equal(L.monthDays('2026-02-14').length, 28);
  assert.equal(L.monthStartKey('2026-02-14'), '2026-02-01');
});

test('daily scheduling honours weekday restrictions', () => {
  const all = T('a', 'daily');
  const weekdays = T('b', 'daily', { days: [1, 2, 3, 4, 5] });
  const weekly = T('c', 'weekly');
  assert.equal(L.isScheduledDaily(all, '2026-11-15'), true);      // Sunday
  assert.equal(L.isScheduledDaily(weekdays, '2026-11-15'), false);
  assert.equal(L.isScheduledDaily(weekdays, '2026-11-16'), true);
  assert.equal(L.isScheduledDaily(weekly, '2026-11-16'), false);
  assert.deepEqual(L.scheduledDaily([all, weekdays, weekly], '2026-11-15').map(t => t.id), ['a']);
  assert.equal(L.sameIds([all, weekdays], [weekdays, all]), true);
  assert.equal(L.sameIds([all], [weekdays]), false);
});

test('scoreDay: daily chores count toward total, flexible chores only raise it', () => {
  const sched = [T('a', 'daily'), T('b', 'daily')];
  assert.deepEqual(L.scoreDay({ scheduled: sched, checks: {} }), { done: 0, total: 2, percent: 0, dailyTotal: 2, dailyDone: 0, flexDone: 0 });
  assert.equal(L.scoreDay({ scheduled: sched, checks: { a: chk('daily') } }).percent, 50);
  assert.equal(L.scoreDay({ scheduled: sched, checks: { a: chk('daily'), b: chk('daily') } }).percent, 100);
  // weekly chore done on a day with 1 of 2 dailies done: 2 of 3
  const s = L.scoreDay({ scheduled: sched, checks: { a: chk('daily'), w: chk('weekly') } });
  assert.deepEqual([s.done, s.total, s.percent], [2, 3, 67]);
  // weekly chore undone never appears, so it can't lower the score
  assert.equal(L.scoreDay({ scheduled: sched, checks: { a: chk('daily'), b: chk('daily') } }).percent, 100);
  // daily chore checked but later deleted from schedule still counts
  assert.deepEqual(L.scoreDay({ scheduled: [T('a', 'daily')], checks: { z: chk('daily') } }), { done: 1, total: 2, percent: 50, dailyTotal: 2, dailyDone: 1, flexDone: 0 });
  // empty day
  assert.equal(L.scoreDay({ scheduled: [], checks: {} }).percent, null);
  assert.equal(L.scoreDay(null).total, 0);
});

test('streak counts consecutive 100% days, skips empty days, breaks on gaps', () => {
  const tasks = [T('a', 'daily')];
  const full = { scheduled: [T('a', 'daily')], checks: { a: chk('daily') } };
  const zero = { scheduled: [T('a', 'daily')], checks: {} };
  const days = { '2026-11-12': full, '2026-11-13': full, '2026-11-14': full, '2026-11-15': zero, '2026-11-16': full };
  assert.deepEqual(L.streak(days, tasks, '2026-11-16'), { current: 1, best: 3 });
  // today unfinished does not break the run
  const d2 = { '2026-11-14': full, '2026-11-15': full, '2026-11-16': zero };
  assert.deepEqual(L.streak(d2, tasks, '2026-11-16'), { current: 2, best: 2 });
  // a not-logged day with scheduled work breaks the streak
  const d3 = { '2026-11-13': full, '2026-11-15': full, '2026-11-16': full };
  assert.deepEqual(L.streak(d3, tasks, '2026-11-16'), { current: 2, best: 2 });
  // a not-logged day with nothing scheduled (weekday-only chore, weekend gap) does not break it
  const wk = [T('a', 'daily', { days: [1, 2, 3, 4, 5] })];
  const d4 = { '2026-11-13': full, '2026-11-16': full }; // Fri, then Mon
  assert.deepEqual(L.streak(d4, wk, '2026-11-16'), { current: 2, best: 2 });
  assert.deepEqual(L.streak({}, tasks, '2026-11-16'), { current: 0, best: 0 });
  assert.deepEqual(L.badges(7).map(b => b.earned), [true, true, false, false]);
});

test('period rollups: average daily score and flexible chores done once per period', () => {
  const tasks = [T('a', 'daily'), T('w1', 'weekly'), T('w2', 'weekly'), T('m1', 'monthly')];
  const days = {
    '2026-11-15': { scheduled: [T('a', 'daily')], checks: { a: chk('daily', 'mom'), w1: chk('weekly', 'kid') } },
    '2026-11-16': { scheduled: [T('a', 'daily')], checks: { m1: chk('monthly', 'mom') } },
    '2026-11-17': { scheduled: [T('a', 'daily')], checks: {} },
  };
  const week = L.weekDays('2026-11-15');
  const r = L.periodRollup(days, tasks, week, 'weekly', '2026-11-17');
  assert.equal(r.avgDaily, Math.round((100 + 50 + 0) / 3));
  assert.equal(r.loggedDays, 3);
  assert.deepEqual([r.flexDone, r.flexTotal], [1, 2]);
  assert.equal(r.flexDoneMap.w1.by, 'kid');
  assert.deepEqual(r.byPerson, { mom: 2, kid: 1 });
  // future days ignored
  const r2 = L.periodRollup(days, tasks, week, 'weekly', '2026-11-15');
  assert.equal(r2.loggedDays, 1);
  const m = L.periodRollup(days, tasks, L.monthDays('2026-11-16'), 'monthly', '2026-11-17');
  assert.deepEqual([m.flexDone, m.flexTotal], [1, 1]);
});

test('person tallies and champion', () => {
  const dl = [{ checks: { a: chk('daily', 'x'), b: chk('daily', 'y') } }, { checks: { c: chk('daily', 'x'), d: chk('daily', null) } }];
  assert.deepEqual(L.personTallies(dl), { x: 2, y: 1, _anyone: 1 });
  assert.deepEqual(L.champion({ x: 2, y: 1 }), { id: 'x', count: 2 });
  assert.equal(L.champion({ x: 2, y: 2 }), null);
  assert.equal(L.champion({ _anyone: 5 }), null);
});

test('describeDay', () => {
  assert.equal(L.describeDay('2026-11-16', '2026-11-16'), 'Today');
  assert.equal(L.describeDay('2026-11-15', '2026-11-16'), 'Yesterday');
  assert.equal(L.describeDay('2026-11-10', '2026-11-16'), 'Tue Nov 10');
});

test('points: 1/3/5 by frequency, per person, derived from check-offs', () => {
  const days = {
    '2026-11-15': { scheduled: [], checks: { a: chk('daily', 'mom'), w1: chk('weekly', 'kid') } },
    '2026-11-16': { scheduled: [], checks: { m1: chk('monthly', 'mom'), b: chk('daily', 'kid'), c: chk('daily', null) } },
  };
  const e = L.pointsEarned(days, {});
  assert.deepEqual(e.mom, { total: 6, daily: 1, weekly: 0, monthly: 5, count: 2 });
  assert.deepEqual(e.kid, { total: 4, daily: 1, weekly: 3, monthly: 0, count: 2 });
  assert.equal(e._anyone.total, 1);
  // custom values and a date window
  assert.equal(L.pointsEarned(days, { points: { daily: 2, weekly: 10, monthly: 0 } }).kid.total, 12);
  assert.equal(L.pointsEarned(days, {}, '2026-11-16', '2026-11-16').kid.total, 1);
  assert.equal(L.pointsFor('weekly', {}), 3);
  assert.equal(L.pointsFor('weekly', { points: { weekly: '7' } }), 7);
  assert.equal(L.pointsFor('weekly', { points: { weekly: 'junk' } }), 3);
});

test('points: balance = earned + bonuses - exchanges; unchecking takes points back', () => {
  const days = { '2026-11-16': { scheduled: [], checks: { a: chk('daily', 'mom'), w: chk('weekly', 'mom') } } };
  const cfg = { settings: {}, redemptions: [
    { id: '1', memberId: 'mom', delta: -3, note: 'candy', at: 'x' },
    { id: '2', memberId: 'mom', delta: 2, note: 'bonus', at: 'x' },
    { id: '3', memberId: 'kid', delta: -1, note: 'other kid', at: 'x' },
  ] };
  assert.deepEqual(L.pointsBalance(days, cfg, 'mom'), { earned: 4, redeemed: 3, bonus: 2, balance: 3 });
  assert.deepEqual(L.pointsBalance(days, cfg, 'kid'), { earned: 0, redeemed: 1, bonus: 0, balance: -1 });
  delete days['2026-11-16'].checks.w;
  assert.equal(L.pointsBalance(days, cfg, 'mom').balance, 0);
  assert.equal(L.pointsBalance(days, { settings: {} }, 'nobody').balance, 0);
});

test('reward tiers default to 25/50/100, are sortable and editable, status marks reached tiers', () => {
  assert.deepEqual(L.rewardTiers({}).map(t => t.points), [25, 50, 100]);
  assert.deepEqual(L.rewardTiers({ rewards: [{ points: '60', label: 'Movie' }, { points: 10, label: 'Sticker' }, { points: 0, label: 'bad' }] }).map(t => t.points + t.label), ['10Sticker', '60Movie']);
  const st = L.rewardStatus(30, L.rewardTiers({}));
  assert.deepEqual(st.map(t => [t.reached, t.remaining]), [[true, 0], [false, 20], [false, 70]]);
});
