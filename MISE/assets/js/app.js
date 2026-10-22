/* MISE: project page. Plain JS, no dependencies. */
(function () {
  'use strict';
  var root = document.documentElement;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var NS = 'http://www.w3.org/2000/svg';

  /* ---------- releases: the code, models and data are still private; until RELEASED their links say "coming soon" */
  var RELEASED = false;
  if (!RELEASED) {
    $$('a[href^="https://github.com/ArashNasrEsfahani/MISE"], a[href^="https://huggingface.co/"]').forEach(function (a) {
      a.setAttribute('data-href', a.getAttribute('href'));
      a.removeAttribute('href');
      a.setAttribute('aria-disabled', 'true');
      a.classList.add('soon');
      var tag = document.createElement('span');
      tag.className = 'soon-tag';
      tag.setAttribute('data-fa', 'به‌زودی');
      tag.textContent = 'coming soon';
      a.appendChild(tag);
    });
  }

  /* ---------- language ---------- */
  var lang = root.lang === 'fa' ? 'fa' : 'en';
  var KEEP = [/Gemma 4/g, /GPT6-Sol/g, /YOLO/g, /AI2-THOR/g, /FloorPlan\d+/g, /Opus[ \u00A0]5\.5/g, /MISE/g, /AGPL-3\.0/g, /CC BY 4\.0/g, /Hugging Face/g, /GitHub/g];
  function fa(s) {
    var held = [];
    KEEP.forEach(function (re) { s = s.replace(re, function (m) { held.push(m); return String.fromCharCode(0xE000 + held.length - 1); }); });
    s = s.replace(/(\d)\.(\d)/g, '$1٫$2').replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.charAt(+d); }).replace(/%/g, '٪');
    return s.replace(/[-]/g, function (c) { return held[c.charCodeAt(0) - 0xE000]; });
  }
  function tr(en, f) { return lang === 'fa' ? fa(f) : en; }
  function num(n, d) {
    var s = n.toFixed(d);
    if (lang !== 'fa') return s;
    return s.replace('.', '٫').replace(/\d/g, function (c) { return '۰۱۲۳۴۵۶۷۸۹'.charAt(+c); });
  }
  function plus(n, d) { return (n >= 0 ? '+' : '−') + num(Math.abs(n), d); }

  var ATTRS = ['alt', 'aria-label', 'title'];
  function applyLang() {
    root.lang = lang; root.dir = lang === 'fa' ? 'rtl' : 'ltr';
    $$('[data-fa]').forEach(function (el) {
      if (el.dataset.en === undefined) el.dataset.en = el.innerHTML;
      el.innerHTML = lang === 'fa' ? fa(el.dataset.fa) : el.dataset.en;
    });
    ATTRS.forEach(function (a) {
      var k = 'fa' + a.replace(/(^|-)(\w)/g, function (_, __, c) { return c.toUpperCase(); });
      $$('[data-fa-' + a + ']').forEach(function (el) {
        var ek = 'en' + k.slice(2);
        if (el.dataset[ek] === undefined) el.dataset[ek] = el.getAttribute(a) || '';
        el.setAttribute(a, lang === 'fa' ? fa(el.getAttribute('data-fa-' + a)) : el.dataset[ek]);
      });
    });
    $('#langBtn').setAttribute('aria-label', lang === 'fa' ? 'Switch to English' : 'تغییر به فارسی');
    document.title = 'MISE';
    setExplainer();
    renderAll();
  }
  $('#langBtn').addEventListener('click', function () {
    lang = lang === 'fa' ? 'en' : 'fa';
    try { localStorage.setItem('mise-lang', lang); } catch (e) {}
    applyLang();
  });
  $('#themeBtn').addEventListener('click', function () {
    var cur = root.getAttribute('data-theme');
    var dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    var next = dark ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('mise-theme', next); } catch (e) {}
  });

  /* ---------- videos: play only while visible ---------- */
  var vids = $$('video').filter(function (v) { return v.id !== 'explainer'; });
  if (reduce) {
    vids.forEach(function (v) { v.removeAttribute('autoplay'); v.pause(); v.preload = 'none'; });
  } else if ('IntersectionObserver' in window) {
    var vio = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var v = e.target;
        if (e.isIntersecting) { if (v.preload === 'none') v.preload = 'metadata'; var p = v.play(); if (p && p.catch) p.catch(function () {}); }
        else v.pause();
      });
    }, { rootMargin: '120px', threshold: .15 });
    vids.forEach(function (v) { vio.observe(v); });
  }

  /* ---------- explainer (one render per language) ---------- */
  function setExplainer() {
    var v = $('#explainer'); if (!v) return;
    var code = lang === 'fa' ? 'fa' : 'en';
    if (v.dataset.code === code) return;
    v.dataset.code = code;
    v.poster = 'assets/img/explainer_' + code + '.jpg';
    v.pause(); v.querySelector('source').src = 'assets/video/explainer_' + code + '.mp4'; v.load();
  }

  /* ---------- tooltip ---------- */
  var tip = $('#tip');
  function showTip(text, x, y) {
    tip.textContent = text; tip.hidden = false;
    var r = tip.getBoundingClientRect();
    var px = Math.min(Math.max(8, x + 14), innerWidth - r.width - 8), py = y - r.height - 12;
    if (py < 8) py = y + 18;
    tip.style.left = px + 'px'; tip.style.top = py + 'px';
  }
  document.addEventListener('pointermove', function (e) {
    var t = e.target.closest && e.target.closest('[data-tip]');
    if (t) showTip(t.getAttribute('data-tip'), e.clientX, e.clientY); else tip.hidden = true;
  });
  document.addEventListener('focusin', function (e) {
    var t = e.target.closest && e.target.closest('[data-tip]');
    if (t) { var r = t.getBoundingClientRect(); showTip(t.getAttribute('data-tip'), r.left + r.width / 2, r.top); }
  });
  document.addEventListener('focusout', function () { tip.hidden = true; });

  /* ---------- data (Kitchen 1 final test unless stated; % of tasks completed) ---------- */
  var MAIN = [
    { key: 'atomic', vals: [69.1, 86.2, 89.4, 89.4], ci: [null, [77.8, 94.0], [82.4, 96.2], [84.0, 95.0]] },
    { key: 'seq', vals: [57.0, 78.0, 73.0, 74.0], ci: [null, [67.5, 87.5], [59.4, 86.0], [65.6, 83.7]] }
  ];
  // the main result per kitchen (atomic, sequential): Gemma 4 alone, Gemma 4 + Scene Memory, Opus 5.5, GPT6-Sol; K2/K3 from tab:res-k23-levels
  var MAIN_K = {
    1: MAIN,
    2: [{ key: 'atomic', vals: [75.5, 87.2, 91.5, 93.6], ci: [null, null, null, null] }, { key: 'seq', vals: [68.6, 87.1, 87.1, 87.1], ci: [null, null, null, null] }],
    3: [{ key: 'atomic', vals: [69.6, 77.2, 84.8, 88.0], ci: [null, null, null, null] }, { key: 'seq', vals: [65.3, 86.1, 88.9, 76.4], ci: [null, null, null, null] }]
  };
  var mainK = 1;
  var ABS = { vals: [21.4, 67.9, 58.9], ci: [[5.6, 36.2], [51.8, 81.9], [40.5, 75.0]] };
  // abstract goals in every kitchen: Gemma 4 + Scene Memory, Opus 5.5, GPT6-Sol (both without); thesis tab:res-levels, tab:res-k23-levels
  var ABS_K = [[21.4, 67.9, 58.9], [30.6, 77.8, 75.0], [26.3, 84.2, 84.2]];
  var KIT = [ // all tasks: Gemma 4 without / with Scene Memory, Opus 5.5, GPT6-Sol (both without)
    { n: 1, g: [54.0, 68.4], opus: 78.0, gpt: 76.4, pres: 250 },
    { n: 2, g: [63.0, 77.0], opus: 87.5, gpt: 88.0, pres: 200 },
    { n: 3, g: [59.4, 70.8], opus: 86.1, gpt: 83.2, pres: 202 }
  ];
  var PERC = [[48.3, 79.1, 92.4], [66.2, 84.9, 94.8], [57.1, 78.7, 91.5]]; // main alone, fine-tuned control, main + closer look

  function series() {
    return [
      { name: tr('Gemma 4 alone', 'Gemma 4 به‌تنهایی'), cls: 's0' },
      { name: tr('Gemma 4 + Scene Memory', 'Gemma 4 با حافظهٔ صحنه'), cls: 's1' },
      { name: 'Opus\u00A05.5', cls: 's2' },
      { name: 'GPT6-Sol', cls: 's3' }
    ];
  }
  function lvlName(k) { return { atomic: tr('Atomic', 'اتمی'), seq: tr('Sequential', 'ترتیبی'), abstract: tr('Abstract goal', 'هدف انتزاعی') }[k]; }
  function lvlHint(k) { return { atomic: tr('one action', 'یک کار'), seq: tr('several actions, in order', 'چند کار به ترتیب') }[k]; }
  function kName(i) { return tr('Kitchen ' + i, 'آشپزخانهٔ ' + i); }
  function pct(v) { return num(v, 1) + (lang === 'fa' ? '٪' : '%'); }

  /* ---------- growth on first view ---------- */
  var grown = {};
  function growWhenSeen(host, key) {
    if (reduce || grown[key] || !('IntersectionObserver' in window)) { host.classList.add('in'); return; }
    var io = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting) return;
      io.disconnect(); grown[key] = true;
      requestAnimationFrame(function () { host.classList.add('in'); });
    }, { threshold: .35 });
    io.observe(host);
  }
  function h(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  /* ---------- main chart: atomic + sequential ---------- */
  function chartMain() {
    var host = $('#chMain'); host.innerHTML = '';
    var S = series();
    MAIN_K[mainK].forEach(function (g, gi) {
      var grp = h('div', 'grp');
      var plot = h('div', 'vchart');
      var frontier = Math.max(g.vals[2], g.vals[3]);
      var fl = h('div', 'frontier'); fl.style.bottom = frontier + '%';
      plot.appendChild(fl);
      g.vals.forEach(function (v, k) {
        var col = h('div', 'vcol ' + S[k].cls);
        col.style.setProperty('--d', [520, 1150, 0, 120][k] + 'ms');
        var bar = h('div', 'vbar'); bar.style.height = v + '%';
        var lab = h('div', 'vval', num(v, 1)); lab.style.bottom = v + '%';
        var tipT = S[k].name + ' · ' + lvlName(g.key) + ' · ' + pct(v) + (g.ci[k] ? tr(' (95% CI ', ' (بازهٔ ۹۵٪: ') + num(g.ci[k][0], 1) + '–' + num(g.ci[k][1], 1) + ')' : '');
        col.setAttribute('data-tip', tipT); col.setAttribute('tabindex', '0'); col.setAttribute('aria-label', tipT);
        col.appendChild(bar); col.appendChild(lab);
        if (k === 1) { var dl = h('div', 'vdelta', plus(v - g.vals[0], 0)); dl.style.bottom = v + '%'; col.appendChild(dl); }
        plot.appendChild(col);
      });
      grp.appendChild(plot);
      grp.appendChild(h('h3', '', lvlName(g.key)));
      grp.appendChild(h('p', '', lvlHint(g.key)));
      host.appendChild(grp);
      growWhenSeen(plot, 'main' + gi + '-' + mainK);
    });
    $$('.ktabs button').forEach(function (b) { b.setAttribute('aria-selected', String(+b.dataset.k === mainK)); });
    $('#mainFine').textContent = mainK === 1
      ? tr('Kitchen 1. The gaps to Opus\u00A05.5 and GPT6-Sol are within the margin of error (95% confidence intervals).', 'آشپزخانهٔ ۱. فاصله با Opus\u00A05.5 و GPT6-Sol در حد حاشیهٔ خطاست (بازهٔ اطمینان ۹۵٪).')
      : tr('Kitchen ' + mainK + ', never used while building MISE. Close to both large models, as in Kitchen 1.', 'آشپزخانهٔ ' + mainK + '، که در ساخت MISE به کار نرفته بود. نزدیک به هر دو مدل بزرگ، مثل آشپزخانهٔ ۱.');
    var lg = $('#legend'); lg.innerHTML = '';
    S.forEach(function (s) { var it = h('span', ''); it.appendChild(h('i', 'sw ' + s.cls)); it.appendChild(document.createTextNode(s.name)); lg.appendChild(it); });
    var fr = h('span', ''); fr.appendChild(h('i', 'sw fr')); fr.appendChild(document.createTextNode(tr('frontier level', 'سطح مدل‌های پیشرو'))); lg.appendChild(fr);
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.ktabs button');
    if (!b || +b.dataset.k === mainK) return;
    mainK = +b.dataset.k; chartMain();
  });

  /* ---------- small horizontal charts ---------- */
  function hchart(host, key, rows) {
    host.innerHTML = '';
    var box = h('div', 'hchart');
    rows.forEach(function (r) {
      var row = h('div', 'hrow' + (r.group ? ' grp' : ''));
      if (r.group) { row.appendChild(h('div', 'hgrp', r.group)); if (r.delta) row.appendChild(h('div', 'hgrp-d', r.delta)); box.appendChild(row); return; }
      row.appendChild(h('div', 'hlab', r.label));
      var track = h('div', 'htrack');
      var bar = h('div', 'hbar ' + (r.cls || '')); bar.style.width = r.v + '%';
      track.appendChild(bar);
      row.appendChild(track);
      var val = h('div', 'hval' + (r.cls === 's1' ? ' g' : ''), num(r.v, 1));
      row.appendChild(val);
      if (r.tip) { row.setAttribute('data-tip', r.tip); row.setAttribute('tabindex', '0'); row.setAttribute('aria-label', r.tip); }
      box.appendChild(row);
    });
    host.appendChild(box);
    growWhenSeen(box, key);
  }
  function chartLift() {
    var rows = [];
    KIT.forEach(function (k) {
      rows.push({ group: kName(k.n), delta: plus(k.g[1] - k.g[0], 1) });
      rows.push({ label: tr('alone', 'به‌تنهایی'), v: k.g[0], cls: 's0', tip: kName(k.n) + ' · Gemma 4 · ' + pct(k.g[0]) });
      rows.push({ label: tr('with memory', 'با حافظه'), v: k.g[1], cls: 's1', tip: kName(k.n) + ' · ' + tr('Gemma 4 + Scene Memory', 'Gemma 4 با حافظهٔ صحنه') + ' · ' + pct(k.g[1]) });
    });
    hchart($('#chLift'), 'lift', rows);
  }
  function chartPerc() {
    var rows = [];
    PERC.forEach(function (p, i) {
      rows.push({ group: kName(i + 1) });
      rows.push({ label: tr('main alone', 'مدل اصلی'), v: p[0], cls: 's0', tip: kName(i + 1) + ' · ' + tr('main detector alone', 'مدل اصلی به‌تنهایی') + ' · ' + pct(p[0]) });
      rows.push({ label: tr('closer look', 'نگاه دقیق‌تر'), v: p[2], cls: 's1', tip: kName(i + 1) + ' · ' + tr('with the closer look', 'با نگاه دقیق‌تر') + ' · ' + pct(p[2]) });
    });
    hchart($('#chPerc'), 'perc', rows);
  }
  function chartAbs() {
    var S = series(), rows = [];
    ABS_K.forEach(function (v, i) {
      rows.push({ group: kName(i + 1) });
      rows.push({ label: 'Gemma 4', v: v[0], cls: 's1', tip: kName(i + 1) + ' · ' + S[1].name + ' · ' + pct(v[0]) });
      rows.push({ label: 'Opus\u00A05.5', v: v[1], cls: 's2', tip: kName(i + 1) + ' · Opus\u00A05.5 · ' + pct(v[1]) });
      rows.push({ label: 'GPT6-Sol', v: v[2], cls: 's3', tip: kName(i + 1) + ' · GPT6-Sol · ' + pct(v[2]) });
    });
    hchart($('#chAbs'), 'abs', rows);
  }

  /* ---------- tables ---------- */
  // all six planner conditions, for the "All numbers" tables (thesis tab:res-levels, tab:res-k23, tab:res-k23-levels)
  // order: Gemma 4 alone, Gemma 4 + Scene Memory, Opus 5.5, Opus 5.5 + Scene Memory, GPT6-Sol, GPT6-Sol + Scene Memory
  var ALL6 = {
    k1: { atomic: [69.1, 86.2, 89.4, 88.3, 89.4, 90.4], seq: [57.0, 78.0, 73.0, 81.0, 74.0, 83.0], abstract: [23.2, 21.4, 67.9, 73.2, 58.9, 58.9] },
    k1ci: { atomic: [null, [77.8, 94.0], [82.4, 96.2], null, [84.0, 95.0], null], seq: [null, [67.5, 87.5], [59.4, 86.0], null, [65.6, 83.7], null],
            abstract: [null, [5.6, 36.2], [51.8, 81.9], null, [40.5, 75.0], null] },
    k2: [[75.5, 68.6, 19.4], [87.2, 87.1, 30.6], [91.5, 87.1, 77.8], [88.3, 91.4, 80.6], [93.6, 87.1, 75.0], [88.3, 88.6, 77.8]],
    k3: [[69.6, 65.3, 23.7], [77.2, 86.1, 26.3], [84.8, 88.9, 84.2], [88.0, 88.9, 76.3], [88.0, 76.4, 84.2], [88.0, 75.0, 76.3]],
    overall: [[54.0, 68.4, 78.0, 82.0, 76.4, 80.4], [63.0, 77.0, 87.5, 88.0, 88.0, 86.5], [59.4, 70.8, 86.1, 86.1, 83.2, 81.2]]
  };
  function names6() {
    var m = tr(' + Scene Memory', ' با حافظهٔ صحنه');
    return [tr('Gemma 4 alone', 'Gemma 4 به‌تنهایی'), 'Gemma 4' + m, 'Opus\u00A05.5', 'Opus\u00A05.5' + m, 'GPT6-Sol', 'GPT6-Sol' + m];
  }
  function table(caption, head, body) {
    var s = '<div class="scroll"><table><caption>' + caption + '</caption><thead><tr>' + head.map(function (c) { return '<th scope="col">' + c + '</th>'; }).join('') + '</tr></thead><tbody>';
    body.forEach(function (r) { s += '<tr>' + r.map(function (c, i) { return i ? '<td>' + c + '</td>' : '<th scope="row">' + c + '</th>'; }).join('') + '</tr>'; });
    return s + '</tbody></table></div>';
  }
  function tables() {
    var N = names6(), ci = function (c) { return c ? ' [' + num(c[0], 1) + '–' + num(c[1], 1) + ']' : ''; };
    var lv = ['atomic', 'seq', 'abstract'];
    var t1 = table(tr('Kitchen 1 test by level, % of tasks completed (95% interval where computed)', 'آزمون آشپزخانهٔ ۱ به تفکیک سطح، درصد کارهای انجام‌شده (بازهٔ ۹۵٪ هر جا محاسبه شده)'),
      [tr('Condition', 'حالت')].concat(lv.map(lvlName)),
      N.map(function (n, c) { return [n].concat(lv.map(function (k) { return num(ALL6.k1[k][c], 1) + ci(ALL6.k1ci[k][c]); })); }));
    var t23 = table(tr('Kitchens 2 and 3 by level, % of tasks completed', 'آشپزخانه‌های ۲ و ۳ به تفکیک سطح، درصد کارهای انجام‌شده'),
      [tr('Condition', 'حالت')].concat([2, 3].reduce(function (a, k) { return a.concat(lv.map(function (l) { return kName(k) + ' · ' + lvlName(l); })); }, [])),
      N.map(function (n, c) { return [n].concat(ALL6.k2[c].concat(ALL6.k3[c]).map(function (v) { return num(v, 1); })); }));
    var t2 = table(tr('All tasks, three kitchens, %', 'همهٔ کارها، سه آشپزخانه، درصد'),
      [tr('Condition', 'حالت')].concat(KIT.map(function (k) { return kName(k.n) + ' (' + num(k.pres, 0) + tr(' presentations', ' ارائه') + ')'; })),
      N.map(function (n, c) { return [n].concat(ALL6.overall.map(function (row) { return num(row[c], 1); })); }));
    var t3 = table(tr('Held object named right, sealed holdout, %', 'نام درست شیء در دست، مجموعهٔ آزمون مهرشده، درصد'),
      [tr('Kitchen', 'آشپزخانه'), tr('Main detector alone', 'مدل اصلی به‌تنهایی'), tr('Fine-tuned control', 'شاهد تنظیم‌شده'), tr('With the closer look', 'با نگاه دقیق‌تر')],
      PERC.map(function (p, i) { return [kName(i + 1), num(p[0], 1), num(p[1], 1), num(p[2], 1)]; }));
    var t4 = table(tr('Planning time and cost (Kitchen 1 test, 250 presentations)', 'زمان و هزینهٔ برنامه‌ریزی (آزمون آشپزخانهٔ ۱، ۲۵۰ ارائه)'),
      [tr('Model', 'مدل'), tr('Median time per plan', 'میانهٔ زمان هر برنامه'), tr('Cost of the whole test', 'هزینهٔ کل آزمون')],
      [[N[1], tr('0.64 s, laptop', '۰٫۶۴ ثانیه، لپ‌تاپ'), tr('≈ $0.005 electricity', 'حدود ۰٫۰۰۵ دلار برق')],
       ['Opus\u00A05.5', tr('≈ 3.95 s, cloud', 'حدود ۳٫۹۵ ثانیه، روی سرور ابری'), tr('$7.46 without Scene Memory, $7.52 with it', '۷٫۴۶ دلار بدون حافظهٔ صحنه، ۷٫۵۲ دلار با آن')],
       ['GPT6-Sol', tr('≈ 16 s, cloud', 'حدود ۱۶ ثانیه، روی سرور ابری'), tr('not reported', 'گزارش نشده')]]);
    $('#tAll').innerHTML = t1 + t23 + t2 + t3 + t4;
  }

  /* ---------- flow diagram wires (desktop): measured from the laid-out cards, so RTL mirrors for free ---------- */
  function wires() {
    var flow = $('#flow'), svg = $('#wires');
    if (!flow || !svg) return;
    svg.innerHTML = '';
    if (getComputedStyle(svg).display === 'none') return;
    var fr = $('.fgrid', flow).getBoundingClientRect();
    function R(id) { var r = $('#' + id).getBoundingClientRect(); return { l: r.left - fr.left, r: r.right - fr.left, t: r.top - fr.top, b: r.bottom - fr.top, cx: (r.left + r.right) / 2 - fr.left, cy: (r.top + r.bottom) / 2 - fr.top }; }
    svg.setAttribute('viewBox', '0 0 ' + fr.width + ' ' + fr.height);
    var defs = document.createElementNS(NS, 'defs');
    defs.innerHTML = '<marker id="wa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="ah" d="M1,1.5L9,5L1,8.5z"/></marker>';
    svg.appendChild(defs);
    var gap = 7;
    function path(d, cls, id) {
      var p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d); p.setAttribute('marker-end', 'url(#wa)'); if (cls) p.setAttribute('class', cls); if (id) p.id = id;
      svg.appendChild(p); return p;
    }
    // inputs: straight down into the card under them
    [['in-see', 'n-see'], ['in-mem', 'n-mem']].forEach(function (e) {
      var A = R(e[0]), B = R(e[1]);
      path('M' + B.cx + ',' + (A.b + 5) + 'V' + (B.t - 5), 'main');
    });
    // the row: card to card at the cards' centre line
    var ids = ['n-see', 'n-mem', 'n-plan', 'n-act', 'n-out'], main = [];
    for (var i = 0; i < ids.length - 1; i++) {
      var A = R(ids[i]), B = R(ids[i + 1]), toRight = B.cx > A.cx, y = A.cy;
      main.push(path('M' + (toRight ? A.r + gap : A.l - gap) + ',' + y + 'H' + (toRight ? B.l - gap : B.r + gap), 'main', 'w' + i));
    }
    // feedback under the row: from the kitchen (Output) back to See, passing under Act where "Action accepted?" sits on the line
    var S = R('n-see'), O = R('n-out'), C = R('in-act'), y2 = C.cy, r = 12, dir = S.cx > O.cx ? 1 : -1;
    var lp = document.createElementNS(NS, 'path');
    lp.setAttribute('class', 'loop'); lp.setAttribute('marker-end', 'url(#wa)');
    lp.setAttribute('d', 'M' + O.cx + ',' + (O.b + gap) + 'V' + (y2 - r) + 'Q' + O.cx + ',' + y2 + ' ' + (O.cx + dir * r) + ',' + y2 + 'H' + (S.cx - dir * r) +
      'Q' + S.cx + ',' + y2 + ' ' + S.cx + ',' + (y2 - r) + 'V' + (S.b + gap));
    svg.appendChild(lp);
    var T = R('n-act');
    path('M' + T.cx + ',' + (C.t - 4) + 'V' + (T.b + 5), 'main');
    if (!reduce) main.forEach(function (p, k) {
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('r', '3'); c.setAttribute('class', 'spark');
      var m = document.createElementNS(NS, 'animateMotion');
      m.setAttribute('dur', '3.2s'); m.setAttribute('repeatCount', 'indefinite'); m.setAttribute('begin', (k * 0.8) + 's');
      m.setAttribute('keyPoints', '0;1;1'); m.setAttribute('keyTimes', '0;0.25;1'); m.setAttribute('calcMode', 'linear');
      var mp = document.createElementNS(NS, 'mpath'); mp.setAttribute('href', '#' + p.id);
      m.appendChild(mp); c.appendChild(m); svg.appendChild(c);
    });
  }

  /* ---------- easter egg: MISE as a dictionary entry ---------- */
  (function () {
    var tip = $('#miseTip'), card = $('#miseDict');
    if (!tip || !card) return;
    function set(open) { card.hidden = !open; tip.setAttribute('aria-expanded', String(open)); }
    tip.addEventListener('click', function (e) { e.stopPropagation(); set(card.hidden); });
    card.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function () { if (!card.hidden) set(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !card.hidden) { set(false); tip.focus(); } });
  })();

  /* ---------- in-page links: smooth scroll (CSS) + a short landing animation on the target section ---------- */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href').slice(1), t = id && document.getElementById(id);
    if (!t) return;
    var sec = t.closest('.sec') || t;
    sec.classList.remove('landed'); void sec.offsetWidth;
    setTimeout(function () { sec.classList.add('landed'); }, reduce ? 0 : 420);
    setTimeout(function () { sec.classList.remove('landed'); }, 2600);
  });

  /* ---------- render + resize ---------- */
  function renderAll() { chartMain(); chartLift(); chartPerc(); chartAbs(); tables(); wires(); }
  var lastW = innerWidth, rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt); rt = setTimeout(function () { if (Math.abs(innerWidth - lastW) > 2) { lastW = innerWidth; wires(); } }, 120);
  });
  applyLang();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { wires(); });
})();
