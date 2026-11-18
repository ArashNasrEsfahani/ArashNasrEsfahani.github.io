/* AnyRAG 2D figures (W4). Classic script, no dependencies.
   Mounts: #fig-funnel #fig-budget #fig-components #fig-language #fig-stability
   Data:   assets/data/viz_<name>.json (+ viz_common.json). Every value carries a `src`.
   Language: reads <html lang>, re-renders on document 'langchange'; theme: re-renders on 'themechange'
   (colours are CSS tokens, so the redraw only refreshes measured text).
   A mount with data-viz-head="off" skips the built-in figure label, title and takeaway. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var SCRIPT = document.currentScript;
  var BASE = (function () {
    try { return new URL('../data/', SCRIPT && SCRIPT.src ? SCRIPT.src : location.href).href; }
    catch (e) { return 'assets/data/'; }
  })();
  var FIGS = ['funnel', 'budget', 'components', 'language', 'stability'];
  var cache = {};
  var COMMON = null;
  var uid = 0;

  /* ---------- helpers ---------- */
  function lang() { return (document.documentElement.lang || 'en').slice(0, 2) === 'fa' ? 'fa' : 'en'; }
  function rtl() { return lang() === 'fa'; }
  function T(o) { if (!o) return ''; if (typeof o === 'string') return o; if (o[lang()] && lang() === 'fa' && window.AnyRAGNum) return window.AnyRAGNum.signs(o.fa); return (o[lang()] || o.en || ''); }
  var N = window.AnyRAGNum || { num: function (n) { return String(n); }, signed: function (n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n); },
    range: function (a, b) { return a === b ? String(a) : a + '–' + b; }, iso: function (x) { return x; }, local: function (x) { return String(x); } };
  function fmt(n, d) { return N.num(n, d, lang()); }
  function fmtS(n) { return N.signed(n, 0, lang()); }
  function fmtR(r, d) { return N.range(r[0], r[1], { dec: d, compact: true }, lang()); }
  function fmtRS(r) { return N.range(r[0], r[1], { signed: true }, lang()); }
  function mid(r) { return (r[0] + r[1]) / 2; }
  function C(k) { return COMMON ? T(COMMON.strings[k]) : k; }
  function S(d, k) { return T(d.strings[k]); }
  function h(tag, attrs, parent, text) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) { if (attrs[k] != null) e.setAttribute(k, attrs[k]); }
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function s(tag, attrs, parent, text) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) { if (attrs[k] != null) e.setAttribute(k, attrs[k]); }
    if (text != null) e.textContent = tag === 'text' ? N.iso(String(text), lang()) : text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function lin(d0, d1, r0, r1) { var f = function (v) { return r0 + (v - d0) / (d1 - d0) * (r1 - r0); }; f.d = [d0, d1]; return f; }
  var measureCtx = null;
  function textW(str, size) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = (size || 12) + 'px ' + (rtl() ? 'Vazirmatn, sans-serif' : '"Instrument Sans", system-ui, sans-serif');
    return measureCtx.measureText(str).width;
  }
  function wrap(str, maxW, size) {
    var words = String(str).split(' '), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (cur && textW(t, size) > maxW) { lines.push(cur); cur = w; } else cur = t;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function fetchJSON(name) {
    if (!cache[name]) {
      cache[name] = fetch(BASE + 'viz_' + name + '.json', { cache: 'no-cache' }).then(function (r) {
        if (!r.ok) throw new Error('viz_' + name + '.json ' + r.status);
        return r.json();
      });
    }
    return cache[name];
  }
  function marker(shape, cx, cy, r, cls, parent) {
    if (shape === 'square') return s('rect', { x: cx - r * .9, y: cy - r * .9, width: r * 1.8, height: r * 1.8, 'class': cls }, parent);
    if (shape === 'triangle') return s('path', { d: 'M' + cx + ',' + (cy - r * 1.15) + 'L' + (cx + r * 1.1) + ',' + (cy + r * .8) + 'L' + (cx - r * 1.1) + ',' + (cy + r * .8) + 'Z', 'class': cls }, parent);
    if (shape === 'diamond') return s('path', { d: 'M' + cx + ',' + (cy - r * 1.2) + 'L' + (cx + r * 1.2) + ',' + cy + 'L' + cx + ',' + (cy + r * 1.2) + 'L' + (cx - r * 1.2) + ',' + cy + 'Z', 'class': cls }, parent);
    return s('circle', { cx: cx, cy: cy, r: r, 'class': cls }, parent);
  }
  function legendItem(ul, kind, cls, label, shape) {
    var li = h('li', null, ul);
    var sv = s('svg', { viewBox: '0 0 22 12', 'aria-hidden': 'true' }, li);
    if (kind === 'line') { s('line', { x1: 1, x2: 21, y1: 6, y2: 6, 'class': 'vz-line ' + cls.replace('f-', 's-') }, sv); marker(shape || 'circle', 11, 6, 3.5, cls + ' s-surf', sv).setAttribute('stroke-width', '1.5'); }
    else if (kind === 'ring') s('circle', { cx: 11, cy: 6, r: 4, 'class': 'f-surf ' + cls, 'stroke-width': 2 }, sv);
    else if (kind === 'rect') s('rect', { x: 3, y: 2, width: 16, height: 8, 'class': cls }, sv);
    else marker(shape || 'circle', 11, 6, 4.5, cls, sv);
    h('span', null, li, label);
    return li;
  }

  /* tooltip: value leads, label follows; content via textContent only */
  function Tip(plot) {
    var el = h('div', { 'class': 'vz-tip', role: 'presentation', 'aria-hidden': 'true' }, plot);
    return {
      show: function (title, rows, x, y) {
        el.textContent = '';
        if (title) h('div', { 'class': 'tt-h' }, el, title);
        rows.forEach(function (r) {
          var row = h('div', { 'class': 'tt-r' }, el);
          var k = h('span', { 'class': 'tt-k' }, row);
          k.style.background = r.color ? 'var(' + r.color + ')' : 'transparent';
          h('span', { 'class': 'tt-v' }, row, r.v);
          h('span', { 'class': 'tt-l' }, row, r.l);
        });
        el.classList.add('is-on');
        var pw = plot.clientWidth, tw = el.offsetWidth, th = el.offsetHeight;
        var left = x + 14; if (left + tw > pw) left = x - tw - 14; if (left < 0) left = Math.max(0, Math.min(pw - tw, x - tw / 2));
        var top = y - th - 10; if (top < 0) top = y + 14;
        el.style.left = left + 'px'; el.style.top = top + 'px';
      },
      hide: function () { el.classList.remove('is-on'); }
    };
  }
  function bindHit(g, tip, plot, getContent, anchor) {
    function at(ev) {
      var r = plot.getBoundingClientRect();
      var c = getContent();
      if (ev && ev.clientX != null) tip.show(c.title, c.rows, ev.clientX - r.left, ev.clientY - r.top);
      else { var a = anchor(); tip.show(c.title, c.rows, a[0], a[1]); }
      g.classList.add('is-on');
    }
    function off() { tip.hide(); g.classList.remove('is-on'); }
    g.addEventListener('pointermove', at);
    g.addEventListener('pointerdown', at);
    g.addEventListener('pointerleave', off);
    g.addEventListener('focus', function () { at(null); });
    g.addEventListener('blur', off);
  }

  /* frame: head, controls, plot, note, table toggle */
  function frame(mount, d, opts) {
    mount.textContent = '';
    var root = h('div', { 'class': 'vz vz-' + d.id }, mount);
    var hid = 'vz-' + d.id + '-t' + (++uid);
    if (mount.getAttribute('data-viz-head') !== 'off') {
      var head = h('div', { 'class': 'vz-head' }, root);
      h('span', { 'class': 'vz-fig' }, head, S(d, 'fig'));
      h('span', { 'class': 'vz-title', id: hid, dir: 'auto' }, head, S(d, 'title'));
      h('p', { 'class': 'vz-take', dir: 'auto' }, head, S(d, 'takeaway'));
    }
    var ctrls = opts && opts.controls ? h('div', { 'class': 'vz-ctrls' }, root) : null;
    var plot = h('div', { 'class': 'vz-plot' }, root);
    var note = h('p', { 'class': 'vz-note', dir: 'auto' }, root, S(d, 'note'));
    var btn = h('button', { type: 'button', 'class': 'vz-tbtn', 'aria-expanded': 'false' }, root, C('show_table'));
    var tw = h('div', { 'class': 'vz-tablewrap', hidden: '' }, root);
    tw.id = 'vz-' + d.id + '-tbl' + uid;
    btn.setAttribute('aria-controls', tw.id);
    var open = mount.__vzTableOpen === true;
    function setOpen(v) {
      open = v; mount.__vzTableOpen = v;
      btn.setAttribute('aria-expanded', String(v)); btn.textContent = v ? C('hide_table') : C('show_table');
      if (v) tw.removeAttribute('hidden'); else tw.setAttribute('hidden', '');
    }
    btn.addEventListener('click', function () { setOpen(!open); });
    setOpen(open);
    return { root: root, ctrls: ctrls, plot: plot, note: note, table: tw, titleId: hid, width: Math.max(280, plot.clientWidth || mount.clientWidth || 640) };
  }
  function table(wrap, caption, head, rows) {
    var t = h('table', { 'class': 'vz-table' }, wrap);
    h('caption', { dir: 'auto' }, t, caption);
    var tr = h('tr', null, h('thead', null, t));
    head.forEach(function (c) { h('th', { scope: 'col', 'class': c.num ? 'num' : null }, tr, c.l); });
    var tb = h('tbody', null, t);
    rows.forEach(function (r) {
      var row = h('tr', null, tb);
      r.forEach(function (c, i) {
        var td = h(i === 0 ? 'th' : 'td', { scope: i === 0 ? 'row' : null, 'class': (head[i] && head[i].num) ? 'num' : (head[i] && head[i].src ? 'src' : null) }, row, c);
      });
    });
    return t;
  }
  function seg(parent, label, items, current, onPick) {
    var wrap = h('div', { 'class': 'vz-segwrap' }, parent);
    if (label) h('span', { 'class': 'vz-seglab', id: 'seg' + (++uid) }, wrap, label + ' ');
    var g = h('div', { 'class': 'vz-seg', role: 'group', 'aria-labelledby': label ? 'seg' + uid : null }, wrap);
    items.forEach(function (it) {
      var b = h('button', { type: 'button', 'aria-pressed': String(it.k === current) }, g, it.l);
      b.addEventListener('click', function () { onPick(it.k); });
    });
    return wrap;
  }
  function svgRoot(plot, W, H, label, dirLTR) {
    // geometry is computed in LTR coordinates (mirrored by hand in RTL), so the SVG itself is always LTR;
    // Persian strings still shape right-to-left through the bidi algorithm.
    var sv = s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'group', 'aria-label': label, direction: 'ltr' }, plot);
    sv.style.maxWidth = W + 'px';
    return sv;
  }
  /* row layout shared by the row charts. Numeric axes run left to right in both languages (as in the budget and
     stability charts); in RTL only the label column moves to the right edge and the plot band shifts to the left. */
  function rowLayout(W, labelMax) {
    var narrow = W < 560;
    var lw = narrow ? 0 : Math.min(labelMax + 16, Math.round(W * 0.36));
    var padE = narrow ? 36 : 48;
    var x0 = lw, x1 = W - padE;
    return { narrow: narrow, lw: lw, x0: x0, x1: x1,
      X: function (scale) {
        if (!rtl() || narrow) return scale; // phones: labels sit above the rows, so the band keeps its place
        var sh = W - scale(scale.d[0]) - scale(scale.d[1]);
        var f = function (v) { return scale(v) + sh; }; f.d = scale.d; return f;
      },
      lx: rtl() ? W - 0 : 0, anchorStart: rtl() ? 'end' : 'start', anchorEnd: rtl() ? 'start' : 'end' };
  }

  /* ================= Fig: funnel ================= */
  function drawFunnel(mount, d) {
    var F = frame(mount, d);
    var W = F.width;
    var labels = d.rows.map(function (r) { return T(r.label); }).concat([T(d.gold.label)]);
    var L = rowLayout(W, Math.max.apply(null, labels.map(function (l) { return textW(l, 13); })));
    var sc = lin(0, d.n, L.x0 + 8, L.x1);
    var X = L.X(sc);
    var ul = h('ul', { 'class': 'vz-legend', 'aria-label': 'Legend' }, F.plot);
    F.plot.insertBefore(ul, F.plot.firstChild);
    legendItem(ul, 'ring', 's-ctx2', S(d, 'k_top40'));
    legendItem(ul, 'dot', 'f-acc', S(d, 'k_pack'));
    legendItem(ul, 'dot', 'f-ink', S(d, 'k_correct'), 'diamond');
    var rowH = L.narrow ? 50 : 38, top = 10;
    var all = d.rows.concat([{ key: 'gold', label: d.gold.label, top40: null, pack: d.gold.pack, correct: d.gold.correct, src: d.gold.src, gold: true }]);
    var H = top + all.length * rowH + 14 + 34;
    var sv = svgRoot(F.plot, W, H, S(d, 'title'));
    var tip = Tip(F.plot);
    var axisY = top + all.length * rowH + 8;
    [0, 30, 60, 90].forEach(function (t) {
      s('line', { x1: X(t), x2: X(t), y1: top - 4, y2: axisY, 'class': 'vz-grid' }, sv);
      s('text', { x: X(t), y: axisY + 15, 'text-anchor': 'middle', 'class': 'vz-t-muted num' }, sv, fmt(t));
    });
    s('text', { x: (X(0) + X(d.n)) / 2, y: axisY + 31, 'text-anchor': 'middle', 'class': 'vz-t-muted' }, sv, S(d, 'axis'));
    all.forEach(function (r, i) {
      var y0 = top + i * rowH;
      var cy = L.narrow ? y0 + 32 : y0 + rowH / 2;
      if (r.gold) s('line', { x1: 0, x2: W, y1: y0 + 1, y2: y0 + 1, 'class': 'vz-grid' }, sv);
      var g = s('g', { 'class': 'vz-row', tabindex: '0', role: 'img' }, sv);
      var lab = T(r.label);
      var aria = lab + ': ' + (r.top40 != null ? S(d, 'k_top40') + ' ' + fmt(r.top40) + ', ' : '') + S(d, 'k_pack') + ' ' + fmt(r.pack) + ', ' + S(d, 'k_correct') + ' ' + fmtR(r.correct) + ' ' + C('of') + ' ' + fmt(d.n);
      g.setAttribute('aria-label', aria);
      s('rect', { x: 0, y: y0 + 2, width: W, height: rowH - 4, 'class': 'vz-hit' }, g);
      if (L.narrow) s('text', { x: rtl() ? W : 0, y: y0 + 14, 'text-anchor': rtl() ? 'end' : 'start', 'class': 'vz-t-ink' }, g, lab);
      else s('text', { x: rtl() ? W : 0, y: cy + 4, 'text-anchor': rtl() ? 'end' : 'start', 'class': 'vz-t-ink' }, g, lab);
      if (r.top40 != null) s('line', { x1: X(r.pack), x2: X(r.top40), y1: cy, y2: cy, 'class': 'vz-line s-ctx', 'stroke-width': 2 }, g);
      if (r.correct[0] !== r.correct[1]) s('line', { x1: X(r.correct[0]), x2: X(r.correct[1]), y1: cy, y2: cy, 'class': 's-ink', 'stroke-width': 3, 'stroke-linecap': 'round' }, g);
      marker('diamond', X(mid(r.correct)), cy, 4.6, 'f-ink s-surf', g).setAttribute('stroke-width', '2');
      if (r.top40 != null) s('circle', { cx: X(r.top40), cy: cy, r: 5, 'class': 'f-surf s-ctx2', 'stroke-width': 2 }, g);
      s('circle', { cx: X(r.pack), cy: cy, r: 6, 'class': 'f-acc s-surf', 'stroke-width': 2 }, g);
      // direct label: the pack value (the series that matters), placed on the open side of the dot
      var leftOfPack = Math.min(r.pack, mid(r.correct), r.top40 == null ? 999 : r.top40) === r.pack ? -1 : 1;
      var lxv = X(r.pack) + leftOfPack * 11;
      var anchorStart = leftOfPack === 1;
      if (!(r.gold)) s('text', { x: lxv, y: cy - 9, 'text-anchor': anchorStart ? 'start' : 'end', 'class': 'vz-t-strong num' }, g, fmt(r.pack));
      bindHit(g, tip, F.plot, function () {
        var rows = [];
        if (r.top40 != null) rows.push({ v: fmt(r.top40), l: S(d, 'k_top40'), color: '--viz-ctx2' });
        rows.push({ v: fmt(r.pack), l: S(d, 'k_pack'), color: '--viz-accent' });
        rows.push({ v: fmtR(r.correct), l: S(d, 'k_correct'), color: '--viz-ink' });
        return { title: lab + ' · ' + S(d, 'axis'), rows: rows };
      }, function () { return [X(r.pack), cy]; });
    });
    table(F.table, S(d, 'title') + ' (' + C('of') + ' ' + fmt(d.n) + ')',
      [{ l: S(d, 'col_pipe') }, { l: S(d, 'k_top40'), num: 1 }, { l: S(d, 'k_pack'), num: 1 }, { l: S(d, 'k_correct'), num: 1 }, { l: C('source'), src: 1 }],
      all.map(function (r) { return [T(r.label), r.top40 == null ? '–' : fmt(r.top40), fmt(r.pack), fmtR(r.correct), r.src]; }));
  }

  /* ================= Fig: budget ================= */
  var budgetMode = 'chars';
  function drawBudget(mount, d) {
    var F = frame(mount, d, { controls: true });
    var show = ['hybrid', 'hr', 'lex5b'];
    var style = { hybrid: { c: 'ctx', shape: 'circle', v: '--viz-ctx' }, hr: { c: 'ctx2', shape: 'square', v: '--viz-ctx2' }, lex5b: { c: 'acc', shape: 'triangle', v: '--viz-accent' } };
    var ser = d.series.filter(function (x) { return show.indexOf(x.key) >= 0; });
    seg(F.ctrls, S(d, 'mode_label'), [{ k: 'chars', l: S(d, 'mode_chars') }, { k: 'tok', l: S(d, 'mode_tok') }], budgetMode, function (k) { budgetMode = k; drawBudget(mount, d); var b = mount.querySelector('.vz-seg button[aria-pressed="true"]'); if (b) b.focus(); });
    var ul = h('ul', { 'class': 'vz-legend', 'aria-label': 'Legend' }, F.plot);
    ser.forEach(function (x) { legendItem(ul, 'line', 'f-' + style[x.key].c, T(x.label), style[x.key].shape); });
    var W = F.width, narrow = W < 520;
    var ends = ser.map(function (x) { return textW(T(x.label), 12); });
    var padR = narrow ? 14 : Math.min(170, Math.max.apply(null, ends) + 26), padL = 40, padT = 12, padB = 46;
    var H = narrow ? 300 : 340;
    var tokMode = budgetMode === 'tok';
    var xMax = tokMode ? 11 : 25.5, xMin = tokMode ? 0.5 : 1;
    var xs = lin(xMin, xMax, padL, W - padR), ys = lin(40, 76, H - padB, padT);
    var sv = svgRoot(F.plot, W, H, S(d, 'title'), true);
    var tip = Tip(F.plot);
    [40, 50, 60, 70].forEach(function (t) {
      s('line', { x1: padL, x2: W - padR, y1: ys(t), y2: ys(t), 'class': 'vz-grid' }, sv);
      s('text', { x: padL - 8, y: ys(t) + 4, 'text-anchor': 'end', 'class': 'vz-t-muted num' }, sv, fmt(t));
    });
    var xt = tokMode ? [2, 4, 6, 8, 10] : [3, 6, 10, 15.5, 24];
    s('line', { x1: padL, x2: W - padR, y1: H - padB, y2: H - padB, 'class': 'vz-axis' }, sv);
    xt.forEach(function (t) { s('text', { x: xs(t), y: H - padB + 16, 'text-anchor': 'middle', 'class': 'vz-t-muted num' }, sv, fmt(t, t % 1 ? 1 : 0)); });
    s('text', { x: (padL + W - padR) / 2, y: H - 8, 'text-anchor': 'middle', 'class': 'vz-t-muted' }, sv, tokMode ? S(d, 'x_tok') : S(d, 'x_chars'));
    function px(p) { return xs(tokMode ? p.tok / 1000 : p.b / 1000); }
    var cross = s('line', { x1: 0, x2: 0, y1: padT, y2: H - padB, 'class': 'vz-cross', visibility: 'hidden' }, sv);
    var order = ser.slice().sort(function (a, b) { return a.key === 'lex5b' ? 1 : b.key === 'lex5b' ? -1 : 0; });
    var ptsG = {};
    order.forEach(function (x) {
      var st = style[x.key];
      var path = x.points.map(function (p, i) { return (i ? 'L' : 'M') + px(p).toFixed(1) + ',' + ys(mid(p.acc)).toFixed(1); }).join('');
      s('path', { d: path, 'class': 'vz-line s-' + st.c }, sv);
      var g = s('g', null, sv); ptsG[x.key] = g;
      x.points.forEach(function (p) {
        if (p.acc[0] !== p.acc[1]) s('line', { x1: px(p), x2: px(p), y1: ys(p.acc[0]), y2: ys(p.acc[1]), 'class': 's-' + st.c, 'stroke-width': 2 }, g);
        var m = marker(st.shape, px(p), ys(mid(p.acc)), 4.2, (tokMode && p.approx ? 'f-surf s-' + st.c : 'f-' + st.c + ' s-surf'), g);
        m.setAttribute('stroke-width', '2');
      });
    });
    // end labels with collision handling and leader lines
    if (!narrow) {
      var lab = ser.map(function (x) { var p = x.points[x.points.length - 1]; return { x: px(p), y: ys(mid(p.acc)), t: T(x.label), k: x.key }; });
      lab.sort(function (a, b) { return a.y - b.y; });
      var ly = lab.map(function (l) { return l.y; });
      var gapY = rtl() ? 19 : 15; // Persian glyphs are taller
      for (var it = 0; it < 20; it++) for (var i = 1; i < ly.length; i++) if (ly[i] - ly[i - 1] < gapY) { var dlt = (gapY - (ly[i] - ly[i - 1])) / 2; ly[i] += dlt; ly[i - 1] -= dlt; }
      lab.forEach(function (l, i) {
        var tx = W - padR + 14;
        if (Math.abs(ly[i] - l.y) > 2) s('path', { d: 'M' + (l.x + 6) + ',' + l.y + 'L' + (tx - 4) + ',' + ly[i], 'class': 'vz-axis f-none' }, sv);
        s('text', { x: tx, y: ly[i] + 4, 'class': l.k === 'lex5b' ? 'vz-t-strong' : 'vz-t-ink' }, sv, l.t);
      });
    }
    // crosshair layer (keyboard: arrow keys)
    var hit = s('rect', { x: padL, y: padT, width: W - padL - padR, height: H - padT - padB, 'class': 'vz-hit', tabindex: '0', role: 'img',
      'aria-label': S(d, 'title') + '. ' + ser.map(function (x) { return T(x.label) + ': ' + x.points.map(function (p) { return fmt(p.b) + ' → ' + fmtR(p.acc); }).join(', '); }).join('; ') }, sv);
    var cur = -1;
    function showIdx(i, ev) {
      cur = i;
      var xsAll = ser.map(function (x) { return px(x.points[i]); });
      var cx = xsAll.reduce(function (a, b) { return a + b; }, 0) / xsAll.length;
      if (!tokMode) { cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible'); }
      var rows = ser.slice().sort(function (a, b) { return mid(b.points[i].acc) - mid(a.points[i].acc); }).map(function (x) {
        var p = x.points[i];
        return { v: fmtR(p.acc), l: T(x.label) + (tokMode ? ' · ' + (lang() === 'fa' ? fmt(p.tok) + ' ' + S(d, 'col_tok') : fmt(p.tok / 1000, 1) + 'k') + (p.approx ? ' (' + S(d, 'approx') + ')' : '') : ''), color: style[x.key].v };
      });
      var r = F.plot.getBoundingClientRect(), sr = sv.getBoundingClientRect();
      var k = sr.width / W;
      tip.show(S(d, 'tip_budget').replace('{n}', fmt(ser[0].points[i].b)), rows, ev ? ev.clientX - r.left : cx * k, ev ? ev.clientY - r.top : ys(65) * k);
    }
    function nearest(ev) {
      var sr = sv.getBoundingClientRect(); var x = (ev.clientX - sr.left) * W / sr.width;
      var best = 0, bd = 1e9;
      for (var i = 0; i < ser[0].points.length; i++) {
        var dx = ser.reduce(function (a, s2) { return a + Math.abs(px(s2.points[i]) - x); }, 0);
        if (dx < bd) { bd = dx; best = i; }
      }
      return best;
    }
    hit.addEventListener('pointermove', function (ev) { showIdx(nearest(ev), ev); });
    hit.addEventListener('pointerdown', function (ev) { showIdx(nearest(ev), ev); });
    hit.addEventListener('pointerleave', function () { tip.hide(); cross.setAttribute('visibility', 'hidden'); });
    hit.addEventListener('focus', function () { showIdx(cur < 0 ? 0 : cur); });
    hit.addEventListener('blur', function () { tip.hide(); cross.setAttribute('visibility', 'hidden'); });
    hit.addEventListener('keydown', function (ev) {
      var n = ser[0].points.length;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') { showIdx(Math.min(n - 1, cur + 1)); ev.preventDefault(); }
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') { showIdx(Math.max(0, cur - 1)); ev.preventDefault(); }
    });
    var head = [{ l: S(d, 'col_budget'), num: 1 }];
    d.series.forEach(function (x) { head.push({ l: T(x.label), num: 1 }); });
    head.push({ l: C('source'), src: 1 });
    table(F.table, S(d, 'y') + ' / ' + S(d, 'col_tok'), head, d.series[0].points.map(function (p, i) {
      return [fmt(p.b)].concat(d.series.map(function (x) {
        var q = x.points[i]; return fmtR(q.acc) + ' (' + fmt(q.tok) + ' ' + S(d, 'col_tok').toLowerCase() + (q.approx ? '*' : '') + ')';
      })).concat(['S2a_packs/results.json; LEX5B 3,000/10,000/24,000: S8_factorial/results.json (*' + S(d, 'approx') + ')']);
    }));
  }

  /* ================= Fig: components ================= */
  function drawComponents(mount, d) {
    var F = frame(mount, d);
    var W = F.width;
    var L = rowLayout(W, Math.max.apply(null, d.rows.map(function (r) { return textW(T(r.label), 13); })));
    var sc = lin(-16, 10, L.x0 + 4, L.x1 - 20);
    var X = L.X(sc);
    var rowH = L.narrow ? 46 : 30, gH = 26, top = 24;
    var y = top, pos = [], lastG = null;
    d.rows.forEach(function (r) { if (r.group !== lastG) { y += gH; lastG = r.group; } pos.push(y); y += rowH; });
    var axisY = y + 6, H = axisY + 40;
    var sv = svgRoot(F.plot, W, H, S(d, 'title'));
    var tip = Tip(F.plot);
    [-15, -10, -5, 0, 5, 10].forEach(function (t) {
      s('line', { x1: X(t), x2: X(t), y1: top, y2: axisY, 'class': t === 0 ? 'vz-zero' : 'vz-grid' }, sv);
      s('text', { x: X(t), y: axisY + 15, 'text-anchor': 'middle', 'class': 'vz-t-muted num' }, sv, t === 0 ? fmt(0) : fmtS(t));
    });
    s('text', { x: X(0), y: top - 8, 'text-anchor': 'middle', 'class': 'vz-t-muted' }, sv, S(d, 'zero'));
    s('text', { x: rtl() ? W : 0, y: axisY + 32, 'text-anchor': rtl() ? 'end' : 'start', 'class': 'vz-t-muted' }, sv, S(d, 'axis'));
    lastG = null;
    d.rows.forEach(function (r, i) {
      var y0 = pos[i];
      if (r.group !== lastG) {
        lastG = r.group;
        s('text', { x: rtl() ? W : 0, y: y0 - 8, 'text-anchor': rtl() ? 'end' : 'start', 'class': 'vz-t-muted', 'font-weight': 500 }, sv, T(d.groups[r.group]));
      }
      var cy = L.narrow ? y0 + 30 : y0 + rowH / 2;
      var g = s('g', { 'class': 'vz-row', tabindex: '0', role: 'img' }, sv);
      var lab = T(r.label);
      g.setAttribute('aria-label', lab + ': ' + fmtRS(r.net) + ' (' + fmt(r.wl[0]) + '/' + fmt(r.wl[1]) + '), ' + fmtR(r.correct) + ' ' + C('of') + ' ' + fmt(d.n));
      s('rect', { x: 0, y: y0 + 1, width: W, height: rowH - 2, 'class': 'vz-hit' }, g);
      s('text', { x: rtl() ? W : 0, y: L.narrow ? y0 + 13 : cy + 4, 'text-anchor': rtl() ? 'end' : 'start', 'class': 'vz-t-ink' }, g, lab);
      var pos2 = r.net[0] >= 0;
      var near = pos2 ? Math.min(r.net[0], r.net[1]) : Math.max(r.net[0], r.net[1]);
      var far = pos2 ? Math.max(r.net[0], r.net[1]) : Math.min(r.net[0], r.net[1]);
      var cls = r.key === 'hr' ? 'f-acc' : 'f-ctx2';
      var bh = 12;
      var a = X(0), b = X(near), c = X(far);
      s('rect', { x: Math.min(a, b), y: cy - bh / 2, width: Math.abs(b - a), height: bh, 'class': cls }, g);
      if (far !== near) { var wr = s('rect', { x: Math.min(b, c), y: cy - bh / 2, width: Math.abs(c - b), height: bh, 'class': cls }, g); wr.setAttribute('opacity', '.4'); }
      var outward = far < 0 ? -1 : 1;
      s('text', { x: c + outward * 6, y: cy + 4, 'text-anchor': outward < 0 ? 'end' : 'start', 'class': 'vz-t-strong num' }, g, fmtRS(r.net).replace(' to ', '…'));
      bindHit(g, tip, F.plot, function () {
        return { title: lab, rows: [
          { v: fmtRS(r.net), l: S(d, 'col_net'), color: r.key === 'hr' ? '--viz-accent' : '--viz-ctx2' },
          { v: fmt(r.wl[0]) + ' / ' + fmt(r.wl[1]), l: S(d, 'wl') },
          { v: fmtR(r.correct), l: S(d, 'col_correct') }] };
      }, function () { return [c, cy]; });
    });
    table(F.table, S(d, 'title') + '. ' + T(d.ref.label),
      [{ l: S(d, 'col_change') }, { l: S(d, 'col_net'), num: 1 }, { l: S(d, 'col_wl'), num: 1 }, { l: S(d, 'col_correct'), num: 1 }, { l: C('source'), src: 1 }],
      d.rows.map(function (r) { return [T(d.groups[r.group]) + ': ' + T(r.label), fmtRS(r.net), fmt(r.wl[0]) + ' / ' + fmt(r.wl[1]), fmtR(r.correct), r.src]; }));
  }

  /* ================= Fig: language ================= */
  var langPool = 'fa';
  function drawLanguage(mount, d) {
    var F = frame(mount, d);
    var W = F.width;
    var tip = Tip(F.plot);
    // panel a: token ratio
    h('p', { 'class': 'vz-sub', dir: 'auto' }, F.plot, S(d, 'a_title'));
    var L = rowLayout(W, Math.max.apply(null, d.tokens.map(function (r) { return textW(T(r.label), 13); })));
    var sc = lin(0, 3.2, L.x0 + 4, L.x1 - 10), X = L.X(sc);
    var rowH = L.narrow ? 46 : 28, top = 18; // phones: the name sits on its own line above the bar
    var H = top + d.tokens.length * rowH + 40;
    var sv = svgRoot(F.plot, W, H, S(d, 'a_title'));
    var axisY = top + d.tokens.length * rowH + 4;
    [0, 1, 2, 3].forEach(function (t) {
      s('line', { x1: X(t), x2: X(t), y1: top - 4, y2: axisY, 'class': t === 1 ? 'vz-zero' : 'vz-grid' }, sv);
      s('text', { x: X(t), y: axisY + 15, 'text-anchor': 'middle', 'class': 'vz-t-muted num' }, sv, fmt(t) + '×');
    });
    s('text', { x: X(1), y: top - 8, 'text-anchor': 'middle', 'class': 'vz-t-muted' }, sv, S(d, 'a_even'));
    s('text', { x: rtl() ? W : 0, y: axisY + 32, 'text-anchor': rtl() ? 'end' : 'start', 'class': 'vz-t-muted' }, sv, S(d, 'a_axis'));
    d.tokens.forEach(function (r, i) {
      var y0 = top + i * rowH, cy = L.narrow ? y0 + 31 : y0 + rowH / 2;
      var g = s('g', { 'class': 'vz-row', tabindex: '0', role: 'img' }, sv);
      var lab = T(r.label);
      g.setAttribute('aria-label', lab + ': ' + fmt(r.ratio, 2) + '× (' + fmt(r.fa, 3) + ' / ' + fmt(r.en, 3) + ')');
      s('rect', { x: 0, y: y0 + 1, width: W, height: rowH - 2, 'class': 'vz-hit' }, g);
      s('text', { x: rtl() ? W : 0, y: L.narrow ? y0 + 12 : cy + 4, 'text-anchor': rtl() ? 'end' : 'start', 'class': r.primary ? 'vz-t-strong' : 'vz-t-ink' }, g, lab);
      var a = X(0), b = X(r.ratio);
      s('rect', { x: Math.min(a, b), y: cy - 6, width: Math.abs(b - a), height: 12, 'class': r.primary ? 'f-acc' : 'f-ctx' }, g);
      s('text', { x: b + 6, y: cy + 4, 'text-anchor': 'start', 'class': (r.primary ? 'vz-t-strong' : 'vz-t-ink') + ' num' }, g, fmt(r.ratio, 2) + '×');
      bindHit(g, tip, F.plot, function () {
        return { title: lab, rows: [{ v: fmt(r.ratio, 2) + '×', l: S(d, 'col_ratio'), color: r.primary ? '--viz-accent' : '--viz-ctx' },
          { v: fmt(r.fa, 3), l: S(d, 'col_fa') }, { v: fmt(r.en, 3), l: S(d, 'col_en') }] };
      }, function () { return [b, cy]; });
    });
    // panel b: cross-lingual
    h('p', { 'class': 'vz-sub', dir: 'auto' }, F.plot, S(d, 'b_title'));
    var ctr = h('div', { 'class': 'vz-ctrls' }, F.plot);
    seg(ctr, null, [{ k: 'fa', l: S(d, 'pool_fa') }, { k: 'en', l: S(d, 'pool_en') }], langPool, function (k) {
      langPool = k; drawLanguage(mount, d);
      var bb = mount.querySelectorAll('.vz-seg button'); for (var q = 0; q < bb.length; q++) if (bb[q].getAttribute('aria-pressed') === 'true') bb[q].focus();
    });
    var ul = h('ul', { 'class': 'vz-legend', 'aria-label': 'Legend' }, F.plot);
    legendItem(ul, 'ring', 's-ctx2', S(d, 'orig'));
    legendItem(ul, 'dot', 'f-ink', S(d, 'trans'));
    var L2 = rowLayout(W, Math.max.apply(null, d.crossling.map(function (r) { return textW(T(r.label), 13); })));
    var sc2 = lin(0, d.per_pool, L2.x0 + 8, L2.x1), X2 = L2.X(sc2);
    var rh = L2.narrow ? 44 : 30, t2 = 8;
    var H2 = t2 + d.crossling.length * rh + 40;
    var sv2 = svgRoot(F.plot, W, H2, S(d, 'b_title'));
    var ay = t2 + d.crossling.length * rh + 4;
    [0, 15, 30, 45].forEach(function (t) {
      s('line', { x1: X2(t), x2: X2(t), y1: t2, y2: ay, 'class': 'vz-grid' }, sv2);
      s('text', { x: X2(t), y: ay + 15, 'text-anchor': 'middle', 'class': 'vz-t-muted num' }, sv2, fmt(t));
    });
    s('text', { x: rtl() ? W : 0, y: ay + 32, 'text-anchor': rtl() ? 'end' : 'start', 'class': 'vz-t-muted' }, sv2, S(d, 'b_axis'));
    d.crossling.forEach(function (r, i) {
      var v = r[langPool], y0 = t2 + i * rh, cy = L2.narrow ? y0 + 30 : y0 + rh / 2;
      var g = s('g', { 'class': 'vz-row', tabindex: '0', role: 'img' }, sv2);
      var lab = T(r.label), acc = r.key === 'bm25';
      g.setAttribute('aria-label', lab + ': ' + fmt(v[0]) + ' → ' + fmt(v[1]) + ' ' + C('of') + ' ' + fmt(d.per_pool));
      s('rect', { x: 0, y: y0 + 1, width: W, height: rh - 2, 'class': 'vz-hit' }, g);
      s('text', { x: rtl() ? W : 0, y: L2.narrow ? y0 + 13 : cy + 4, 'text-anchor': rtl() ? 'end' : 'start', 'class': acc ? 'vz-t-strong' : 'vz-t-ink' }, g, lab);
      s('line', { x1: X2(v[0]), x2: X2(v[1]), y1: cy, y2: cy, 'class': 'vz-line ' + (acc ? 's-acc' : 's-ctx'), 'stroke-width': acc ? 3 : 2 }, g);
      s('circle', { cx: X2(v[0]), cy: cy, r: 5, 'class': 'f-surf s-ctx2', 'stroke-width': 2 }, g);
      s('circle', { cx: X2(v[1]), cy: cy, r: 5.5, 'class': (acc ? 'f-acc' : 'f-ink') + ' s-surf', 'stroke-width': 2 }, g);
      var lft = v[1] < v[0];
      var outx = X2(v[1]) + (lft ? -10 : 10);
      s('text', { x: outx, y: cy + 4, 'text-anchor': lft ? 'end' : 'start', 'class': 'vz-t-strong num' }, g, fmt(v[1]));
      bindHit(g, tip, F.plot, function () {
        return { title: lab + ' · ' + (langPool === 'fa' ? S(d, 'pool_fa') : S(d, 'pool_en')), rows: [
          { v: fmt(v[0]), l: S(d, 'orig'), color: '--viz-ctx2' }, { v: fmt(v[1]), l: S(d, 'trans'), color: acc ? '--viz-accent' : '--viz-ink' }] };
      }, function () { return [X2(v[1]), cy]; });
    });
    var wrap = F.table;
    table(wrap, S(d, 'a_title'), [{ l: S(d, 'col_reader') }, { l: S(d, 'col_fa'), num: 1 }, { l: S(d, 'col_en'), num: 1 }, { l: S(d, 'col_ratio'), num: 1 }, { l: C('source'), src: 1 }],
      d.tokens.map(function (r) { return [T(r.label), fmt(r.fa, 3), fmt(r.en, 3), fmt(r.ratio, 2), r.src]; }));
    table(wrap, S(d, 'b_title') + ' (' + C('of') + ' ' + fmt(d.per_pool) + ')',
      [{ l: S(d, 'col_method') }, { l: S(d, 'pool_fa') + ': ' + S(d, 'orig') + ' → ' + S(d, 'trans'), num: 1 }, { l: S(d, 'pool_en') + ': ' + S(d, 'orig') + ' → ' + S(d, 'trans'), num: 1 }, { l: C('source'), src: 1 }],
      d.crossling.map(function (r) { return [T(r.label), fmt(r.fa[0]) + ' → ' + fmt(r.fa[1]), fmt(r.en[0]) + ' → ' + fmt(r.en[1]), r.src]; }));
  }

  /* ================= Fig: stability ================= */
  var stabPick = 'lex5b';
  function drawStability(mount, d) {
    var F = frame(mount, d, { controls: true });
    var shapes = { hybrid: 'circle', hr: 'square', lex5b: 'triangle', setr: 'diamond' };
    seg(F.ctrls, S(d, 'pick'), d.series.map(function (x) { return { k: x.key, l: T(x.label) }; }), stabPick, function (k) {
      stabPick = k; drawStability(mount, d); var b = mount.querySelector('.vz-seg button[aria-pressed="true"]'); if (b) b.focus();
    });
    var ul = h('ul', { 'class': 'vz-legend', 'aria-label': 'Legend' }, F.plot);
    d.series.forEach(function (x) { legendItem(ul, 'dot', x.key === stabPick ? 'f-acc' : 'f-ctx2', T(x.label), shapes[x.key]); });
    var W = F.width, narrow = W < 560;
    var padL = 38, padR = 10, padT = narrow ? 56 : 40, padB = narrow ? 48 : 40, H = narrow ? 336 : 330;
    var nC = d.conditions.length;
    // column centres with a gap between groups
    var gaps = [], gx = 0, prev = null;
    d.conditions.forEach(function (c) { if (prev && c.group !== prev) gx += 0.6; gaps.push(gx); gx += 1; prev = c.group; });
    var xs = lin(-0.5, gx - 0.5, padL + 6, W - padR - 6), ys = lin(55, 80, H - padB, padT);
    var sv = svgRoot(F.plot, W, H, S(d, 'title'), true);
    var tip = Tip(F.plot);
    [55, 60, 65, 70, 75, 80].forEach(function (t) {
      s('line', { x1: padL, x2: W - padR, y1: ys(t), y2: ys(t), 'class': 'vz-grid' }, sv);
      s('text', { x: padL - 8, y: ys(t) + 4, 'text-anchor': 'end', 'class': 'vz-t-muted num' }, sv, fmt(t));
    });
    // group bands + labels
    var grpKeys = []; d.conditions.forEach(function (c) { if (grpKeys.indexOf(c.group) < 0) grpKeys.push(c.group); });
    grpKeys.forEach(function (gk) {
      var idx = []; d.conditions.forEach(function (c, i) { if (c.group === gk) idx.push(i); });
      var a = xs(gaps[idx[0]] - 0.45), b = xs(gaps[idx[idx.length - 1]] + 0.45);
      s('line', { x1: a, x2: b, y1: padT - 14, y2: padT - 14, 'class': 'vz-axis' }, sv);
      var ls = wrap(T(d.groups[gk]), b - a, 11.5);
      ls.forEach(function (ln, j) { s('text', { x: (a + b) / 2, y: padT - 20 - (ls.length - 1 - j) * (rtl() ? 15 : 13), 'text-anchor': 'middle', 'class': 'vz-t-muted' }, sv, ln); });
    });
    var colW = (xs(1) - xs(0)) * 0.94;
    d.conditions.forEach(function (c, i) {
      var cx = xs(gaps[i]);
      var full = T(c.label), lbl = (textW(full, 11.5) > colW * 2 - 4 || narrow) && c.short ? T(c.short) : full;
      wrap(lbl, colW, 11.5).slice(0, 2).forEach(function (ln, j) { s('text', { x: cx, y: H - padB + 16 + j * (rtl() ? 16 : 14), 'text-anchor': 'middle', 'class': 'vz-t-muted' }, sv, ln); });
    });
    var offs = { hybrid: -1.5, hr: -0.5, lex5b: 0.5, setr: 1.5 };
    var dx = Math.min(7, (xs(1) - xs(0)) / 9);
    var order = d.series.slice().sort(function (a, b) { return (a.key === stabPick) - (b.key === stabPick); });
    order.forEach(function (x) {
      var on = x.key === stabPick, cls = on ? 'acc' : 'ctx2';
      var g = s('g', { 'class': on ? '' : 'is-dim' }, sv);
      if (on) {
        // connect within each group only
        grpKeys.forEach(function (gk) {
          var pts = []; d.conditions.forEach(function (c, i) { if (c.group === gk) pts.push(i); });
          if (pts.length > 1) s('path', { d: pts.map(function (i, j) { return (j ? 'L' : 'M') + (xs(gaps[i]) + offs[x.key] * dx) + ',' + ys(mid(x.values[i])); }).join(''), 'class': 'vz-line s-acc', 'stroke-width': 1.5 }, g);
        });
      }
      x.values.forEach(function (v, i) {
        var cx = xs(gaps[i]) + offs[x.key] * dx;
        if (v[0] !== v[1]) s('line', { x1: cx, x2: cx, y1: ys(v[0]), y2: ys(v[1]), 'class': 's-' + cls, 'stroke-width': 2 }, g);
        marker(shapes[x.key], cx, ys(mid(v)), on ? 4.6 : 3.8, 'f-' + cls + ' s-surf', g).setAttribute('stroke-width', '2');
      });
    });
    // per-column hit areas (all four values)
    d.conditions.forEach(function (c, i) {
      var cx = xs(gaps[i]), w = (xs(1) - xs(0)) * 0.96;
      var g = s('g', { 'class': 'vz-row', tabindex: '0', role: 'img' }, sv);
      g.setAttribute('aria-label', T(c.label) + ': ' + d.series.map(function (x) { return T(x.label) + ' ' + fmtR(x.values[i]); }).join(', '));
      s('rect', { x: cx - w / 2, y: padT - 6, width: w, height: H - padB - padT + 12, 'class': 'vz-hit' }, g);
      bindHit(g, tip, F.plot, function () {
        return { title: T(d.groups[c.group]) + ' · ' + T(c.label), rows: d.series.slice().sort(function (a, b) { return mid(b.values[i]) - mid(a.values[i]); }).map(function (x) {
          return { v: fmtR(x.values[i]), l: T(x.label), color: x.key === stabPick ? '--viz-accent' : '--viz-ctx2' }; }) };
      }, function () { var k = sv.getBoundingClientRect().width / W; return [cx * k, ys(70) * k]; });
    });
    var head = [{ l: S(d, 'col_cond') }].concat(d.series.map(function (x) { return { l: T(x.label), num: 1 }; }));
    table(F.table, S(d, 'y'), head, d.conditions.map(function (c, i) { return [T(d.groups[c.group]) + ': ' + T(c.label)].concat(d.series.map(function (x) { return fmtR(x.values[i]); })); }));
    h('p', { 'class': 'vz-note' }, F.table, C('source') + ': ' + d.series[0].src.replace(/\[[A-Z0-9_]+\]/, '[arm]'));
  }

  var DRAW = { funnel: drawFunnel, budget: drawBudget, components: drawComponents, language: drawLanguage, stability: drawStability };
  var live = {};

  function render(name) {
    var m = live[name];
    if (!m || !m.data) return;
    try { DRAW[name](m.el, m.data); m.w = m.el.clientWidth; }
    catch (e) { m.el.textContent = ''; h('p', { 'class': 'vz-err' }, m.el, C('error')); if (window.console) console.warn('[viz2d]', name, e); }
  }
  function load(name) {
    var m = live[name];
    if (m.loading) return; m.loading = true;
    Promise.all([fetchJSON('common'), fetchJSON(name)]).then(function (r) {
      COMMON = r[0]; m.data = r[1]; render(name);
    }).catch(function (e) {
      m.el.textContent = ''; h('p', { 'class': 'vz-err' }, m.el, 'This figure could not be loaded.');
      if (window.console) console.warn('[viz2d]', e);
    });
  }
  function init() {
    var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); load(e.target.__vzName); } });
    }, { rootMargin: '400px 0px' }) : null;
    FIGS.forEach(function (name) {
      var el = document.getElementById('fig-' + name);
      if (!el) return;
      el.__vzName = name;
      live[name] = { el: el, data: null, w: 0 };
      if (io) io.observe(el); else load(name);
    });
    var t = null;
    function rerenderAll(force) {
      Object.keys(live).forEach(function (n) {
        var m = live[n]; if (!m.data) return;
        if (force || Math.abs(m.el.clientWidth - m.w) > 2) render(n);
      });
    }
    window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(function () { rerenderAll(false); }, 150); });
    document.addEventListener('langchange', function () { rerenderAll(true); });
    document.addEventListener('themechange', function () { rerenderAll(true); });
    // label widths and line heights are measured with the web fonts: redraw once they have arrived
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { rerenderAll(true); });
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', function () { clearTimeout(t); t = setTimeout(function () { rerenderAll(true); }, 120); });
  }
  window.AnyRAGViz2D = { render: function (n) { render(n); }, data: function (n) { return live[n] && live[n].data; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
