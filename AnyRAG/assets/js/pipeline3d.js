/* AnyRAG pipeline scene (W4). Classic script.
   3D (three.js 0.160.0 from cdnjs, loaded lazily) in #pipeline3d; 2D SVG fallback in #pipeline2d when WebGL is
   missing or the screen is narrower than 720 px. One shared controller: question, pipeline, six numbered stages, previous/play/next, replay.
   Data: assets/data/viz_pipeline.json (recorded development traces, reduced). Strings {en, fa}; fa "" falls back to en.
   Listens to 'langchange' and 'themechange' on document. Respects prefers-reduced-motion (no autoplay, no tweening). */
(function () {
  'use strict';
  var THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js';
  var NS = 'http://www.w3.org/2000/svg';
  var SCRIPT = document.currentScript;
  /* cache-busting: the ?v= of this script's own URL (set in index.html) is added to the files it loads */
  var VQ = (function () { try { var v = new URL(document.currentScript.src).searchParams.get('v'); return v ? '?v=' + encodeURIComponent(v) : ''; } catch (e) { return ''; } })();
  var BASE = (function () { try { return new URL('../data/', SCRIPT.src).href; } catch (e) { return 'assets/data/'; } })();
  /* six stages, one at a time: 0 the question arrives, 1 search (candidates light up), 2 order or select (the
     pipeline's own step: fusion, the reranker or the selection call; losers fade), 3 pack into the budget (the budget
     bar fills), 4 the pack goes to the reader, 5 the answer comes out. Each stage moves for about 1.1 s, then holds. */
  var STEPS = 6, STEP_MS = 2700, MOVE_MS = 1100, BUDGET = 6000;
  /* step names and the few new captions live in i18n.json (pipe.*); this table is the fallback if it has not loaded */
  var FB = {
    'pipe.steps': { en: 'Steps of the pipeline', fa: 'گام‌های پایپ‌لاین' },
    'pipe.st.q': { en: 'Question', fa: 'پرسش' }, 'pipe.st.search': { en: 'Search', fa: 'جست‌وجو' },
    'pipe.st.fuse': { en: 'Fuse and order', fa: 'ادغام و ترتیب' }, 'pipe.st.rerank': { en: 'Rerank', fa: 'بازرتبه‌بندی' },
    'pipe.st.select': { en: 'Select', fa: 'گزینش' }, 'pipe.st.pack': { en: 'Pack', fa: 'بسته‌سازی' },
    'pipe.st.read': { en: 'To the reader', fa: 'به مدل پاسخ‌گو' }, 'pipe.st.answer': { en: 'Answer', fa: 'پاسخ' },
    'pipe.stage.rerank': { en: 'Reranker', fa: 'بازرتبه‌ساز' }, 'pipe.stage.select': { en: 'Selection call', fa: 'فراخوانی گزینش' },
    'pipe.budget': { en: 'Budget', fa: 'بودجه' }, 'pipe.chars': { en: 'characters', fa: 'کاراکتر' },
    'pipe.cap.read': { en: 'The pack, {n} passages, goes to the reader. It is all the reader sees.', fa: 'بسته با {n} بخش به مدل پاسخ‌گو می‌رسد. مدل پاسخ‌گو جز همین بسته چیزی نمی‌بیند.' },
    'pipe.replay': { en: 'Replay', fa: 'پخش دوباره' }
  };
  function I(k) { var A = window.AnyRAG; if (A && A.t) { var v = A.t(k); if (v && v !== k) return v; } return T(FB[k]) || k; }
  /* the pipeline's own middle step */
  function midKey() { return st.pipe === 'hr' ? 'rerank' : st.pipe === 'lex5b' ? 'select' : 'fuse'; }
  function stepName(k) { return I(['pipe.st.q', 'pipe.st.search', 'pipe.st.' + midKey(), 'pipe.st.pack', 'pipe.st.read', 'pipe.st.answer'][k]); }
  var mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var mqWide = window.matchMedia ? window.matchMedia('(min-width: 720px)') : { matches: true };

  var D = null, st = { ex: 0, pipe: 'lex5b', step: 0, playing: false, autoplayed: false, visible: false };
  var ui = null, view = null, timer = null, m3 = null, m2 = null, threeP = null;

  function lang() { return (document.documentElement.lang || 'en').slice(0, 2) === 'fa' ? 'fa' : 'en'; }
  function T(o) { return o ? (o[lang()] || o.en || '') : ''; }
  function S(k) { return D ? T(D.strings[k]) : k; }
  function fmt(n) { try { return new Intl.NumberFormat(lang() === 'fa' ? 'fa-IR' : 'en-US').format(n); } catch (e) { return String(n); } }
  function fill(str, o) { return str.replace(/\{(\w+)\}/g, function (m, k) { return o[k] != null ? o[k] : m; }); }
  function h(tag, attrs, parent, text) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function hasPersian(t) { return /[؀-ۿ]/.test(t || ''); }
  function webglOK() {
    try { var c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadThree() {
    if (!threeP) threeP = import(THREE_URL); // ES module build; the classic build logs a deprecation warning
    return threeP;
  }

  /* ---------------- model: what each passage does at each step ---------------- */
  function model() {
    var ex = D.examples[st.ex], cell = ex.cells[st.pipe];
    var list1 = st.pipe === 'hr' ? ex.rrf.slice(0, 40) : cell.order.slice(0, 40);
    var list2 = cell.order.slice(0, 40);
    if (st.pipe === 'lex5b') {
      var picked = cell.pack.filter(function (p) { return p.pick; }).map(function (p) { return p.p; });
      list2 = picked.concat(cell.order.filter(function (i) { return picked.indexOf(i) < 0; })).slice(0, 40);
    }
    var packIdx = {}, sumCh = 0;
    cell.pack.forEach(function (p, k) { packIdx[p.p] = k; sumCh += p.ch; });
    var ids = [], seen = {};
    [list1, list2, cell.pack.map(function (p) { return p.p; })].forEach(function (l) { l.forEach(function (i) { if (!seen[i]) { seen[i] = 1; ids.push(i); } }); });
    var cum = 0, packPos = {};
    var scale = cell.rendered / BUDGET / sumCh; // fraction of the window per character of passage text
    cell.pack.forEach(function (p) { packPos[p.p] = { a: cum * scale, b: (cum + p.ch) * scale, lit: p.sp.length > 0, cut: p.cut }; cum += p.ch; });
    var ev1 = list1.filter(function (i) { return ex.passages[i].sp.length > 0; }).length;
    var srcDocs = {};
    list1.concat(list2).forEach(function (i) { srcDocs[ex.passages[i].d] = 1; });
    var dropIdx = {}, nd = 0;
    list2.forEach(function (i) { if (packIdx[i] == null) dropIdx[i] = nd++; });
    var gDocs = ex.docs.filter(function (d) { return d.g; }).length;
    var pick = {}; cell.pack.forEach(function (p) { if (p.pick) pick[p.p] = 1; });
    return { ex: ex, cell: cell, list1: list1, list2: list2, ids: ids, packIdx: packIdx, packPos: packPos, ev1: ev1, srcDocs: srcDocs, dropIdx: dropIdx, gDocs: gDocs, pick: pick,
      used: Math.min(1, cell.rendered / BUDGET),
      evIds: ids.filter(function (i) { return ex.passages[i].sp.length > 0; }) };
  }
  /* state of item i at step k: {zone: 'doc'|'list'|'drop'|'pack'|'reader', slot, di, vis, lit}. 'drop' is a candidate
     the pack left out; it keeps its list slot for the 2D view, and di is its place on the 3D pile. */
  function itemState(M, i, k) {
    var r1 = M.list1.indexOf(i), r2 = M.list2.indexOf(i), inPack = M.packIdx[i] != null, ev = M.ex.passages[i].sp.length > 0;
    var pick = !!(M.pick && M.pick[i]);
    if (k === 0) return { zone: 'doc', vis: 0 };
    if (k === 1) return r1 >= 0 ? { zone: 'list', slot: r1, vis: 1, ev: ev } : { zone: 'doc', vis: 0 };
    // order or select: the new order; what will not fit the pack (the losers) fades
    if (k === 2) return r2 >= 0 ? { zone: 'list', slot: r2, vis: inPack ? 1 : 0.32, ev: ev, pick: pick, lose: !inPack } : (r1 >= 0 ? { zone: 'list', slot: r1, vis: 0.12, ev: ev, out: 1, lose: true } : { zone: 'doc', vis: 0 });
    if (k === 3) return inPack ? { zone: 'pack', vis: 1, ev: ev, pp: M.packPos[i] } : (r2 >= 0 ? { zone: 'drop', slot: r2, di: M.dropIdx[i], vis: 0.28, ev: ev } : { zone: 'doc', vis: 0 });
    if (inPack && M.packPos[i].lit) return { zone: 'reader', vis: 1, ev: ev, pp: M.packPos[i], lit: true };
    return inPack ? { zone: 'reader', vis: 0, ev: ev, pp: M.packPos[i] } : (r2 >= 0 ? { zone: 'drop', slot: r2, di: M.dropIdx[i], vis: 0.12, ev: ev } : { zone: 'doc', vis: 0 });
  }
  function caption(M, k) {
    var c = M.cell;
    if (k === 0) return fill(S('s0'), { docs: fmt(M.ex.docs.length), g: fmt(M.gDocs) });
    if (k === 1) return fill(S('s1'), { ev: fmt(M.ev1) });
    if (k === 2) return S('s2_' + (st.pipe === 'lex5b' ? 'lex' : st.pipe));
    if (k === 3) return fill(S('s3'), { n: fmt(c.pack.length), chars: fmt(c.rendered) });
    if (k === 4) return fill(I('pipe.cap.read'), { n: fmt(c.pack.length) }) + ' ' + (c.full ? S('full_yes') : S('full_no'));
    return c.correct ? S('s4_ok') : S('s4_no');
  }

  /* ---------------- widget (controls, caption) ---------------- */
  function buildUI(mount, mode) {
    mount.textContent = '';
    var root = h('div', { 'class': 'pv', 'data-mode': mode }, mount);
    var bar = h('div', { 'class': 'pv-bar' }, root);
    var qg = h('div', { 'class': 'vz-seg', role: 'group', 'aria-label': S('question') }, bar);
    var qBtns = D.examples.map(function (ex, i) {
      var b = h('button', { type: 'button', 'aria-pressed': String(i === st.ex) }, qg, S('tier_' + ex.tier) + ' · ' + S('lang_' + ex.lang));
      b.addEventListener('click', function () { st.ex = i; reset(); });
      return b;
    });
    var pg = h('div', { 'class': 'vz-seg', role: 'group', 'aria-label': S('pipeline') }, bar);
    var pBtns = D.pipelines.map(function (p) {
      var b = h('button', { type: 'button', 'aria-pressed': String(p.key === st.pipe) }, pg, T(p.label));
      b.addEventListener('click', function () { st.pipe = p.key; reset(); });
      return b;
    });
    var q = h('div', { 'class': 'pv-q' }, root);
    var qt = h('p', { 'class': 'pv-qt', dir: 'auto' }, q);
    var qgl = h('p', { 'class': 'pv-gl', dir: 'auto' }, q);
    // the six stages as numbered steps; each is also a button that jumps to it
    var steps = h('ol', { 'class': 'pv-steps', 'aria-label': I('pipe.steps') }, root);
    var stepB = [];
    for (var i = 0; i < STEPS; i++) (function (k) {
      var li = h('li', null, steps);
      var b = h('button', { type: 'button' }, li);
      h('span', { 'class': 'pv-sn', 'aria-hidden': 'true' }, b, fmt(k + 1));
      h('span', { 'class': 'pv-sl' }, b);
      b.addEventListener('click', function () { stop(); go(k); });
      stepB.push(b);
    })(i);
    var stage = h('div', { 'class': 'pv-stage' + (mode === '2d' ? ' is-2d' : ''), role: 'img', 'aria-label': S('stage_label') }, root);
    // the budget meter: empty until the pack step, then it fills as passages go in
    var meter = h('div', { 'class': 'pv-meter', 'aria-hidden': 'true' }, root);
    var mLab = h('span', { 'class': 'pv-ml' }, meter, I('pipe.budget'));
    var mBar = h('span', { 'class': 'pv-mbar' }, meter); var mFill = h('i', null, mBar);
    var mNum = h('span', { 'class': 'pv-mn' }, meter);
    var key = h('ul', { 'class': 'pv-key', 'aria-hidden': 'true' }, root);
    [['k-ev', S('legend_ev')], ['k-ot', S('legend_other')], ['k-pk', S('l_pack')]].forEach(function (k) { var li = h('li', null, key); h('i', { 'class': k[0] }, li); h('span', null, li, k[1]); });
    var ctrl = h('div', { 'class': 'pv-ctrl' }, root);
    var prev = h('button', { type: 'button', 'class': 'pv-btn', 'aria-label': S('prev') }, ctrl, '‹');
    var play = h('button', { type: 'button', 'class': 'pv-btn pv-play' }, ctrl);
    var next = h('button', { type: 'button', 'class': 'pv-btn', 'aria-label': S('next') }, ctrl, '›');
    var replay = h('button', { type: 'button', 'class': 'pv-btn pv-replay' }, ctrl, '↺ ' + I('pipe.replay'));
    if (lang() === 'fa') { prev.textContent = '›'; next.textContent = '‹'; }
    var stepn = h('span', { 'class': 'pv-stepn', 'aria-hidden': 'true' }, ctrl);
    var cap = h('p', { 'class': 'pv-cap', 'aria-live': 'polite', dir: 'auto' }, root);
    var ans = h('div', { 'class': 'pv-ans', hidden: '' }, root);
    if (mode === '2d') h('p', { 'class': 'pv-fb', dir: 'auto' }, root, S('fallback'));
    h('p', { 'class': 'pv-note', dir: 'auto' }, root, S('note'));
    prev.addEventListener('click', function () { stop(); go(Math.max(0, st.step - 1)); });
    next.addEventListener('click', function () { stop(); go(Math.min(STEPS - 1, st.step + 1)); });
    play.addEventListener('click', function () { if (st.playing) stop(); else start(); });
    replay.addEventListener('click', function () { stop(); go(0, true); start(); });
    ui = { root: root, stage: stage, qBtns: qBtns, pBtns: pBtns, qt: qt, qgl: qgl, prev: prev, next: next, play: play, replay: replay, steps: stepB, stepn: stepn, cap: cap, ans: ans,
      meter: meter, mFill: mFill, mNum: mNum };
  }
  /* the budget meter follows the stage: 0 before packing; at the pack step it fills over the move, counting up */
  var meterRaf = 0;
  function setMeter(M, k, instant) {
    if (!ui) return;
    cancelAnimationFrame(meterRaf);
    var to = k >= 3 ? M.used : 0, chars = k >= 3 ? M.cell.rendered : 0;
    ui.meter.classList.toggle('is-on', k === 3);
    ui.meter.classList.toggle('is-full', k >= 3);
    function put(f) { ui.mFill.style.width = (f * to * 100).toFixed(2) + '%'; ui.mNum.textContent = fmt(Math.round(f * chars)) + ' ' + S('of') + ' ' + fmt(BUDGET) + ' ' + I('pipe.chars'); }
    if (instant || k !== 3) { put(1); return; }
    var t0 = performance.now(), dur = MOVE_MS + 400;
    (function f(now) { var t = Math.min(1, (now - t0) / dur); put(t); if (t < 1) meterRaf = requestAnimationFrame(f); })(t0);
  }
  function syncUI(M) {
    ui.qBtns.forEach(function (b, i) { b.setAttribute('aria-pressed', String(i === st.ex)); });
    ui.pBtns.forEach(function (b, i) { b.setAttribute('aria-pressed', String(D.pipelines[i].key === st.pipe)); });
    ui.qt.textContent = M.ex.q;
    ui.qt.setAttribute('lang', M.ex.lang);
    ui.qgl.textContent = M.ex.q_gloss ? S('gloss') + ': ' + M.ex.q_gloss : '';
    ui.prev.disabled = st.step === 0; ui.next.disabled = st.step === STEPS - 1;
    ui.play.textContent = st.playing ? S('pause') : (st.step === STEPS - 1 ? S('restart') : S('play'));
    ui.play.setAttribute('aria-pressed', String(st.playing));
    var own = st.pipe !== 'hybrid'; // the reranker and the selection call are steps of their own
    ui.steps.forEach(function (b, i) {
      b.querySelector('.pv-sl').textContent = stepName(i);
      b.setAttribute('aria-label', S('step') + ' ' + fmt(i + 1) + ' ' + S('of') + ' ' + fmt(STEPS) + ': ' + stepName(i));
      if (i === st.step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      b.parentNode.className = (i < st.step ? 'is-done' : i === st.step ? 'is-cur' : '') + (i === 2 && own ? ' is-own' : '');
    });
    ui.root.setAttribute('data-step', String(st.step));
    ui.root.setAttribute('data-pipe', st.pipe);
    ui.stepn.textContent = S('step') + ' ' + fmt(st.step + 1) + ' ' + S('of') + ' ' + fmt(STEPS);
    ui.cap.textContent = caption(M, st.step);
    var a = ui.ans; a.textContent = '';
    if (st.step === STEPS - 1) {
      a.removeAttribute('hidden');
      var p1 = h('p', { dir: 'auto' }, a); h('span', { 'class': 'pv-mark ' + (M.cell.correct ? 'pv-ok' : 'pv-no'), 'aria-hidden': 'true' }, p1);
      h('b', null, p1, S('answer') + ': ');
      h('span', { 'class': 'pv-at', dir: 'auto', lang: hasPersian(M.cell.answer) ? 'fa' : 'en' }, p1, M.cell.answer);
      if (M.cell.answer_gloss) h('span', { 'class': 'pv-gl' }, p1, ' (' + S('gloss') + ': ' + M.cell.answer_gloss + ')');
      var p2 = h('p', { dir: 'auto' }, a); h('b', null, p2, S('expected') + ': ');
      h('span', { 'class': 'pv-at', dir: 'auto', lang: hasPersian(M.ex.expected) ? 'fa' : 'en' }, p2, M.ex.expected);
      if (M.ex.expected_gloss) h('span', { 'class': 'pv-gl' }, p2, ' (' + M.ex.expected_gloss + ')');
    } else a.setAttribute('hidden', '');
  }

  /* ---------------- controller ---------------- */
  function go(k, instant) {
    st.step = k;
    var M = model();
    syncUI(M);
    setMeter(M, k, instant || mqReduce.matches);
    if (view) view.show(M, k, instant || mqReduce.matches);
  }
  function reset() { var was = st.playing; stop(); if (view) view.setData(model()); go(0, true); if (was) start(); }
  function tick() {
    if (!st.playing) return;
    if (st.step >= STEPS - 1) { stop(); return; }
    go(st.step + 1);
    timer = setTimeout(tick, STEP_MS);
  }
  function start() {
    if (st.step >= STEPS - 1) go(0, true);
    st.playing = true; syncUI(model());
    clearTimeout(timer); timer = setTimeout(tick, mqReduce.matches ? STEP_MS : 900);
  }
  function stop() { st.playing = false; clearTimeout(timer); if (ui) syncUI(model()); }

  function css(el, name, fb) { var v = getComputedStyle(el).getPropertyValue(name).trim(); return v || fb; }

  /* ================= 3D view =================
     A three-quarter view on a floor grid, so the stages read as places: the pool of standing documents (the ones
     holding gold evidence are turquoise from the start), the column of 40 candidates, the pack frame, the reader.
     Gold passages are turquoise from the moment they are retrieved; what the pack leaves out falls onto a pile in
     front of the candidates, so a lost piece of evidence stays visible. Colours come from the page tokens and are
     mixed separately for light and dark, so every object keeps its contrast on both backgrounds. */
  function View3D(THREE, stage) {
    var W = stage.clientWidth, H = stage.clientHeight;
    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(W, H, false);
    renderer.setClearColor(0x000000, 0);
    stage.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(32, W / H, 0.5, 300);
    var hemi = new THREE.HemisphereLight(0xffffff, 0x9a9a9a, 1.6); scene.add(hemi);
    var key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(-7, 14, 11); scene.add(key);
    var fillL = new THREE.DirectionalLight(0xffffff, 0.55); fillL.position.set(10, 4, -6); scene.add(fillL);
    var col = {};
    function mix(a, b, t) { return a.clone().lerp(b, t); }
    function readColors() {
      var r = ui.root;
      col.accent = new THREE.Color(css(r, '--viz-accent', '#3e5fb8'));
      col.turq = new THREE.Color(css(r, '--viz-turq', '#0f948c'));
      col.ink = new THREE.Color(css(r, '--viz-ink', '#14161a'));
      col.surf = new THREE.Color(css(r, '--viz-surface', '#fbfaf6'));
      col.saff = new THREE.Color(css(r, '--viz-saffron', '#b8862b'));
      col.dark = col.surf.getHSL({}).l < 0.5;
      var dk = col.dark;
      col.grid = mix(col.surf, col.ink, dk ? 0.11 : 0.2);
      col.grid2 = mix(col.surf, col.ink, dk ? 0.18 : 0.3);
      col.doc = mix(col.surf, col.ink, dk ? 0.30 : 0.16);
      col.docEdge = mix(col.surf, col.ink, dk ? 0.55 : 0.40);
      col.docSrc = mix(col.accent, col.surf, dk ? 0.35 : 0.55);
      col.goldDoc = mix(col.turq, col.surf, dk ? 0.25 : 0.35);
      col.plate = mix(col.surf, col.ink, dk ? 0.58 : 0.40);
      col.frame = col.accent.clone();
      col.lineMuted = mix(col.surf, col.ink, dk ? 0.40 : 0.30);
      hemi.intensity = dk ? 2.4 : 1.6;
      key.intensity = dk ? 1.9 : 1.5;
    }
    readColors();

    // zones (world units); the floor is y = FLOOR
    var FLOOR = -4.1;
    var Z = { poolX: -7.6, listX: -2.4, packX: 2.5, readerX: 7.6, top: 3.9, colH: 7.8 };
    var grid = new THREE.GridHelper(30, 30, col.grid2, col.grid);
    grid.position.y = FLOOR; grid.material.transparent = true; grid.material.opacity = 0.75; scene.add(grid);
    var poolG = new THREE.Group(); scene.add(poolG);
    var docMesh = null, docEdges = null, docData = [];
    var plateGeo = new THREE.BoxGeometry(1, 1, 1);
    var items = {}; // passage index -> {mesh, cur, tgt}
    var frameMat = new THREE.LineBasicMaterial({ color: col.frame, transparent: true, opacity: 0.95 });
    var frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.8, Z.colH, 0.9)), frameMat);
    frame.position.set(Z.packX, Z.top - Z.colH / 2, 0); scene.add(frame);
    var guideMat = new THREE.LineBasicMaterial({ color: col.lineMuted, transparent: true, opacity: 0.8 });
    var guide = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.7, Z.colH, 0.9)), guideMat);
    guide.position.set(Z.listX, Z.top - Z.colH / 2, 0); scene.add(guide);
    var readerMat = new THREE.MeshStandardMaterial({ color: col.surf, roughness: 0.6, metalness: 0, transparent: true, opacity: 0.35, depthWrite: false, emissive: 0x000000 });
    var reader = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), readerMat);
    reader.position.set(Z.readerX, -0.2, 0); scene.add(reader);
    var readerEdgeMat = new THREE.LineBasicMaterial({ color: col.ink });
    reader.add(new THREE.LineSegments(new THREE.EdgesGeometry(reader.geometry), readerEdgeMat));
    // short posts from the floor to the reader and the two columns, so nothing floats without a ground
    var postMat = new THREE.LineBasicMaterial({ color: col.lineMuted, transparent: true, opacity: 0.6 });
    var postPts = [];
    [[Z.readerX, -1.7], [Z.listX, Z.top - Z.colH], [Z.packX, Z.top - Z.colH]].forEach(function (p) { postPts.push(p[0], p[1], 0, p[0], FLOOR, 0); });
    var postGeo = new THREE.BufferGeometry(); postGeo.setAttribute('position', new THREE.Float32BufferAttribute(postPts, 3));
    scene.add(new THREE.LineSegments(postGeo, postMat));

    // labels: the five places, plus the question, the answer and the pipeline's own middle step
    var labs = {};
    [['pool', 'l_pool'], ['list', 'l_cands'], ['pack', 'l_pack'], ['reader', 'l_reader'], ['drop', 'l_drop']].forEach(function (p) {
      labs[p[0]] = h('div', { 'class': 'pv-lab', 'aria-hidden': 'true', dir: 'auto' }, stage, S(p[1]));
    });
    labs.q = h('div', { 'class': 'pv-lab pv-lab-q', 'aria-hidden': 'true', dir: 'auto' }, stage, I('pipe.st.q'));
    labs.ans = h('div', { 'class': 'pv-lab pv-lab-a', 'aria-hidden': 'true', dir: 'auto' }, stage, I('pipe.st.answer'));
    labs.mid = h('div', { 'class': 'pv-lab pv-lab-mid', 'aria-hidden': 'true', dir: 'auto' }, stage, '');
    var anchors = { pool: new THREE.Vector3(Z.poolX, FLOOR + 4.3, 0), list: new THREE.Vector3(Z.listX, Z.top + 0.45, 0), pack: new THREE.Vector3(Z.packX, Z.top + 0.45, 0),
      reader: new THREE.Vector3(Z.readerX, 1.75, 0), drop: new THREE.Vector3(0.1, FLOOR + 1.2, 2.6),
      q: new THREE.Vector3(Z.poolX, 2.75, 0.4), ans: new THREE.Vector3(Z.readerX, 3.75, 0), mid: new THREE.Vector3(Z.listX - 2.6, Z.top - 0.9, 0) };
    // which place each stage happens at, for the highlighted label
    var curLab = ['q', 'list', 'list', 'pack', 'reader', 'ans'];

    // the flow: faint dashed connectors between the places, and particles that run forward along the active one
    var LMID = Z.top - Z.colH / 2;
    var V = function (x, y, z) { return new THREE.Vector3(x, y, z); };
    var segs = [
      [V(Z.poolX, 4.4, 0.4), V(Z.poolX, FLOOR + 3.2, 0.4)],
      [V(Z.poolX + 2.5, FLOOR + 2.4, 0.4), V(Z.listX - 1.55, LMID, 0)],
      [V(Z.listX, Z.top - 0.1, 0.62), V(Z.listX, Z.top - Z.colH + 0.1, 0.62)],
      [V(Z.listX + 1.5, LMID, 0), V(Z.packX - 1.55, LMID, 0)],
      [V(Z.packX + 1.5, LMID, 0), V(Z.readerX - 1.65, -0.2, 0)],
      [V(Z.readerX, 1.4, 0), V(Z.readerX, 2.6, 0)]
    ];
    var conMat = new THREE.LineDashedMaterial({ color: col.lineMuted, dashSize: 0.22, gapSize: 0.18, transparent: true, opacity: 0.9 });
    [1, 3, 4].forEach(function (i) {
      var g = new THREE.BufferGeometry().setFromPoints(segs[i]);
      var ln = new THREE.Line(g, conMat); ln.computeLineDistances(); scene.add(ln);
    });
    var NP = 14, pPos = new Float32Array(NP * 3);
    var pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    var pMat = new THREE.PointsMaterial({ color: col.turq, size: 0.42, transparent: true, opacity: 0.95, depthWrite: false });
    var parts = new THREE.Points(pGeo, pMat); parts.visible = false; scene.add(parts);
    var flow = null; // {seg, t0, t1}
    function flowAt(now) {
      if (!flow || now > flow.t1) { parts.visible = false; return false; }
      var a = segs[flow.seg][0], b = segs[flow.seg][1], lift = flow.seg === 2 || flow.seg === 0 || flow.seg === 5 ? 0 : 0.9;
      var fade = Math.min(1, (flow.t1 - now) / 400, (now - flow.t0) / 200);
      for (var j = 0; j < NP; j++) {
        var t = ((now - flow.t0) / 850 + j / NP) % 1;
        pPos[j * 3] = a.x + (b.x - a.x) * t;
        pPos[j * 3 + 1] = a.y + (b.y - a.y) * t + Math.sin(Math.PI * t) * lift;
        pPos[j * 3 + 2] = a.z + (b.z - a.z) * t;
      }
      pGeo.attributes.position.needsUpdate = true;
      pMat.opacity = 0.95 * Math.max(0, fade); parts.visible = true;
      return true;
    }

    // camera orbit (limited), three-quarter view from the front left
    var orbit = { az: -0.36, el: 0.34, baseAz: -0.36, baseEl: 0.34, dist: 30 };
    function fit() {
      var aspect = W / H, vf = camera.fov * Math.PI / 180;
      var hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
      var needW = 10.6 / Math.tan(hf / 2), needH = 5.2 / Math.tan(vf / 2);
      orbit.dist = Math.max(needW, needH) + 5;
    }
    function placeCam() {
      var d = orbit.dist;
      camera.position.set(Math.sin(orbit.az) * Math.cos(orbit.el) * d, Math.sin(orbit.el) * d + 0.2, Math.cos(orbit.az) * Math.cos(orbit.el) * d);
      camera.lookAt(0, -0.75, 0.9);
    }
    fit(); placeCam();

    var drag = null;
    stage.addEventListener('pointerdown', function (e) { if (e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, az: orbit.az, el: orbit.el, id: e.pointerId }; stage.classList.add('is-drag'); try { stage.setPointerCapture(e.pointerId); } catch (x) {} });
    stage.addEventListener('pointermove', function (e) {
      if (!drag) return;
      orbit.az = Math.max(-0.9, Math.min(0.6, drag.az - (e.clientX - drag.x) * 0.004));
      orbit.el = Math.max(0.08, Math.min(0.75, drag.el + (e.clientY - drag.y) * 0.003));
      placeCam(); kick();
    });
    function endDrag() { if (!drag) return; drag = null; stage.classList.remove('is-drag'); }
    stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
    stage.addEventListener('dblclick', function () { orbit.az = orbit.baseAz; orbit.el = orbit.baseEl; placeCam(); kick(); });

    // ---------- data ----------
    var M = null;
    function docPos(di) { return docData[di] || { x: Z.poolX, y: FLOOR, z: 0, h: 0.5 }; }
    function setData(m) {
      M = m;
      if (docMesh) { poolG.remove(docMesh); docMesh.geometry.dispose(); docMesh.material.dispose(); docMesh = null; }
      if (docEdges) { poolG.remove(docEdges); docEdges.geometry.dispose(); docEdges.material.dispose(); docEdges = null; }
      Object.keys(items).forEach(function (k) { scene.remove(items[k].mesh); items[k].mesh.material.dispose(); });
      items = {};
      var docs = m.ex.docs, n = docs.length;
      // standing documents in rows on the floor, height by length (log scale)
      var cols = Math.min(8, Math.ceil(Math.sqrt(n * 1.6))), rows = Math.ceil(n / cols);
      var sx = Math.min(0.85, 4.6 / cols), sz = Math.min(1.2, 4.4 / rows);
      var maxN = docs.reduce(function (a, d) { return Math.max(a, d.n); }, 1);
      docData = [];
      var mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
      docMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, n);
      var o = new THREE.Object3D(), edgePts = [];
      // documents holding gold evidence stand in the front row, where the camera sees them
      var slot = {}, ord = docs.map(function (d, i) { return i; }).sort(function (a, b) { return (docs[b].g ? 1 : 0) - (docs[a].g ? 1 : 0) || a - b; });
      ord.forEach(function (i, k) { slot[i] = k; });
      docs.forEach(function (d, i) {
        var c = slot[i] % cols, r = rows - 1 - Math.floor(slot[i] / cols);
        var hgt = 1.1 + 2.6 * Math.log(1 + d.n) / Math.log(1 + maxN);
        var x = Z.poolX + (c - (cols - 1) / 2) * sx, z = (r - (rows - 1) / 2) * sz + 0.4;
        var w = sx * 0.8, dpt = 0.14;
        docData.push({ x: x, y: FLOOR + hgt / 2, z: z, h: hgt });
        o.position.set(x, FLOOR + hgt / 2, z); o.scale.set(w, hgt, dpt); o.updateMatrix();
        docMesh.setMatrixAt(i, o.matrix);
        docMesh.setColorAt(i, col.doc);
        if (d.g) { // an outline on the documents that hold gold evidence
          var x0 = x - w / 2 - 0.03, x1 = x + w / 2 + 0.03, y0 = FLOOR, y1 = FLOOR + hgt + 0.03, zz = z + dpt / 2 + 0.02;
          edgePts.push(x0, y0, zz, x0, y1, zz, x0, y1, zz, x1, y1, zz, x1, y1, zz, x1, y0, zz);
        }
      });
      poolG.add(docMesh);
      var eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(edgePts, 3));
      docEdges = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: col.turq }));
      poolG.add(docEdges);
      m.ids.forEach(function (pi) {
        var mt = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0, transparent: true, opacity: 0, color: col.plate });
        var mesh = new THREE.Mesh(plateGeo, mt);
        var dp = docPos(m.ex.passages[pi].d);
        var cur = { x: dp.x, y: dp.y, z: dp.z, sx: 0.3, sy: 0.05, sz: 0.3, op: 0, r: col.plate.r, g: col.plate.g, b: col.plate.b, e: 0 };
        mesh.position.set(cur.x, cur.y, cur.z); mesh.scale.set(cur.sx, cur.sy, cur.sz); mesh.visible = false;
        scene.add(mesh);
        items[pi] = { mesh: mesh, cur: cur, from: null, tgt: null, delay: 0 };
      });
      // the question (a lapis card that arrives over the pool) and the answer (a card that leaves the reader)
      ['Q', 'A'].forEach(function (kq) {
        var mt = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0, transparent: true, opacity: 0, color: col.accent });
        var mesh = new THREE.Mesh(plateGeo, mt); mesh.visible = false; scene.add(mesh);
        var t0 = target(kq, -1);
        var cur = { x: t0.x, y: t0.y, z: t0.z, sx: t0.sx, sy: t0.sy, sz: t0.sz, op: 0, r: t0.c.r, g: t0.c.g, b: t0.c.b, e: 0 };
        items[kq] = { mesh: mesh, cur: cur, from: null, tgt: null, delay: 0 };
      });
    }
    function cardTarget(kq, k) {
      if (kq === 'Q') {
        if (k < 0) return { x: Z.poolX, y: 5.2, z: 0.4, sx: 2.6, sy: 0.42, sz: 0.5, op: 0, c: col.accent, e: 0.2 };
        if (k === 0) return { x: Z.poolX, y: 1.9, z: 0.4, sx: 2.6, sy: 0.42, sz: 0.5, op: 1, c: col.accent, e: 0.35 };
        return { x: Z.poolX, y: FLOOR + 3.4, z: 0.4, sx: 1.2, sy: 0.12, sz: 0.3, op: 0, c: col.accent, e: 0 };
      }
      var good = M && M.cell.correct ? col.turq : col.saff;
      if (k === 5) return { x: Z.readerX, y: 3.0, z: 0, sx: 2.8, sy: 0.5, sz: 0.55, op: 1, c: good, e: 0.45 };
      return { x: Z.readerX, y: 0.4, z: 0, sx: 1.2, sy: 0.12, sz: 0.4, op: 0, c: good, e: 0 };
    }
    function docColors(k) {
      if (!docMesh) return;
      M.ex.docs.forEach(function (d, i) {
        var c = col.doc;
        if (k >= 1 && M.srcDocs[i]) c = col.docSrc;
        if (d.g) c = col.goldDoc;
        docMesh.setColorAt(i, c);
      });
      docMesh.instanceColor.needsUpdate = true;
    }
    function target(pi, k) {
      if (pi === 'Q' || pi === 'A') return cardTarget(pi, k);
      var s = itemState(M, pi, k), p = M.ex.passages[pi];
      var w = 0.8 + 1.7 * Math.min(p.n, 1200) / 1200;
      var base = s.ev ? col.turq : (s.pick && k === 2 ? col.accent : col.plate);
      if (s.zone === 'doc') { var dp = docPos(p.d); return { x: dp.x, y: dp.y + dp.h / 2, z: dp.z, sx: 0.3, sy: 0.05, sz: 0.3, op: 0, c: base, e: 0 }; }
      // at search the candidates arrive lit (emissive), then settle; at order/select the losers slide back and fade
      if (s.zone === 'list') return { x: Z.listX + (k === 2 && s.lose ? 0.35 : 0), y: Z.top - 0.1 - s.slot * (Z.colH / 40), z: k === 2 && s.lose ? -0.35 : 0, sx: w, sy: Z.colH / 40 * 0.66, sz: 0.7,
        op: Math.max(s.vis, s.out ? 0.12 : 0), c: base, e: s.ev ? 0.3 : (k === 1 ? 0.18 : s.pick && k === 2 ? 0.25 : 0) };
      if (s.zone === 'drop') {
        // the pile: stacks of four in two rows of five, lying on the floor in front of the candidates
        var st2 = Math.floor(s.di / 4), lv = s.di % 4, cx = st2 % 5, rz = Math.floor(st2 / 5) % 2;
        return { x: -1.9 + cx * 1.0, y: FLOOR + 0.06 + lv * 0.13, z: 2.2 + rz * 0.75, sx: 0.82, sy: 0.1, sz: 0.55, op: s.ev ? 1 : 0.85, c: base, e: s.ev ? 0.3 : 0 };
      }
      if (s.zone === 'pack') {
        var a = s.pp.a * Z.colH, b = s.pp.b * Z.colH;
        return { x: Z.packX, y: Z.top - (a + b) / 2, z: 0, sx: 2.5, sy: Math.max(0.04, (b - a) - 0.06), sz: 0.7, op: Math.max(0.45, s.vis), c: base, e: s.ev ? 0.25 : 0 };
      }
      // reader: evidence pieces rest lit in front of the reader; the rest goes inside
      if (s.lit) {
        var evList = M.cell.pack.filter(function (q) { return q.sp.length > 0; }).map(function (q) { return q.p; });
        var j = evList.indexOf(pi), n = evList.length;
        return { x: Z.readerX, y: -0.2 + 1.0 - j * (2.0 / Math.max(1, n)) - 1.0 / Math.max(1, n), z: 1.62, sx: 2.4, sy: Math.min(0.38, 1.5 / Math.max(1, n)), sz: 0.14, op: 1, c: col.turq, e: 0.6 };
      }
      return { x: Z.readerX, y: -0.2, z: 0, sx: 1.2, sy: 0.1, sz: 0.8, op: 0, c: base, e: 0 };
    }

    // ---------- animation (render on demand) ----------
    var anim = null, raf = 0, frames = [];
    var ease = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
    function apply(it, v) {
      var m = it.mesh;
      m.position.set(v.x, v.y, v.z); m.scale.set(v.sx, v.sy, v.sz);
      m.material.color.setRGB(v.r, v.g, v.b);
      m.material.emissive.setRGB(v.r * v.e, v.g * v.e, v.b * v.e);
      m.material.opacity = v.op; m.visible = v.op > 0.01;
    }
    var curStep = 0;
    function show(m, k, instant) {
      if (m !== M) setData(m);
      var back = k < curStep; curStep = k;
      docColors(k);
      var endCol = k >= 4 ? (M.cell.full ? col.turq : col.saff) : col.ink;
      readerEdgeMat.color.copy(endCol);
      readerMat.emissive.copy(k >= 4 && M.cell.full ? col.turq : new THREE.Color(0x000000)).multiplyScalar(k === 5 ? 0.3 : 0.12);
      frameMat.opacity = k === 3 ? 1 : 0.6; guideMat.color.copy(k === 2 && st.pipe !== 'hybrid' ? col.accent : col.lineMuted);
      var dur = instant ? 0 : MOVE_MS, nPack = Math.max(1, M.cell.pack.length);
      M.ids.concat(['Q', 'A']).forEach(function (pi) {
        var it = items[pi], t = target(pi, k);
        it.from = { x: it.cur.x, y: it.cur.y, z: it.cur.z, sx: it.cur.sx, sy: it.cur.sy, sz: it.cur.sz, op: it.cur.op, r: it.cur.r, g: it.cur.g, b: it.cur.b, e: it.cur.e };
        it.tgt = { x: t.x, y: t.y, z: t.z, sx: t.sx, sy: t.sy, sz: t.sz, op: t.op, r: t.c.r, g: t.c.g, b: t.c.b, e: t.e };
        it.dur = dur;
        if (instant || back || pi === 'Q' || pi === 'A') { it.delay = pi === 'A' && !instant && !back ? 250 : 0; return; }
        var s1 = itemState(M, pi, k);
        // the pack fills one passage after another, in step with the budget meter
        if (k === 3 && s1.zone === 'pack') { it.delay = (M.packIdx[pi] || 0) * (900 / nPack); it.dur = 700; }
        else if (k === 3 && s1.zone === 'drop') it.delay = 1000 + s1.di * 6;
        else if (k >= 4) it.delay = (M.packIdx[pi] || 0) * 60;
        else it.delay = Math.min(450, (s1.slot || 0) * 11);
      });
      var now = performance.now();
      anim = { t0: now };
      flow = instant || back ? null : { seg: k, t0: now, t1: now + MOVE_MS + 900 };
      kick();
    }
    function frameStep(now) {
      raf = 0;
      frames.push(now);
      if (frames.length > 240) frames.shift();
      var busy = false;
      if (anim) {
        Object.keys(items).forEach(function (pi) {
          var it = items[pi]; if (!it.tgt) return;
          var t = it.dur ? (now - anim.t0 - it.delay) / it.dur : 1;
          t = Math.max(0, Math.min(1, t));
          if (t < 1) busy = true;
          var e = ease(t), f = it.from, g = it.tgt, c = it.cur;
          ['x', 'y', 'z', 'sx', 'sy', 'sz', 'op', 'r', 'g', 'b', 'e'].forEach(function (k) { c[k] = f[k] + (g[k] - f[k]) * e; });
          // lift passages along an arc while they travel between zones
          var arc = Math.sin(Math.PI * e) * (Math.abs(g.x - f.x) > 1 ? 0.8 : 0);
          var v = { x: c.x, y: c.y + arc, z: c.z + arc * 0.5, sx: c.sx, sy: c.sy, sz: c.sz, op: c.op, r: c.r, g: c.g, b: c.b, e: c.e };
          apply(it, v);
        });
        if (!busy) anim = null;
      }
      if (flowAt(now)) busy = true;
      renderer.render(scene, camera);
      placeLabels();
      if (busy || drag) kick();
    }
    function kick() { if (!raf && !destroyed) raf = requestAnimationFrame(frameStep); }
    function placeLabels() {
      var v = new THREE.Vector3();
      Object.keys(anchors).forEach(function (k) {
        v.copy(anchors[k]).project(camera);
        labs[k].style.left = ((v.x + 1) / 2 * W) + 'px';
        labs[k].style.top = ((1 - v.y) / 2 * H) + 'px';
        labs[k].classList.toggle('is-cur', curLab[curStep] === k);
      });
      labs.drop.style.opacity = curStep >= 3 ? '1' : '0';
      labs.q.style.opacity = curStep === 0 ? '1' : '0';
      labs.ans.style.opacity = curStep === 5 ? '1' : '0';
      var own = st.pipe !== 'hybrid';
      labs.mid.textContent = own ? I(st.pipe === 'hr' ? 'pipe.stage.rerank' : 'pipe.stage.select') : '';
      labs.mid.style.opacity = curStep === 2 && own ? '1' : '0';
    }
    function resize() {
      W = stage.clientWidth; H = stage.clientHeight;
      if (!W || !H) return;
      renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); fit(); placeCam(); kick();
    }
    var ro = 'ResizeObserver' in window ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(stage);
    function retheme() {
      readColors();
      frameMat.color.copy(col.frame); guideMat.color.copy(col.lineMuted); postMat.color.copy(col.lineMuted); readerMat.color.copy(col.surf);
      grid.material.dispose(); scene.remove(grid);
      grid = new THREE.GridHelper(30, 30, col.grid2, col.grid); grid.position.y = FLOOR; grid.material.transparent = true; grid.material.opacity = 0.75; scene.add(grid);
      if (docEdges) docEdges.material.color.copy(col.turq);
      conMat.color.copy(col.lineMuted); pMat.color.copy(col.turq);
      if (items.Q) items.Q.mesh.material.color.copy(col.accent);
      if (M) show(M, st.step, true);
    }
    function relabel() { labs.pool.textContent = S('l_pool'); labs.list.textContent = S('l_cands'); labs.pack.textContent = S('l_pack'); labs.reader.textContent = S('l_reader'); labs.drop.textContent = S('l_drop'); labs.q.textContent = I('pipe.st.q'); labs.ans.textContent = I('pipe.st.answer'); }
    var destroyed = false;
    function destroy() {
      destroyed = true; if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect();
      Object.keys(items).forEach(function (k) { items[k].mesh.material.dispose(); });
      if (docMesh) { docMesh.geometry.dispose(); docMesh.material.dispose(); }
      renderer.dispose(); try { renderer.forceContextLoss(); } catch (e) {}
    }
    return { setData: setData, show: show, retheme: retheme, relabel: relabel, destroy: destroy, kind: '3d',
      fps: function () { if (frames.length < 2) return 0; var span = frames[frames.length - 1] - frames[0]; return (frames.length - 1) * 1000 / span; },
      frames: frames, renderer: renderer };
  }

  /* ================= 2D view (SVG) ================= */
  function View2D(stage) {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'pv2'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('direction', 'ltr');
    stage.appendChild(svg);
    var M = null, L = null, rects = {}, docs = [], texts = {}, reader = null, frame = null;
    function el(tag, a, p) { var e = document.createElementNS(NS, tag); for (var k in a) e.setAttribute(k, a[k]); (p || svg).appendChild(e); return e; }
    function mirror(x, w) { return lang() === 'fa' ? L.W - x - w : x; }
    /* six rows, top to bottom in the order things happen: the question, the pool, the candidates, the pack, the
       reader, the answer. Between rows a short connector carries dashes that run downward while that stage plays. */
    var conns = [], pillQ = null, pillA = null, tag = null, zoneT = {};
    function layout() {
      var W = Math.max(280, stage.clientWidth), pad = 4, y = 0, n = M.ex.docs.length, G = 26;
      var cell = W < 500 ? 10 : 14, cols = Math.floor((W - 2 * pad) / cell), rows = Math.ceil(n / cols);
      var o = { W: W, pad: pad, cell: cell, cols: cols, gaps: [] };
      o.yQ = y + 2; o.qH = 24; y += o.qH + 2; o.gaps.push(y); y += G;
      o.yPoolL = y + 12; y += 20; o.yPool = y; y += rows * cell; o.gaps.push(y); y += G;
      o.yListL = y + 12; y += 20; o.yList = y; o.listH = W < 500 ? 46 : 64; y += o.listH; o.gaps.push(y); y += G;
      o.yPackL = y + 12; y += 20; o.yPack = y; o.packH = 24; y += o.packH; o.gaps.push(y); y += G;
      o.yReadL = y + 12; y += 20; o.yRead = y; o.readH = 64; y += o.readH; o.gaps.push(y); y += G;
      o.yA = y; o.aH = 26; y += o.aH + 4;
      o.G = G; o.H = y; o.colW = (W - 2 * pad) / 40;
      return o;
    }
    function pill(y, h, label, cls) {
      var g = el('g', { 'class': 'pill ' + cls });
      var w = Math.min(L.W - 2 * L.pad, Math.max(120, label.length * 8 + 40)), x = (L.W - w) / 2;
      el('path', { d: 'M' + x + ',' + y + 'h' + w + 'v' + h + 'h' + (-w) + 'z', 'class': 'pb' }, g); // a path, not a rect: a label sits on it
      var t = el('text', { x: L.W / 2, y: y + h / 2 + 4, 'text-anchor': 'middle' }, g); t.textContent = label;
      return g;
    }
    function setData(m) {
      M = m; svg.textContent = ''; rects = {}; conns = []; zoneT = {};
      L = layout();
      svg.setAttribute('viewBox', '0 0 ' + L.W + ' ' + L.H); svg.setAttribute('width', L.W); svg.setAttribute('height', L.H);
      var fa = lang() === 'fa';
      [['yPoolL', 'l_pool', 1], ['yListL', 'l_cands', 2], ['yPackL', 'l_pack', 3], ['yReadL', 'l_reader', 4]].forEach(function (z) {
        var t = el('text', { x: fa ? L.W - L.pad : L.pad, y: L[z[0]], 'class': 'zl', 'text-anchor': fa ? 'end' : 'start' });
        t.textContent = S(z[1]); texts[z[1]] = t; zoneT[z[2]] = t;
      });
      // the pipeline's own middle step, named at the end of the candidates' label row
      tag = el('text', { x: fa ? L.pad : L.W - L.pad, y: L.yListL, 'class': 'tag', 'text-anchor': fa ? 'start' : 'end' });
      // connectors, one per stage transition (0: question to pool ... 4: reader to answer)
      L.gaps.forEach(function (gy, i) {
        var g = el('g', { 'class': 'con' });
        el('line', { x1: L.W / 2, x2: L.W / 2, y1: gy + 3, y2: gy + L.G - 6 }, g);
        el('path', { d: 'M' + (L.W / 2 - 4) + ',' + (gy + L.G - 9) + 'l4,5l4,-5', 'class': 'head' }, g);
        conns.push(g);
      });
      pillQ = pill(L.yQ, L.qH, I('pipe.st.q'), 'q');
      pillA = pill(L.yA, L.aH, I('pipe.st.answer'), 'a');
      docs = M.ex.docs.map(function (d, i) {
        var c = i % L.cols, r = Math.floor(i / L.cols), s = L.cell - 3;
        return el('rect', { x: mirror(L.pad + c * L.cell, s), y: L.yPool + r * L.cell, width: s, height: s, 'class': 'doc' });
      });
      el('line', { x1: L.pad, x2: L.W - L.pad, y1: L.yList + L.listH, y2: L.yList + L.listH, stroke: 'var(--viz-line)', 'stroke-width': 1 });
      frame = el('rect', { x: L.pad, y: L.yPack, width: L.W - 2 * L.pad, height: L.packH, 'class': 'frame' });
      reader = el('rect', { x: L.pad, y: L.yRead, width: L.W - 2 * L.pad, height: L.readH, 'class': 'reader' });
      M.ids.forEach(function (pi) {
        var p = M.ex.passages[pi];
        var r = el('rect', { x: 0, y: 0, width: 1, height: 1, 'class': 'it hid ' + (p.sp.length ? 'ev' : 'ot') });
        rects[pi] = r;
        var b = docBox(p.d); r.style.transform = 'translate(' + b.x + 'px,' + b.y + 'px) scale(' + b.w + ',' + b.h + ')';
      });
    }
    function docBox(di) { var c = di % L.cols, r = Math.floor(di / L.cols), s = L.cell - 3; return { x: mirror(L.pad + c * L.cell, s), y: L.yPool + r * L.cell, w: s, h: s }; }
    var prevK = 0;
    function show(m, k, instant) {
      if (m !== M || !L || Math.abs(L.W - stage.clientWidth) > 2) setData(m);
      var back = k < prevK; prevK = k;
      svg.classList.toggle('instant', !!instant);
      docs.forEach(function (d, i) {
        d.setAttribute('class', 'doc' + (k >= 1 && M.srcDocs[i] ? ' src' : '') + (M.ex.docs[i].g ? ' gold' : ''));
      });
      reader.setAttribute('class', 'reader' + (k >= 4 && M.cell.full ? ' lit' : '') + (k === 4 ? ' cur' : ''));
      frame.setAttribute('class', 'frame' + (k === 3 ? ' cur' : ''));
      pillQ.setAttribute('class', 'pill q' + (k === 0 ? ' cur' : ' past'));
      pillA.setAttribute('class', 'pill a' + (k === 5 ? ' cur ' + (M.cell.correct ? 'ok' : 'no') : k < 5 ? ' wait' : ''));
      // the connector into the current stage runs; the ones already passed stay solid; the rest wait
      // connector i leads into stage i (0 question to pool ... 4 reader to answer); order/select happens inside the list
      var ci = [0, 1, -1, 2, 3, 4][k], done = [-1, 0, 1, 1, 2, 3][k];
      conns.forEach(function (g, i) { g.setAttribute('class', 'con' + (i === ci && !instant && !back ? ' run' : i <= done || i === ci ? ' past' : '')); });
      var curZone = [0, 2, 2, 3, 4, 0][k];
      [1, 2, 3, 4].forEach(function (z) { zoneT[z].setAttribute('class', 'zl' + (z === curZone ? ' cur' : '')); });
      var own = st.pipe !== 'hybrid';
      tag.textContent = own ? I(st.pipe === 'hr' ? 'pipe.stage.rerank' : 'pipe.stage.select') : '';
      tag.setAttribute('class', 'tag' + (k === 2 && own ? ' on' : ''));
      var evList = M.cell.pack.filter(function (q) { return q.sp.length > 0; }).map(function (q) { return q.p; });
      var nPack = Math.max(1, M.cell.pack.length);
      M.ids.forEach(function (pi) {
        var s = itemState(M, pi, k), p = M.ex.passages[pi], r = rects[pi], b;
        var hgt = L.listH * (0.25 + 0.75 * Math.min(p.n, 1200) / 1200);
        if (s.zone === 'doc') b = docBox(p.d);
        else if (s.zone === 'list' || s.zone === 'drop') { var w = Math.max(2, L.colW - 2); b = { x: mirror(L.pad + s.slot * L.colW + 1, w), y: L.yList + L.listH - hgt + (k === 2 && s.lose ? hgt * 0.35 : 0), w: w, h: hgt * (k === 2 && s.lose ? 0.65 : 1) }; }
        else if (s.zone === 'pack') { var full = L.W - 2 * L.pad - 4, a = s.pp.a * full, bb = s.pp.b * full; b = { x: mirror(L.pad + 2 + a, bb - a - 2), y: L.yPack + 3, w: Math.max(2, bb - a - 2), h: L.packH - 6 }; }
        else if (s.lit) { var j = evList.indexOf(pi), fw = Math.min(140, (L.W - 2 * L.pad - 24) / Math.max(1, evList.length)); b = { x: mirror(L.pad + 12 + j * (fw + 6), fw), y: L.yRead + L.readH / 2 - 7, w: fw, h: 14 }; }
        else b = { x: L.W / 2, y: L.yRead + L.readH / 2, w: 1, h: 1 };
        var d = instant || back ? 0 : k === 3 && s.zone === 'pack' ? (M.packIdx[pi] || 0) * (900 / nPack) : k === 3 ? 1000 : k >= 4 ? (M.packIdx[pi] || 0) * 60 : Math.min(450, (s.slot || 0) * 11);
        r.style.transitionDelay = d + 'ms';
        if (instant) r.style.transition = 'none'; else r.style.transition = '';
        r.style.transform = 'translate(' + b.x.toFixed(1) + 'px,' + b.y.toFixed(1) + 'px) scale(' + b.w.toFixed(2) + ',' + b.h.toFixed(2) + ')';
        var cls = 'it ' + (p.sp.length ? 'ev' : 'ot');
        if (s.vis === 0 || (s.zone === 'reader' && !s.lit)) cls += ' hid';
        else if (s.vis < 0.5) cls += ' dim';
        if (s.lit) cls += ' lit';
        if (k === 1 && s.zone === 'list') cls += ' new';
        if (k === 2 && s.pick) cls += ' pick';
        r.setAttribute('class', cls);
      });
    }
    function resize() { if (M) show(M, st.step, true); }
    var ro = 'ResizeObserver' in window ? new ResizeObserver(function () { if (L && Math.abs(L.W - stage.clientWidth) > 2) resize(); }) : null;
    if (ro) ro.observe(stage);
    return { setData: setData, show: show, retheme: function () {}, relabel: function () { if (M) { setData(M); show(M, st.step, true); } }, destroy: function () { if (ro) ro.disconnect(); }, kind: '2d', fps: function () { return 0; } };
  }

  /* ================= mounting ================= */
  var mode = null;
  function chooseMode() { return (webglOK() && mqWide.matches && window.__pvForce2D !== true) ? '3d' : '2d'; }
  function mountFor(md) { return md === '3d' ? (m3 || m2) : (m2 || m3); }
  var buildId = 0;
  function build(md) {
    if (view) { view.destroy(); view = null; }
    mode = md;
    var myId = ++buildId;
    var target = mountFor(md), other = target === m3 ? m2 : m3;
    if (other) { other.textContent = ''; other.setAttribute('hidden', ''); }
    target.removeAttribute('hidden');
    buildUI(target, md);
    if (md === '3d') {
      loadThree().then(function (THREE) {
        if (myId !== buildId) return; // a newer build (language change, breakpoint) replaced this one
        try { view = View3D(THREE, ui.stage); }
        catch (e) { if (window.console) console.warn('[pipeline3d] WebGL init failed, using 2D', e); build('2d'); return; }
        view.setData(model()); go(st.step, true); maybeAutoplay();
      }).catch(function (e) { if (window.console) console.warn('[pipeline3d]', e.message); build('2d'); });
    } else {
      view = View2D(ui.stage); view.setData(model()); go(st.step, true); maybeAutoplay();
    }
    syncUI(model());
  }
  function maybeAutoplay() {
    if (st.autoplayed || mqReduce.matches || !st.visible) return;
    st.autoplayed = true; start();
  }
  function init() {
    m3 = document.getElementById('pipeline3d'); m2 = document.getElementById('pipeline2d');
    if (!m3 && !m2) return;
    var host = m3 || m2, started = false;
    function begin() {
      if (started) return; started = true;
      fetch(BASE + 'viz_pipeline.json' + VQ, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
        D = d;
        st.ex = 0;
        build(chooseMode());
        var mq = function () { var md = chooseMode(); if (md !== mode) { stop(); build(md); } };
        if (mqWide.addEventListener) mqWide.addEventListener('change', mq); else if (mqWide.addListener) mqWide.addListener(mq);
      }).catch(function (e) { host.textContent = 'The pipeline view could not be loaded.'; if (window.console) console.warn('[pipeline3d]', e); });
    }
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          st.visible = e.isIntersecting;
          if (e.isIntersecting) { begin(); if (D && view) maybeAutoplay(); }
          else if (st.playing) stop();
        });
      }, { rootMargin: '200px 0px', threshold: 0 });
      io.observe(host); if (m2 && m2 !== host) io.observe(m2);
    } else { st.visible = true; begin(); }
    document.addEventListener('langchange', function () { if (D) { var was = st.playing; stop(); build(mode); if (was) start(); } });
    document.addEventListener('themechange', function () { if (view) setTimeout(function () { view.retheme(); if (view.kind === '2d') go(st.step, true); }, 30); });
    document.addEventListener('visibilitychange', function () { if (document.hidden && st.playing) stop(); });
  }
  window.AnyRAGPipeline = {
    state: st, go: function (k) { stop(); go(k); }, play: start, pause: stop,
    fps: function () { return view ? view.fps() : 0; }, mode: function () { return mode; }, view: function () { return view; }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
