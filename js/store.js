/* Family Chores: storage back-ends behind one interface.
   LocalStore  = this device only (localStorage). Default, zero setup.
   FirestoreStore = shared across devices via Firebase Firestore (free Spark plan).
   Both expose: init(), getConfig(), setConfig(), getDay(), listDays(), setCheck(), patchDay(),
   onChange(), exportAll(), importAll(). Getters are synchronous reads from a cache so the UI
   can render without awaiting. */
(function (root) {
  'use strict';
  var PREFIX = 'fc:';
  var SYNC_KEY = 'fc:sync:code';
  var FIREBASE_VERSION = '10.14.1';

  function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
  function randomCode(len) {
    var chars = 'abcdefghjkmnpqrstuvwxyz23456789', out = '';
    var arr = new Uint8Array(len || 24);
    (root.crypto || root.msCrypto).getRandomValues(arr);
    for (var i = 0; i < arr.length; i++) out += chars[arr[i] % chars.length];
    return out;
  }
  function validCode(c) { return typeof c === 'string' && /^[a-z0-9]{16,64}$/.test(c); }

  function Emitter() { this.fns = []; }
  Emitter.prototype.on = function (f) { var fns = this.fns; fns.push(f); return function () { var i = fns.indexOf(f); if (i >= 0) fns.splice(i, 1); }; };
  Emitter.prototype.emit = function (x) { this.fns.slice().forEach(function (f) { try { f(x); } catch (e) { console.error(e); } }); };

  function emptyDay(key) { return { date: key, scheduled: [], checks: {} }; }

  /* ---------------- LocalStore ---------------- */
  function LocalStore(storage) {
    this.mode = 'local';
    this.ev = new Emitter();
    this._ls = storage || root.localStorage;
    this._cache = null;
    var self = this;
    if (root.addEventListener) {
      root.addEventListener('storage', function (e) {
        if (e.key && e.key.indexOf(PREFIX) === 0) { self._cache = null; self.ev.emit('remote'); }
      });
    }
  }
  LocalStore.prototype.init = function () { return Promise.resolve(this); };
  LocalStore.prototype._read = function (k) {
    try { var v = this._ls.getItem(PREFIX + k); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  };
  LocalStore.prototype._write = function (k, v) {
    this._ls.setItem(PREFIX + k, JSON.stringify(v)); this._cache = null; this.ev.emit('local');
  };
  LocalStore.prototype.getConfig = function () { return this._read('config'); };
  LocalStore.prototype.setConfig = function (cfg) { this._write('config', cfg); return Promise.resolve(); };
  LocalStore.prototype.getDay = function (key) { return this._read('day:' + key); };
  LocalStore.prototype.listDays = function () {
    if (this._cache) return this._cache;
    var out = {}, p = PREFIX + 'day:';
    for (var i = 0; i < this._ls.length; i++) {
      var k = this._ls.key(i);
      if (k && k.indexOf(p) === 0) { var d = this._read(k.slice(PREFIX.length)); if (d) out[k.slice(p.length)] = d; }
    }
    this._cache = out;
    return out;
  };
  LocalStore.prototype.setCheck = function (key, taskId, check, scheduled) {
    var d = this.getDay(key) || emptyDay(key);
    if (!d.checks) d.checks = {};
    if (scheduled) d.scheduled = scheduled;
    if (check) d.checks[taskId] = check; else delete d.checks[taskId];
    this._write('day:' + key, d);
    return Promise.resolve();
  };
  LocalStore.prototype.patchDay = function (key, patch) {
    var d = this.getDay(key) || emptyDay(key);
    Object.keys(patch).forEach(function (k) { d[k] = patch[k]; });
    this._write('day:' + key, d);
    return Promise.resolve();
  };
  LocalStore.prototype.onChange = function (fn) { return this.ev.on(fn); };
  LocalStore.prototype.exportAll = function () {
    return { app: 'family-chores', version: 1, exportedAt: new Date().toISOString(), config: this.getConfig(), days: this.listDays() };
  };
  LocalStore.prototype.importAll = function (data) {
    if (data.config) this._write('config', data.config);
    var self = this;
    Object.keys(data.days || {}).forEach(function (k) { self._write('day:' + k, data.days[k]); });
    return Promise.resolve();
  };
  LocalStore.prototype.wipe = function () {
    var del = [];
    for (var i = 0; i < this._ls.length; i++) { var k = this._ls.key(i); if (k && k.indexOf(PREFIX) === 0 && k.indexOf(PREFIX + 'backup:') !== 0 && k !== SYNC_KEY) del.push(k); }
    var self = this; del.forEach(function (k) { self._ls.removeItem(k); });
    this._cache = null; this.ev.emit('local');
    return Promise.resolve();
  };

  /* ---------------- FirestoreStore ---------------- */
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.async = true;
      s.onload = res; s.onerror = function () { rej(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  var fbLoading = null;
  function loadFirebase() {
    if (root.firebase && root.firebase.firestore) return Promise.resolve();
    if (!fbLoading) {
      var base = 'https://www.gstatic.com/firebasejs/' + FIREBASE_VERSION + '/';
      fbLoading = loadScript(base + 'firebase-app-compat.js').then(function () { return loadScript(base + 'firebase-firestore-compat.js'); });
    }
    return fbLoading;
  }

  function FirestoreStore(code, fbConfig) {
    this.mode = 'sync'; this.code = code; this.fbConfig = fbConfig;
    this.ev = new Emitter(); this.config = null; this.days = {}; this.ready = false; this.unsubs = [];
  }
  FirestoreStore.prototype.init = function () {
    var self = this;
    return loadFirebase().then(function () {
      var fb = root.firebase;
      if (!fb.apps.length) fb.initializeApp(self.fbConfig);
      self.db = fb.firestore();
      return self.db.enablePersistence({ synchronizeTabs: true }).catch(function () { /* fine without offline cache */ });
    }).then(function () {
      self.fam = self.db.collection('families').doc(self.code);
      return new Promise(function (resolve, reject) {
        var gotCfg = false, gotDays = false;
        var timer = setTimeout(function () { reject(new Error('Timed out connecting to the family database. Check your connection and Firebase config.')); }, 15000);
        function done() { if (gotCfg && gotDays && !self.ready) { self.ready = true; clearTimeout(timer); resolve(self); } }
        self.unsubs.push(self.fam.collection('data').doc('config').onSnapshot(function (s) {
          self.config = s.exists ? s.data() : null; gotCfg = true; done(); self.ev.emit('remote');
        }, function (e) { clearTimeout(timer); reject(e); }));
        self.unsubs.push(self.fam.collection('days').onSnapshot(function (s) {
          var d = {}; s.forEach(function (doc) { d[doc.id] = doc.data(); });
          self.days = d; gotDays = true; done(); self.ev.emit('remote');
        }, function (e) { clearTimeout(timer); reject(e); }));
      });
    });
  };
  FirestoreStore.prototype.getConfig = function () { return this.config; };
  FirestoreStore.prototype.setConfig = function (cfg) { this.config = cfg; return this.fam.collection('data').doc('config').set(cfg); };
  FirestoreStore.prototype.getDay = function (k) { return this.days[k] || null; };
  FirestoreStore.prototype.listDays = function () { return this.days; };
  FirestoreStore.prototype.setCheck = function (key, taskId, check, scheduled) {
    var ref = this.fam.collection('days').doc(key);
    var base = { date: key };
    if (scheduled) base.scheduled = scheduled;
    if (check) {
      base.checks = {}; base.checks[taskId] = check;
      return ref.set(base, { merge: true }); /* nested-map merge: two people ticking different chores never collide */
    }
    var del = {}; del['checks.' + taskId] = root.firebase.firestore.FieldValue.delete();
    return ref.set(base, { merge: true }).then(function () { return ref.update(del); });
  };
  FirestoreStore.prototype.patchDay = function (key, patch) {
    var p = { date: key }; Object.keys(patch).forEach(function (k) { p[k] = patch[k]; });
    return this.fam.collection('days').doc(key).set(p, { merge: true });
  };
  FirestoreStore.prototype.onChange = function (fn) { return this.ev.on(fn); };
  FirestoreStore.prototype.exportAll = function () {
    return { app: 'family-chores', version: 1, exportedAt: new Date().toISOString(), config: this.config, days: this.days };
  };
  FirestoreStore.prototype.importAll = function (data) {
    var self = this, ops = [];
    if (data.config) ops.push({ ref: self.fam.collection('data').doc('config'), data: data.config });
    Object.keys(data.days || {}).forEach(function (k) { ops.push({ ref: self.fam.collection('days').doc(k), data: data.days[k] }); });
    var chunks = []; while (ops.length) chunks.push(ops.splice(0, 400));
    return chunks.reduce(function (p, chunk) {
      return p.then(function () {
        var b = self.db.batch(); chunk.forEach(function (o) { b.set(o.ref, o.data, { merge: true }); }); return b.commit();
      });
    }, Promise.resolve());
  };
  FirestoreStore.prototype.wipe = function () { return Promise.reject(new Error('Reset is only available in local mode. Leave the family first.')); };

  /* ---------------- Sync manager ---------------- */
  var Sync = {
    getCode: function () { try { return root.localStorage.getItem(SYNC_KEY); } catch (e) { return null; } },
    setCode: function (c) { root.localStorage.setItem(SYNC_KEY, c); },
    clearCode: function () { root.localStorage.removeItem(SYNC_KEY); },
    hasFirebaseConfig: function () { var c = root.FIREBASE_CONFIG; return !!(c && c.apiKey && c.projectId); },
    validCode: validCode,
    /* Pick the store for this page load. Falls back to local (with .syncError set) if sync fails. */
    open: function () {
      var code = this.getCode();
      if (code && this.hasFirebaseConfig()) {
        return new FirestoreStore(code, root.FIREBASE_CONFIG).init().catch(function (e) {
          console.error('Sync failed, falling back to local', e);
          var ls = new LocalStore(); ls.syncError = e.message || String(e); ls.syncCode = code; return ls.init();
        });
      }
      var ls = new LocalStore();
      if (code && !this.hasFirebaseConfig()) ls.syncError = 'A family code is saved but js/firebase-config.js has no Firebase config.';
      return ls.init();
    },
    /* Create a new family in Firestore and upload this device's data into it. */
    createFamily: function (localStore) {
      if (!this.hasFirebaseConfig()) return Promise.reject(new Error('Add your Firebase config to js/firebase-config.js first (see README).'));
      var code = randomCode(24), self = this;
      var fs = new FirestoreStore(code, root.FIREBASE_CONFIG);
      return fs.init().then(function () { return fs.importAll(localStore.exportAll()); }).then(function () { self.setCode(code); return code; });
    },
    /* Join an existing family. Local data is backed up first (fc:backup:<timestamp>). */
    joinFamily: function (code, localStore) {
      code = String(code || '').trim().toLowerCase();
      if (!validCode(code)) return Promise.reject(new Error('That family code does not look right. It should be 16 or more letters and digits.'));
      if (!this.hasFirebaseConfig()) return Promise.reject(new Error('Add your Firebase config to js/firebase-config.js first (see README).'));
      try {
        var snap = localStore.exportAll();
        if (snap.config) root.localStorage.setItem(PREFIX + 'backup:' + Date.now(), JSON.stringify(snap));
      } catch (e) { /* backup is best effort */ }
      this.setCode(code);
      return Promise.resolve(code);
    },
    leaveFamily: function () { this.clearCode(); },
    listBackups: function () {
      var out = [];
      for (var i = 0; i < root.localStorage.length; i++) { var k = root.localStorage.key(i); if (k && k.indexOf(PREFIX + 'backup:') === 0) out.push(k); }
      return out.sort();
    }
  };

  root.ChoreStore = { LocalStore: LocalStore, FirestoreStore: FirestoreStore, Sync: Sync, uid: uid, randomCode: randomCode, validCode: validCode, PREFIX: PREFIX };
  if (typeof module === 'object' && module.exports) module.exports = root.ChoreStore;
}(typeof self !== 'undefined' ? self : this));
