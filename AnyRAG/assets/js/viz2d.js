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
  /* cache-busting: the ?v= of this script's own URL (set in index.html) is added to the files it loads */
  var VQ = (function () { try { var v = new URL(document.currentScript.src).searchParams.get('v'); return v ? '?v=' + encodeURIComponent(v) : ''; } catch (e) { return ''; } })();
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
      cache[name] = fetch(BASE + 'viz_' + name + '.json' + VQ, { cache: 'no-cache' }).then(function (r) {
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
    if (opts && opts.noTable) return { root: root, ctrls: ctrls, plot: plot, note: note, table: null, titleId: hid, width: Math.max(280, plot.clientWidth || mount.clientWidth || 640) };
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

  /* ================= Fig: funnel =================
     Plain funnel bars for one pipeline (Hybrid by default, as in the video): all answerable questions, complete
     evidence in the top 40, complete evidence in the pack; then correct answers, against the gold-evidence reference.
     What each stage loses is drawn as a dashed ghost and named under the bar. The other pipelines sit behind the
     pipeline switch, and every number is in the table. HTML bars: text wraps and nothing can be clipped. */
  var funnelPick = 'hybrid';
  function drawFunnel(mount, d) {
    var F = frame(mount, d, { controls: true });
    var order = ['hybrid', 'hr', 'lex', 'fusion', 'bm25'];
    var rows = order.map(function (k) { return d.rows.filter(function (r) { return r.key === k; })[0]; }).filter(Boolean);
    var r = rows.filter(function (x) { return x.key === funnelPick; })[0] || rows[0];
    seg(F.ctrls, S(d, 'pick'), rows.map(function (x) { return { k: x.key, l: T(x.label) }; }), r.key, function (k) {
      funnelPick = k; drawFunnel(mount, d);
      var b = mount.querySelector('.vz-seg button[aria-pressed="true"]'); if (b) b.focus();
    });
    var n = d.n, pct = function (v) { return (100 * v / n).toFixed(2) + '%'; };
    var box = h('div', { 'class': 'fn' }, F.plot);
    function group(label) { h('p', { 'class': 'fn-g', dir: 'auto' }, box, label); }
    function bar(o) {
      var row = h('div', { 'class': 'fn-row ' + o.cls }, box);
      var lab = h('div', { 'class': 'fn-lab' }, row);
      h('span', { 'class': 'fn-name', dir: 'auto' }, lab, o.label);
      var track = h('div', { 'class': 'fn-track', dir: 'ltr', 'aria-hidden': 'true' }, row);
      var sc = h('div', { 'class': 'fn-scale' }, track);
      var b = h('span', { 'class': 'fn-bar' }, sc); b.style.width = pct(o.v[0]);
      if (o.v[1] > o.v[0]) { var rr = h('span', { 'class': 'fn-range' }, sc); rr.style.left = pct(o.v[0]); rr.style.width = pct(o.v[1] - o.v[0]); }
      if (o.from != null && o.from > o.v[1]) { var g = h('span', { 'class': 'fn-ghost' }, sc); g.style.left = pct(o.v[1]); g.style.width = pct(o.from - o.v[1]); }
      var num = h('span', { 'class': 'fn-num' }, sc, fmtR(o.v)); num.style.left = pct(Math.max(o.v[1], o.from || 0));
      // the number again for screen readers, in reading order
      h('span', { 'class': 'vz-sr' }, lab, ': ' + fmtR(o.v) + ' ' + C('of') + ' ' + fmt(n) + (o.loss ? '. ' + o.loss : ''));
      if (o.loss) h('p', { 'class': 'fn-loss', dir: 'auto', 'aria-hidden': 'true' }, row, o.loss);
    }
    group(S(d, 'g_evidence'));
    bar({ cls: 'fn-all', label: S(d, 'r_all'), v: [n, n] });
    bar({ cls: 'fn-top', label: S(d, 'r_top40'), v: [r.top40, r.top40], from: n, loss: S(d, 'loss1').replace('{n}', fmt(n - r.top40)) });
    bar({ cls: 'fn-pack', label: S(d, 'r_pack'), v: [r.pack, r.pack], from: r.top40, loss: S(d, 'loss2').replace('{n}', fmt(r.top40 - r.pack)) });
    group(S(d, 'g_answers'));
    bar({ cls: 'fn-ok', label: S(d, 'r_correct').replace('{p}', T(r.label)), v: r.correct });
    bar({ cls: 'fn-gold', label: T(d.gold.label), v: d.gold.correct });
    table(F.table, S(d, 'title') + ' (' + C('of') + ' ' + fmt(d.n) + ')',
      [{ l: S(d, 'col_pipe') }, { l: S(d, 'k_top40'), num: 1 }, { l: S(d, 'k_pack'), num: 1 }, { l: S(d, 'k_correct'), num: 1 }, { l: C('source'), src: 1 }],
      rows.map(function (x) { return [T(x.label), fmt(x.top40), fmt(x.pack), fmtR(x.correct), x.src]; })
        .concat([[T(d.gold.label), '–', fmt(d.gold.pack), fmtR(d.gold.correct), d.gold.src]]));
  }

  /* ================= Fig: budget ================= */
  var budgetMode = 'chars';
  function drawBudget(mount, d) {
    var F = frame(mount, d, { controls: true });
    // Lex-RAG with and without its selection call (the gap between the two is what the selection step is worth),
    // against the two controls; a band of plus or minus 2 answers around Lex-RAG marks the reader's run-to-run noise
    var show = ['hybrid', 'hr', 'fusion', 'lex5b'];
    var style = { hybrid: { c: 'ctx', shape: 'circle', v: '--viz-ctx' }, hr: { c: 'ctx2', shape: 'square', v: '--viz-ctx2' },
      fusion: { c: 'acc', shape: 'triangle', v: '--viz-accent', dash: true }, lex5b: { c: 'acc', shape: 'triangle', v: '--viz-accent' } };
    var ser = d.series.filter(function (x) { return show.indexOf(x.key) >= 0; });
    seg(F.ctrls, S(d, 'mode_label'), [{ k: 'chars', l: S(d, 'mode_chars') }, { k: 'tok', l: S(d, 'mode_tok') }], budgetMode, function (k) { budgetMode = k; drawBudget(mount, d); var b = mount.querySelector('.vz-seg button[aria-pressed="true"]'); if (b) b.focus(); });
    var W = F.width, narrow = W < 520;
    var ul = h('ul', { 'class': 'vz-legend', 'aria-label': S(d, 'legend') }, F.plot);
    // the lines carry direct labels at their ends; the legend lists them only on phones, where there is no room for that
    if (narrow) ser.forEach(function (x) { var li = legendItem(ul, 'line', 'f-' + style[x.key].c, T(x.label), style[x.key].shape); if (style[x.key].dash) li.classList.add('is-dash'); });
    legendItem(ul, 'rect', 'f-band', S(d, 'band'));
    var ends = ser.map(function (x) { return textW(T(x.label), 13); });
    var padR = narrow ? 14 : Math.min(230, Math.max.apply(null, ends) + 28), padL = 40, padT = 12, padB = 46;
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
    // the y axis starts at 40, not 0: draw the axis with a break mark
    s('line', { x1: padL, x2: padL, y1: padT, y2: H - padB - 12, 'class': 'vz-axis' }, sv);
    s('path', { d: 'M' + (padL - 5) + ',' + (H - padB - 6) + 'l10,-5M' + (padL - 5) + ',' + (H - padB - 1) + 'l10,-5', 'class': 'vz-axis f-none' }, sv);
    var cross = s('line', { x1: 0, x2: 0, y1: padT, y2: H - padB, 'class': 'vz-cross', visibility: 'hidden' }, sv);
    var lexS = ser.filter(function (x) { return x.key === 'lex5b'; })[0];
    if (lexS) {
      var up = lexS.points.map(function (p) { return px(p).toFixed(1) + ',' + ys(Math.min(76, mid(p.acc) + 2)).toFixed(1); });
      var dn = lexS.points.slice().reverse().map(function (p) { return px(p).toFixed(1) + ',' + ys(mid(p.acc) - 2).toFixed(1); });
      s('path', { d: 'M' + up.join('L') + 'L' + dn.join('L') + 'Z', 'class': 'f-band' }, sv);
    }
    var rank = { hybrid: 0, hr: 1, fusion: 2, lex5b: 3 };
    var order = ser.slice().sort(function (a, b) { return rank[a.key] - rank[b.key]; });
    var ptsG = {};
    order.forEach(function (x) {
      var st = style[x.key];
      var path = x.points.map(function (p, i) { return (i ? 'L' : 'M') + px(p).toFixed(1) + ',' + ys(mid(p.acc)).toFixed(1); }).join('');
      var ln = s('path', { d: path, 'class': 'vz-line s-' + st.c }, sv);
      if (st.dash) ln.setAttribute('stroke-dasharray', '5 4');
      var g = s('g', null, sv); ptsG[x.key] = g;
      x.points.forEach(function (p) {
        if (p.acc[0] !== p.acc[1]) s('line', { x1: px(p), x2: px(p), y1: ys(p.acc[0]), y2: ys(p.acc[1]), 'class': 's-' + st.c, 'stroke-width': 2 }, g);
        var hollow = st.dash || (tokMode && p.approx);
        var m = marker(st.shape, px(p), ys(mid(p.acc)), 4.2, (hollow ? 'f-surf s-' + st.c : 'f-' + st.c + ' s-surf'), g);
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
        s('text', { x: tx, y: ly[i] + 4, 'class': l.k === 'lex5b' || l.k === 'fusion' ? 'vz-t-strong' : 'vz-t-ink' }, sv, l.t);
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
    function farOf(r) { return r.net[0] >= 0 ? Math.max(r.net[0], r.net[1]) : Math.min(r.net[0], r.net[1]); }
    var lo = d.rows.reduce(function (a, r) { return farOf(r) < farOf(a) ? r : a; }), hi = d.rows.reduce(function (a, r) { return farOf(r) > farOf(a) ? r : a; });
    var padLo = farOf(lo) < 0 ? textW(fmtRS(lo.net), 14) + 20 : 4, padHi = farOf(hi) > 0 ? textW(fmtRS(hi.net), 14) + 20 : 20;
    // the scale ends at -16 and +10; the value labels sit beyond the bar ends, so the plot band leaves room for them
    var sc = lin(-16, 10, L.x0 + Math.max(4, padLo - 8), L.x1 - Math.max(8, padHi - 24));
    var X = L.X(sc);
    var rowH = L.narrow ? 48 : 32, gH = 28, top = 24;
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
    s('text', { x: rtl() ? W - 3 : 0, y: axisY + 32, 'text-anchor': rtl() ? 'end' : 'start', 'class': 'vz-t-muted' }, sv, S(d, 'axis'));
    lastG = null;
    d.rows.forEach(function (r, i) {
      var y0 = pos[i];
      if (r.group !== lastG) {
        lastG = r.group;
        s('text', { x: rtl() ? W - 3 : 0, y: y0 - 8, 'text-anchor': rtl() ? 'end' : 'start', 'class': 'vz-t-muted', 'font-weight': 500 }, sv, T(d.groups[r.group]));
      }
      var cy = L.narrow ? y0 + 30 : y0 + rowH / 2;
      var g = s('g', { 'class': 'vz-row', tabindex: '0', role: 'img' }, sv);
      var lab = T(r.label);
      g.setAttribute('aria-label', lab + ': ' + fmtRS(r.net) + ' (' + fmt(r.wl[0]) + '/' + fmt(r.wl[1]) + '), ' + fmtR(r.correct) + ' ' + C('of') + ' ' + fmt(d.n));
      s('rect', { x: 0, y: y0 + 1, width: W, height: rowH - 2, 'class': 'vz-hit' }, g);
      s('text', { x: rtl() ? W - 3 : 0, y: L.narrow ? y0 + 13 : cy + 4, 'text-anchor': rtl() ? 'end' : 'start', 'class': 'vz-t-ink' }, g, lab);
      var pos2 = r.net[0] >= 0;
      var near = pos2 ? Math.min(r.net[0], r.net[1]) : Math.max(r.net[0], r.net[1]);
      var far = pos2 ? Math.max(r.net[0], r.net[1]) : Math.min(r.net[0], r.net[1]);
      var cls = r.key === 'hr' ? 'f-acc' : 'f-ctx2';
      var bh = 12;
      var a = X(0), b = X(near), c = X(far);
      s('rect', { x: Math.min(a, b), y: cy - bh / 2, width: Math.abs(b - a), height: bh, 'class': cls }, g);
      if (far !== near) { var wr = s('rect', { x: Math.min(b, c), y: cy - bh / 2, width: Math.abs(c - b), height: bh, 'class': cls }, g); wr.setAttribute('opacity', '.4'); }
      var outward = far < 0 ? -1 : 1;
      s('text', { x: c + outward * 6, y: cy + 4, 'text-anchor': outward < 0 ? 'end' : 'start', 'class': 'vz-t-strong num' }, g, fmtRS(r.net));
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
    var sc = lin(0, 3.2, L.x0 + 14, L.x1 - 10), X = L.X(sc);
    var rowH = L.narrow ? 46 : 28, top = 18; // phones: the name sits on its own line above the bar
    var H = top + d.tokens.length * rowH + 40;
    var sv = svgRoot(F.plot, W, H, S(d, 'a_title'));
    var axisY = top + d.tokens.length * rowH + 4;
    [0, 1, 2, 3].forEach(function (t) {
      s('line', { x1: X(t), x2: X(t), y1: top - 4, y2: axisY, 'class': t === 1 ? 'vz-zero' : 'vz-grid' }, sv);
      s('text', { x: X(t), y: axisY + 15, 'text-anchor': 'middle', 'class': 'vz-t-muted num' }, sv, fmt(t) + '×');
    });
    s('text', { x: X(1), y: top - 8, 'text-anchor': 'middle', 'class': 'vz-t-muted' }, sv, S(d, 'a_even'));
    s('text', { x: rtl() ? W - 3 : 0, y: axisY + 32, 'text-anchor': rtl() ? 'end' : 'start', 'class': 'vz-t-muted' }, sv, S(d, 'a_axis'));
    d.tokens.forEach(function (r, i) {
      var y0 = top + i * rowH, cy = L.narrow ? y0 + 31 : y0 + rowH / 2;
      var g = s('g', { 'class': 'vz-row', tabindex: '0', role: 'img' }, sv);
      var lab = T(r.label);
      g.setAttribute('aria-label', lab + ': ' + fmt(r.ratio, 2) + '× (' + fmt(r.fa, 3) + ' / ' + fmt(r.en, 3) + ')');
      s('rect', { x: 0, y: y0 + 1, width: W, height: rowH - 2, 'class': 'vz-hit' }, g);
      s('text', { x: rtl() ? W - 3 : 0, y: L.narrow ? y0 + 12 : cy + 4, 'text-anchor': rtl() ? 'end' : 'start', 'class': r.primary ? 'vz-t-strong' : 'vz-t-ink' }, g, lab);
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
    var sc2 = lin(0, d.per_pool, L2.x0 + 30, L2.x1 - 6), X2 = L2.X(sc2);
    var rh = L2.narrow ? 46 : 32, t2 = 8;
    var H2 = t2 + d.crossling.length * rh + 40;
    var sv2 = svgRoot(F.plot, W, H2, S(d, 'b_title'));
    var ay = t2 + d.crossling.length * rh + 4;
    [0, 15, 30, 45].forEach(function (t) {
      s('line', { x1: X2(t), x2: X2(t), y1: t2, y2: ay, 'class': 'vz-grid' }, sv2);
      s('text', { x: X2(t), y: ay + 15, 'text-anchor': 'middle', 'class': 'vz-t-muted num' }, sv2, fmt(t));
    });
    s('text', { x: rtl() ? W - 3 : 0, y: ay + 32, 'text-anchor': rtl() ? 'end' : 'start', 'class': 'vz-t-muted' }, sv2, S(d, 'b_axis'));
    d.crossling.forEach(function (r, i) {
      var v = r[langPool], y0 = t2 + i * rh, cy = L2.narrow ? y0 + 30 : y0 + rh / 2;
      var g = s('g', { 'class': 'vz-row', tabindex: '0', role: 'img' }, sv2);
      var lab = T(r.label), acc = r.key === 'bm25';
      g.setAttribute('aria-label', lab + ': ' + fmt(v[0]) + ' → ' + fmt(v[1]) + ' ' + C('of') + ' ' + fmt(d.per_pool));
      s('rect', { x: 0, y: y0 + 1, width: W, height: rh - 2, 'class': 'vz-hit' }, g);
      s('text', { x: rtl() ? W - 3 : 0, y: L2.narrow ? y0 + 13 : cy + 4, 'text-anchor': rtl() ? 'end' : 'start', 'class': acc ? 'vz-t-strong' : 'vz-t-ink' }, g, lab);
      s('line', { x1: X2(v[0]), x2: X2(v[1]), y1: cy, y2: cy, 'class': 'vz-line ' + (acc ? 's-acc' : 's-ctx'), 'stroke-width': acc ? 3 : 2 }, g);
      s('circle', { cx: X2(v[0]), cy: cy, r: 5, 'class': 'f-surf s-ctx2', 'stroke-width': 2 }, g);
      s('circle', { cx: X2(v[1]), cy: cy, r: 5.5, 'class': (acc ? 'f-acc' : 'f-ink') + ' s-surf', 'stroke-width': 2 }, g);
      var lft = v[1] < v[0];
      s('text', { x: X2(v[1]) + (lft ? -10 : 10), y: cy + 4, 'text-anchor': lft ? 'end' : 'start', 'class': 'vz-t-strong num' }, g, fmt(v[1]));
      s('text', { x: X2(v[0]) + (lft ? 10 : -10), y: cy + 4, 'text-anchor': lft ? 'start' : 'end', 'class': 'vz-t-muted num' }, g, fmt(v[0]));
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

  /* ================= Fig: stability =================
     A rank table: one row per condition, the four pipelines in order of their score, highest first. The highlighted
     pipeline is filled, so its rank can be followed down the rows. No lines join the conditions: they are not a
     sequence. Equal scores are marked as ties. */
  var stabPick = 'lex5b';
  function drawStability(mount, d) {
    var F = frame(mount, d, { controls: true, noTable: true });
    seg(F.ctrls, S(d, 'pick'), d.series.map(function (x) { return { k: x.key, l: T(x.label) }; }), stabPick, function (k) {
      stabPick = k; drawStability(mount, d); var b = mount.querySelector('.vz-seg button[aria-pressed="true"]'); if (b) b.focus();
    });
    var narrow = F.width < 560;
    var name = function (x) { return narrow && x.short ? T(x.short) : T(x.label); };
    var t = h('table', { 'class': 'rk' + (narrow ? ' is-narrow' : '') }, F.plot);
    h('caption', { dir: 'auto' }, t, S(d, 'rk_caption'));
    var hr = h('tr', null, h('thead', null, t));
    h('th', { scope: 'col', 'class': 'rk-cond' }, hr, S(d, 'col_cond'));
    [1, 2, 3, 4].forEach(function (k) { h('th', { scope: 'col' }, hr, S(d, 'rk_' + k)); });
    var tb = h('tbody', null, t), lastG = null;
    d.conditions.forEach(function (c, i) {
      if (c.group !== lastG) {
        lastG = c.group;
        var gr = h('tr', { 'class': 'rk-g' }, tb);
        h('th', { scope: 'colgroup', colspan: '5' }, gr, T(d.groups[c.group]));
      }
      var tr = h('tr', null, tb);
      h('th', { scope: 'row', 'class': 'rk-cond' }, tr, T(c.label));
      var ord = d.series.map(function (x) { return { x: x, v: x.values[i], m: mid(x.values[i]) }; })
        .sort(function (a, b) { return b.m - a.m; });
      ord.forEach(function (o, j) {
        var tie = ord.some(function (q, k) { return k !== j && q.m === o.m; });
        var td = h('td', { 'class': 'rk-c' + (o.x.key === stabPick ? ' is-on' : '') + (tie ? ' is-tie' : '') }, tr);
        td.addEventListener('click', function () { stabPick = o.x.key; drawStability(mount, d); });
        h('span', { 'class': 'rk-n', dir: 'auto' }, td, name(o.x));
        h('span', { 'class': 'rk-v' }, td, fmtR(o.v) + (tie ? ' ' + S(d, 'tie') : ''));
      });
    });
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
