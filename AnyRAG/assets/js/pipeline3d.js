/* AnyRAG pipeline scene (W4). Classic script.
   3D (three.js 0.160.0 from cdnjs, loaded lazily) in #pipeline3d; 2D SVG fallback in #pipeline2d when WebGL is
   missing or the screen is narrower than 720 px. One shared controller: question, pipeline, five steps, play/pause.
   Data: assets/data/viz_pipeline.json (recorded development traces, reduced). Strings {en, fa}; fa "" falls back to en.
   Listens to 'langchange' and 'themechange' on document. Respects prefers-reduced-motion (no autoplay, no tweening). */
(function () {
  'use strict';
  var THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js';
  var NS = 'http://www.w3.org/2000/svg';
  var SCRIPT = document.currentScript;
  var BASE = (function () { try { return new URL('../data/', SCRIPT.src).href; } catch (e) { return 'assets/data/'; } })();
  var STEPS = 5, STEP_MS = 3600, BUDGET = 6000;
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
    return { ex: ex, cell: cell, list1: list1, list2: list2, ids: ids, packIdx: packIdx, packPos: packPos, ev1: ev1, srcDocs: srcDocs,
      evIds: ids.filter(function (i) { return ex.passages[i].sp.length > 0; }) };
  }
  /* state of item i at step k: {zone: 'doc'|'list'|'pack'|'reader', slot, vis, dim, lit} */
  function itemState(M, i, k) {
    var r1 = M.list1.indexOf(i), r2 = M.list2.indexOf(i), inPack = M.packIdx[i] != null, ev = M.ex.passages[i].sp.length > 0;
    if (k === 0) return { zone: 'doc', vis: 0 };
    if (k === 1) return r1 >= 0 ? { zone: 'list', slot: r1, vis: 1, ev: ev } : { zone: 'doc', vis: 0 };
    if (k === 2) return r2 >= 0 ? { zone: 'list', slot: r2, vis: 1, ev: ev } : (r1 >= 0 ? { zone: 'list', slot: r1, vis: 0.15, ev: ev, out: 1 } : { zone: 'doc', vis: 0 });
    if (k === 3) return inPack ? { zone: 'pack', vis: 1, ev: ev, pp: M.packPos[i] } : (r2 >= 0 ? { zone: 'list', slot: r2, vis: 0.28, ev: ev } : { zone: 'doc', vis: 0 });
    if (inPack && M.packPos[i].lit) return { zone: 'reader', vis: 1, ev: ev, pp: M.packPos[i], lit: true };
    return inPack ? { zone: 'pack', vis: 0.35, ev: ev, pp: M.packPos[i] } : (r2 >= 0 ? { zone: 'list', slot: r2, vis: 0.12, ev: ev } : { zone: 'doc', vis: 0 });
  }
  function caption(M, k) {
    var c = M.cell;
    if (k === 0) return fill(S('s0'), { docs: fmt(M.ex.docs.length) });
    if (k === 1) return fill(S('s1'), { ev: fmt(M.ev1) });
    if (k === 2) return S('s2_' + (st.pipe === 'lex5b' ? 'lex' : st.pipe));
    if (k === 3) return fill(S('s3'), { n: fmt(c.pack.length), chars: fmt(c.rendered) });
    return (c.correct ? S('s4_ok') : S('s4_no')) + ' ' + (c.full ? S('full_yes') : S('full_no'));
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
    var stage = h('div', { 'class': 'pv-stage' + (mode === '2d' ? ' is-2d' : ''), role: 'img', 'aria-label': S('stage_label') }, root);
    var key = h('ul', { 'class': 'pv-key', 'aria-hidden': 'true' }, root);
    [['k-ev', S('legend_ev')], ['k-ot', S('legend_other')], ['k-pk', S('l_pack')]].forEach(function (k) { var li = h('li', null, key); h('i', { 'class': k[0] }, li); h('span', null, li, k[1]); });
    var ctrl = h('div', { 'class': 'pv-ctrl' }, root);
    var prev = h('button', { type: 'button', 'class': 'pv-btn', 'aria-label': S('prev') }, ctrl, '‹');
    var play = h('button', { type: 'button', 'class': 'pv-btn pv-play' }, ctrl);
    var next = h('button', { type: 'button', 'class': 'pv-btn', 'aria-label': S('next') }, ctrl, '›');
    if (lang() === 'fa') { prev.textContent = '›'; next.textContent = '‹'; }
    var dots = h('div', { 'class': 'pv-dots', role: 'group', 'aria-label': S('step') }, ctrl);
    var dotB = [];
    for (var i = 0; i < STEPS; i++) (function (k) {
      var b = h('button', { type: 'button', 'aria-label': S('step') + ' ' + fmt(k + 1) + ' ' + S('of') + ' ' + fmt(STEPS) }, dots);
      b.addEventListener('click', function () { stop(); go(k); });
      dotB.push(b);
    })(i);
    var stepn = h('span', { 'class': 'pv-stepn', 'aria-hidden': 'true' }, ctrl);
    var cap = h('p', { 'class': 'pv-cap', 'aria-live': 'polite', dir: 'auto' }, root);
    var ans = h('div', { 'class': 'pv-ans', hidden: '' }, root);
    if (mode === '2d') h('p', { 'class': 'pv-fb', dir: 'auto' }, root, S('fallback'));
    h('p', { 'class': 'pv-note', dir: 'auto' }, root, S('note'));
    prev.addEventListener('click', function () { stop(); go(Math.max(0, st.step - 1)); });
    next.addEventListener('click', function () { stop(); go(Math.min(STEPS - 1, st.step + 1)); });
    play.addEventListener('click', function () { if (st.playing) stop(); else start(); });
    ui = { root: root, stage: stage, qBtns: qBtns, pBtns: pBtns, qt: qt, qgl: qgl, prev: prev, next: next, play: play, dots: dotB, stepn: stepn, cap: cap, ans: ans };
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
    ui.dots.forEach(function (b, i) { if (i === st.step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
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

  /* ================= 3D view ================= */
  function View3D(THREE, stage) {
    var W = stage.clientWidth, H = stage.clientHeight;
    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(W, H, false);
    renderer.setClearColor(0x000000, 0);
    stage.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(30, W / H, 0.5, 200);
    var hemi = new THREE.HemisphereLight(0xffffff, 0xb8b8b8, 1.5); scene.add(hemi);
    var dir = new THREE.DirectionalLight(0xffffff, 1.1); dir.position.set(6, 12, 9); scene.add(dir);
    var col = {};
    function readColors() {
      var r = ui.root;
      col.accent = new THREE.Color(css(r, '--viz-accent', '#3e5fb8'));
      col.turq = new THREE.Color(css(r, '--viz-turq', '#0f948c'));
      col.ctx = new THREE.Color(css(r, '--viz-ctx', '#b5b7bb'));
      col.ctx2 = new THREE.Color(css(r, '--viz-ctx2', '#7d8188'));
      col.ink = new THREE.Color(css(r, '--viz-ink', '#14161a'));
      col.line = new THREE.Color(css(r, '--viz-line', '#dcd8cc'));
      col.surf = new THREE.Color(css(r, '--viz-surface', '#fbfaf6'));
      col.soft = col.turq.clone().lerp(col.surf, 0.45);
      col.dark = col.surf.getHSL({}).l < 0.5;
    }
    readColors();

    // zones (world units)
    var Z = { poolX: -8.6, listX: -2.4, packX: 3.0, readerX: 8.4, top: 3.9, colH: 7.8 };
    var poolG = new THREE.Group(); scene.add(poolG);
    var docMesh = null, docData = [];
    var plateGeo = new THREE.BoxGeometry(1, 1, 1);
    var items = {}; // passage index -> {mesh, cur, tgt}
    var frameMat = new THREE.LineBasicMaterial({ color: col.accent, transparent: true, opacity: 0.9 });
    var frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.7, Z.colH, 0.7)), frameMat);
    frame.position.set(Z.packX, Z.top - Z.colH / 2, 0); scene.add(frame);
    var readerMat = new THREE.MeshStandardMaterial({ color: col.surf, roughness: 0.9, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false });
    var reader = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 2.6), readerMat);
    reader.position.set(Z.readerX, 0, 0); scene.add(reader);
    var readerEdgeMat = new THREE.LineBasicMaterial({ color: col.ink });
    var readerEdge = new THREE.LineSegments(new THREE.EdgesGeometry(reader.geometry), readerEdgeMat);
    reader.add(readerEdge);
    var guideMat = new THREE.LineBasicMaterial({ color: col.line });
    var guide = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.6, Z.colH, 0.01)), guideMat);
    guide.position.set(Z.listX, Z.top - Z.colH / 2, -0.4); scene.add(guide);

    // labels
    var labs = {};
    [['pool', 'l_pool'], ['list', 'l_cands'], ['pack', 'l_pack'], ['reader', 'l_reader']].forEach(function (p) {
      labs[p[0]] = h('div', { 'class': 'pv-lab', 'aria-hidden': 'true', dir: 'auto' }, stage, S(p[1]));
    });
    var anchors = { pool: new THREE.Vector3(Z.poolX, 2.6, 0), list: new THREE.Vector3(Z.listX, Z.top + 0.45, 0), pack: new THREE.Vector3(Z.packX, Z.top + 0.45, 0), reader: new THREE.Vector3(Z.readerX, 1.75, 0) };

    // camera orbit (limited)
    var orbit = { az: 0, el: 0.2, baseAz: 0, baseEl: 0.2, dist: 30 };
    function fit() {
      var aspect = W / H, vf = camera.fov * Math.PI / 180;
      var hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
      var needW = 12.4 / Math.tan(hf / 2), needH = 5.6 / Math.tan(vf / 2);
      orbit.dist = Math.max(needW, needH);
    }
    function placeCam() {
      var d = orbit.dist;
      camera.position.set(Math.sin(orbit.az) * Math.cos(orbit.el) * d, Math.sin(orbit.el) * d + 0.2, Math.cos(orbit.az) * Math.cos(orbit.el) * d);
      camera.lookAt(0, 0.1, 0);
    }
    fit(); placeCam();

    var drag = null;
    var cv = renderer.domElement;
    stage.addEventListener('pointerdown', function (e) { if (e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, az: orbit.az, el: orbit.el, id: e.pointerId }; stage.classList.add('is-drag'); try { stage.setPointerCapture(e.pointerId); } catch (x) {} });
    stage.addEventListener('pointermove', function (e) {
      if (!drag) return;
      orbit.az = Math.max(-0.5, Math.min(0.5, drag.az - (e.clientX - drag.x) * 0.004));
      orbit.el = Math.max(0.06, Math.min(0.5, drag.el + (e.clientY - drag.y) * 0.003));
      placeCam(); kick();
    });
    function endDrag() { if (!drag) return; drag = null; stage.classList.remove('is-drag'); }
    stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
    stage.addEventListener('dblclick', function () { orbit.az = orbit.baseAz; orbit.el = orbit.baseEl; placeCam(); kick(); });

    // ---------- data ----------
    var M = null;
    function docPos(di) { return docData[di] || { x: Z.poolX, y: 0, z: 0, h: 0.5 }; }
    function setData(m) {
      M = m;
      if (docMesh) { poolG.remove(docMesh); docMesh.geometry.dispose(); docMesh.material.dispose(); docMesh = null; }
      Object.keys(items).forEach(function (k) { scene.remove(items[k].mesh); items[k].mesh.material.dispose(); });
      items = {};
      var docs = m.ex.docs, n = docs.length;
      var cols = Math.ceil(Math.sqrt(n * 1.1)), rows = Math.ceil(n / cols);
      var sx = Math.min(0.55, 4.6 / cols), sz = Math.min(0.7, 4.8 / rows);
      var maxN = docs.reduce(function (a, d) { return Math.max(a, d.n); }, 1);
      docData = [];
      var mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
      docMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, n);
      var o = new THREE.Object3D();
      docs.forEach(function (d, i) {
        var c = i % cols, r = Math.floor(i / cols);
        var hgt = 0.35 + 1.5 * Math.log(1 + d.n) / Math.log(1 + maxN);
        var x = Z.poolX + (c - (cols - 1) / 2) * sx, z = (r - (rows - 1) / 2) * sz;
        docData.push({ x: x, y: -2.4 + hgt / 2, z: z, h: hgt });
        o.position.set(x, -2.4 + hgt / 2, z); o.scale.set(sx * 0.78, hgt, 0.05); o.updateMatrix();
        docMesh.setMatrixAt(i, o.matrix);
        docMesh.setColorAt(i, col.line);
      });
      poolG.add(docMesh);
      m.ids.forEach(function (pi) {
        var mt = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0, transparent: true, opacity: 0, color: col.ctx });
        var mesh = new THREE.Mesh(plateGeo, mt);
        var dp = docPos(m.ex.passages[pi].d);
        var cur = { x: dp.x, y: dp.y, z: dp.z, sx: 0.3, sy: 0.05, sz: 0.3, op: 0, r: col.ctx.r, g: col.ctx.g, b: col.ctx.b, e: 0 };
        mesh.position.set(cur.x, cur.y, cur.z); mesh.scale.set(cur.sx, cur.sy, cur.sz); mesh.visible = false;
        scene.add(mesh);
        items[pi] = { mesh: mesh, cur: cur, from: null, tgt: null, delay: 0 };
      });
    }
    function docColors(k) {
      if (!docMesh) return;
      M.ex.docs.forEach(function (d, i) {
        var c = col.line;
        if (k >= 1 && M.srcDocs[i]) c = col.ctx2;
        if (k >= 4 && d.g) c = col.soft;
        docMesh.setColorAt(i, c);
      });
      docMesh.instanceColor.needsUpdate = true;
    }
    function target(pi, k) {
      var s = itemState(M, pi, k), p = M.ex.passages[pi];
      var w = 0.7 + 1.7 * Math.min(p.n, 1200) / 1200;
      var base = s.ev ? (s.lit ? col.turq : col.soft) : col.ctx;
      if (s.zone === 'doc') { var dp = docPos(p.d); return { x: dp.x, y: dp.y + dp.h / 2, z: dp.z, sx: 0.3, sy: 0.05, sz: 0.3, op: 0, c: base, e: 0 }; }
      if (s.zone === 'list') return { x: Z.listX, y: Z.top - 0.1 - s.slot * (Z.colH / 40), z: 0, sx: w, sy: Z.colH / 40 * 0.62, sz: 0.55, op: s.vis, c: base, e: 0 };
      if (s.zone === 'pack') {
        var a = s.pp.a * Z.colH, b = s.pp.b * Z.colH;
        return { x: Z.packX, y: Z.top - (a + b) / 2, z: 0, sx: 2.4, sy: Math.max(0.04, (b - a) - 0.05), sz: 0.5, op: s.vis, c: base, e: 0 };
      }
      // reader: evidence pieces rest lit in front of the reader; the rest goes inside
      if (s.lit) {
        var evList = M.cell.pack.filter(function (q) { return q.sp.length > 0; }).map(function (q) { return q.p; });
        var j = evList.indexOf(pi), n = evList.length;
        return { x: Z.readerX, y: 0.9 - j * (1.8 / Math.max(1, n)) - 0.9 / Math.max(1, n) + 0.0, z: 1.42, sx: 2.1, sy: Math.min(0.32, 1.4 / Math.max(1, n)), sz: 0.12, op: 1, c: col.turq, e: 0.55 };
      }
      return { x: Z.readerX, y: 0, z: 0, sx: 1.2, sy: 0.1, sz: 0.8, op: 0, c: base, e: 0 };
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
    function show(m, k, instant) {
      if (m !== M) setData(m);
      docColors(k);
      readerEdgeMat.color.copy(k >= 4 ? (M.cell.full ? col.turq : col.ink) : col.ink);
      var dur = instant ? 0 : 1300;
      var order = M.ids.slice();
      order.forEach(function (pi, n) {
        var it = items[pi], t = target(pi, k);
        it.from = { x: it.cur.x, y: it.cur.y, z: it.cur.z, sx: it.cur.sx, sy: it.cur.sy, sz: it.cur.sz, op: it.cur.op, r: it.cur.r, g: it.cur.g, b: it.cur.b, e: it.cur.e };
        it.tgt = { x: t.x, y: t.y, z: t.z, sx: t.sx, sy: t.sy, sz: t.sz, op: t.op, r: t.c.r, g: t.c.g, b: t.c.b, e: t.e };
        var s1 = itemState(M, pi, k);
        it.delay = instant ? 0 : Math.min(500, (s1.zone === 'pack' || s1.zone === 'reader' ? (M.packIdx[pi] || 0) * 70 : (s1.slot || 0) * 9));
      });
      anim = { t0: performance.now(), dur: dur };
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
          var t = anim.dur ? (now - anim.t0 - it.delay) / anim.dur : 1;
          t = Math.max(0, Math.min(1, t));
          if (t < 1) busy = true;
          var e = ease(t), f = it.from, g = it.tgt, c = it.cur;
          ['x', 'y', 'z', 'sx', 'sy', 'sz', 'op', 'r', 'g', 'b', 'e'].forEach(function (k) { c[k] = f[k] + (g[k] - f[k]) * e; });
          // lift passages along an arc while they travel between zones
          var arc = Math.sin(Math.PI * e) * (Math.abs(g.x - f.x) > 1 ? 0.6 : 0);
          var v = { x: c.x, y: c.y + arc, z: c.z + arc * 0.5, sx: c.sx, sy: c.sy, sz: c.sz, op: c.op, r: c.r, g: c.g, b: c.b, e: c.e };
          apply(it, v);
        });
        if (!busy) anim = null;
      }
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
      });
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
      frameMat.color.copy(col.accent); guideMat.color.copy(col.line); readerMat.color.copy(col.surf);
      if (M) show(M, st.step, true);
    }
    function relabel() { labs.pool.textContent = S('l_pool'); labs.list.textContent = S('l_cands'); labs.pack.textContent = S('l_pack'); labs.reader.textContent = S('l_reader'); }
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
    function layout() {
      var W = Math.max(280, stage.clientWidth), pad = 4, y = 0, n = M.ex.docs.length;
      var cell = W < 500 ? 10 : 14, cols = Math.floor((W - 2 * pad) / cell), rows = Math.ceil(n / cols);
      var o = { W: W, pad: pad, cell: cell, cols: cols };
      o.yPoolL = y + 14; y += 22; o.yPool = y; y += rows * cell + 18;
      o.yListL = y + 12; y += 20; o.yList = y; o.listH = W < 500 ? 46 : 64; y += o.listH + 18;
      o.yPackL = y + 12; y += 20; o.yPack = y; o.packH = 24; y += o.packH + 18;
      o.yReadL = y + 12; y += 20; o.yRead = y; o.readH = 64; y += o.readH + 6;
      o.H = y; o.colW = (W - 2 * pad) / 40;
      return o;
    }
    function setData(m) {
      M = m; svg.textContent = ''; rects = {};
      L = layout();
      svg.setAttribute('viewBox', '0 0 ' + L.W + ' ' + L.H); svg.setAttribute('width', L.W); svg.setAttribute('height', L.H);
      [['yPoolL', 'l_pool'], ['yListL', 'l_cands'], ['yPackL', 'l_pack'], ['yReadL', 'l_reader']].forEach(function (z) {
        var t = el('text', { x: lang() === 'fa' ? L.W - L.pad : L.pad, y: L[z[0]], 'class': 'zl', 'text-anchor': lang() === 'fa' ? 'end' : 'start' });
        t.textContent = S(z[1]); texts[z[1]] = t;
      });
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
    function show(m, k, instant) {
      if (m !== M || !L || Math.abs(L.W - stage.clientWidth) > 2) setData(m);
      svg.classList.toggle('instant', !!instant);
      docs.forEach(function (d, i) {
        d.setAttribute('class', 'doc' + (k >= 1 && M.srcDocs[i] ? ' src' : '') + (k >= 4 && M.ex.docs[i].g ? ' gold' : ''));
      });
      reader.setAttribute('class', 'reader' + (k >= 4 && M.cell.full ? ' lit' : ''));
      var evList = M.cell.pack.filter(function (q) { return q.sp.length > 0; }).map(function (q) { return q.p; });
      M.ids.forEach(function (pi) {
        var s = itemState(M, pi, k), p = M.ex.passages[pi], r = rects[pi], b;
        var hgt = L.listH * (0.25 + 0.75 * Math.min(p.n, 1200) / 1200);
        if (s.zone === 'doc') b = docBox(p.d);
        else if (s.zone === 'list') { var w = Math.max(2, L.colW - 2); b = { x: mirror(L.pad + s.slot * L.colW + 1, w), y: L.yList + L.listH - hgt, w: w, h: hgt }; }
        else if (s.zone === 'pack') { var full = L.W - 2 * L.pad - 4, a = s.pp.a * full, bb = s.pp.b * full; b = { x: mirror(L.pad + 2 + a, bb - a - 2), y: L.yPack + 3, w: Math.max(2, bb - a - 2), h: L.packH - 6 }; }
        else if (s.lit) { var j = evList.indexOf(pi), fw = Math.min(140, (L.W - 2 * L.pad - 24) / Math.max(1, evList.length)); b = { x: mirror(L.pad + 12 + j * (fw + 6), fw), y: L.yRead + L.readH / 2 - 7, w: fw, h: 14 }; }
        else b = { x: L.W / 2, y: L.yRead + L.readH / 2, w: 1, h: 1 };
        r.style.transitionDelay = instant ? '0ms' : Math.min(400, (s.zone === 'pack' || s.zone === 'reader' ? (M.packIdx[pi] || 0) * 60 : (s.slot || 0) * 8)) + 'ms';
        if (instant) r.style.transition = 'none'; else r.style.transition = '';
        r.style.transform = 'translate(' + b.x.toFixed(1) + 'px,' + b.y.toFixed(1) + 'px) scale(' + b.w.toFixed(2) + ',' + b.h.toFixed(2) + ')';
        var cls = 'it ' + (p.sp.length ? 'ev' : 'ot');
        if (s.vis === 0 || (s.zone === 'reader' && !s.lit)) cls += ' hid';
        else if (s.vis < 0.5) cls += ' dim';
        if (s.lit) cls += ' lit';
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
      fetch(BASE + 'viz_pipeline.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
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
