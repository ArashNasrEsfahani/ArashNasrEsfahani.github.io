/* AnyRAG: "Choose your RAG" (W3).
   Mounts into #chooser. Reads assets/data/chooser.json (questions, options, rules, notes, tests) and
   assets/data/evidence.json (evidence cards), both written by W1 from the paper's guide table.
   The logic (AnyRAGChooserCore) is pure and runs in node for the profile tests; the UI below runs only in a browser.
   Rule semantics follow chooser.json notes.semantics: rules apply in array order; a rule fires when every key in
   'when' matches (a list means any-of, a key starting with '!' means none-of; q1..q8 are answers, other keys are
   slots); 'set' overwrites a slot, 'add' appends to a list slot unless present, 'remove' deletes from it.
   Unanswered questions count as 'unsure'; a hidden question counts as 'na'. Nothing here adds claims. */
(function (G) {
  'use strict';
  /* cache-busting: the ?v= of this script's own URL (set in index.html) is added to the files it loads */
  var VQ = (function () { try { var v = new URL(document.currentScript.src).searchParams.get('v'); return v ? '?v=' + encodeURIComponent(v) : ''; } catch (e) { return ''; } })();

  /* ================= core (no DOM) ================= */

  var UNSURE = 'unsure', NA = 'na';
  var SLOTS = ['channels', 'chunking', 'reranking_or_selection', 'budget', 'agent', 'normalisation'];
  var LISTS = ['extras', 'avoid', 'tradeoffs'];

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function arr(x) { return x == null ? [] : (Array.isArray(x) ? x : [x]); }
  function isQ(k) { return /^q\d+$/.test(k); }

  function normalize(cj, ej) {
    cj = cj || {};
    var items = Array.isArray(ej) ? ej : ((ej && (ej.items || ej.evidence)) || []);
    var evidence = {};
    items.forEach(function (e) { if (e && e.id) evidence[e.id] = e; });
    var questions = arr(cj.questions).map(function (q) {
      return {
        id: String(q.id),
        text: q.prompt || q.text || '',
        help: q.help || null,
        showIf: q.show_if || null,
        options: arr(q.options).map(function (o) { return { id: String(o.id), label: o.label, hint: o.hint || null, unsure: o.id === UNSURE }; })
      };
    });
    var notes = cj.notes || {};
    return {
      version: cj.version || '',
      questions: questions,
      options: cj.options || {},
      rules: arr(cj.rules),
      tests: arr(cj.tests || cj.profiles),
      notes: notes,
      ui: cj.ui || {},
      evidence: evidence
    };
  }

  // A key/list pair of a 'when' or 'show_if' object, against full answers and current slots.
  function keyHolds(k, v, full, slots) {
    var neg = k.charAt(0) === '!', key = neg ? k.slice(1) : k;
    var cur = isQ(key) ? full[key] : slots[key];
    var hit = arr(v).map(String).indexOf(cur) >= 0;
    return neg ? !hit : hit;
  }
  function whenHolds(when, full, slots) {
    if (!when) return true;
    return Object.keys(when).every(function (k) { return keyHolds(k, when[k], full, slots || {}); });
  }

  // Visible questions given the (partial) answers; unanswered counts as 'unsure' for show_if.
  function visibleQuestions(d, ans) {
    var full = fullAnswers(d, ans);
    return d.questions.filter(function (q) { return full[q.id] !== NA; });
  }
  function fullAnswers(d, ans) {
    ans = ans || {};
    var full = {};
    d.questions.forEach(function (q) {
      var a = ans[q.id];
      full[q.id] = a != null && q.options.some(function (o) { return o.id === a; }) ? a : UNSURE;
    });
    // show_if may depend on other answers; hidden questions count as 'na'
    for (var pass = 0; pass < 3; pass++) {
      d.questions.forEach(function (q) { if (q.showIf && !whenHolds(q.showIf, full, {})) full[q.id] = NA; });
    }
    return full;
  }
  // Keep only valid answers to visible questions.
  function cleanAnswers(d, ans) {
    var full = fullAnswers(d, ans), out = {};
    d.questions.forEach(function (q) { if (full[q.id] !== NA && ans && ans[q.id] === full[q.id]) out[q.id] = ans[q.id]; });
    return out;
  }

  function evaluate(d, ans) {
    var full = fullAnswers(d, ans);
    var slots = {}, lists = { extras: [], avoid: [], tradeoffs: [] }, fired = [];
    d.rules.forEach(function (r) {
      if (!whenHolds(r.when, full, slots)) return;
      fired.push(r.id);
      var s = r.set || {}, a = r.add || {}, m = r.remove || {};
      Object.keys(s).forEach(function (k) { slots[k] = s[k]; });
      Object.keys(a).forEach(function (k) { lists[k] = lists[k] || []; arr(a[k]).forEach(function (x) { if (lists[k].indexOf(x) < 0) lists[k].push(x); }); });
      Object.keys(m).forEach(function (k) { if (lists[k]) lists[k] = lists[k].filter(function (x) { return arr(m[k]).indexOf(x) < 0; }); });
    });
    var unsure = d.questions.filter(function (q) { return full[q.id] === UNSURE; }).map(function (q) { return q.id; });
    return { answers: full, slots: slots, extras: lists.extras, avoid: lists.avoid, tradeoffs: lists.tradeoffs, fired: fired, unsure: unsure };
  }

  // List items that hold for every setup (notes.universal) are shown collapsed, after the profile-specific ones.
  function universalSet(d) { return arr(d.notes && d.notes.universal); }
  function splitList(d, ids) {
    var u = universalSet(d);
    return { own: arr(ids).filter(function (x) { return u.indexOf(x) < 0; }), all: arr(ids).filter(function (x) { return u.indexOf(x) >= 0; }) };
  }
  // Option ids in display order: slots, trade-offs, avoid, extras, then the universal avoid and extras items.
  function displayOrder(d, res) {
    var av = splitList(d, res.avoid), ex = splitList(d, res.extras);
    return SLOTS.map(function (k) { return res.slots[k]; }).concat(res.tradeoffs, av.own, ex.own, av.all, ex.all);
  }
  // Evidence ids in display order, first reference wins, so card numbers follow their first appearance.
  function evidenceOrder(d, res) {
    var ids = [];
    displayOrder(d, res).forEach(function (oid) {
      var o = d.options[oid];
      if (o) arr(o.evidence).forEach(function (e) { if (ids.indexOf(e) < 0) ids.push(e); });
    });
    return ids;
  }
  // The (at most) three cards shown by default: each slot option's "key" card, in the order of the decisions that
  // differ most between setups, then the first card of each trade-off, then display order.
  var KEY_SLOTS = ['reranking_or_selection', 'agent', 'channels', 'budget', 'normalisation', 'chunking'];
  function keyEvidence(d, res, n) {
    n = n || 3;
    var out = [], push = function (e) { if (e && d.evidence[e] && out.indexOf(e) < 0 && out.length < n) out.push(e); };
    KEY_SLOTS.forEach(function (k) { var o = d.options[res.slots[k]]; if (o) push(o.key === undefined ? arr(o.evidence)[0] : o.key); });
    res.tradeoffs.forEach(function (oid) { var o = d.options[oid]; if (o) push(arr(o.evidence)[0]); });
    evidenceOrder(d, res).forEach(push);
    return out;
  }
  // notes.no_default_when: a list of 'when' objects; the "no single default" note shows if any of them holds.
  function showNoDefault(d, res) {
    var w = d.notes && d.notes.no_default_when;
    if (!w) return res.slots.reranking_or_selection === 'rr.ce';
    return arr(w).some(function (c) { return whenHolds(c, res.answers, res.slots); });
  }
  // The one-sentence recommendation: notes.summary filled with each slot option's "summary" phrase ({en, fa}).
  function summaryParts(d, res) {
    var p = {};
    SLOTS.forEach(function (k) { var o = d.options[res.slots[k]]; p[k] = o && o.summary ? o.summary : null; });
    return p;
  }

  function sameList(a, b) { return JSON.stringify(arr(a)) === JSON.stringify(arr(b)); }
  function sameSet(a, b) { a = arr(a).slice().sort(); b = arr(b).slice().sort(); return JSON.stringify(a) === JSON.stringify(b); }

  function checkTest(d, t) {
    var res = evaluate(d, t.answers || {});
    var exp = t.expected || t.expect || {};
    var fails = [], warns = [];
    SLOTS.forEach(function (k) { if (k in exp && res.slots[k] !== exp[k]) fails.push(k + ': got ' + res.slots[k] + ', expected ' + exp[k]); });
    LISTS.forEach(function (k) {
      if (!(k in exp)) return;
      if (!sameSet(res[k], exp[k])) fails.push(k + ': got [' + res[k].join(', ') + '], expected [' + arr(exp[k]).join(', ') + ']');
      else if (!sameList(res[k], exp[k])) warns.push(k + ' order differs');
    });
    if (t.rules_fired && !sameList(res.fired, t.rules_fired)) fails.push('rules fired: got [' + res.fired.join(', ') + '], expected [' + t.rules_fired.join(', ') + ']');
    return { name: t.name || t.id, pass: !fails.length, fails: fails, warns: warns, result: res };
  }

  function parseHash(h) {
    var m = /^#?choose\??(.*)$/.exec(h || '');
    if (!m) return null;
    var o = {};
    m[1].split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('='), k = decodeURIComponent(i < 0 ? kv : kv.slice(0, i)), v = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1));
      o[k] = v;
    });
    return o;
  }
  function buildHash(d, ans, extra) {
    var parts = [];
    d.questions.forEach(function (q) { if (ans[q.id] != null) parts.push(encodeURIComponent(q.id) + '=' + encodeURIComponent(ans[q.id])); });
    if (extra) parts.push(extra);
    return '#choose' + (parts.length ? '?' + parts.join('&') : '');
  }

  var Core = { normalize: normalize, evaluate: evaluate, visibleQuestions: visibleQuestions, fullAnswers: fullAnswers,
    cleanAnswers: cleanAnswers, evidenceOrder: evidenceOrder, displayOrder: displayOrder, splitList: splitList, keyEvidence: keyEvidence,
    showNoDefault: showNoDefault, summaryParts: summaryParts, checkTest: checkTest, parseHash: parseHash, buildHash: buildHash,
    SLOTS: SLOTS, LISTS: LISTS, UNSURE: UNSURE, NA: NA };
  G.AnyRAGChooserCore = Core;
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  if (typeof document === 'undefined') return;

  /* ================= UI ================= */

  // Interface chrome. chooser.json may override any key under "ui" as {en, fa}; Persian falls back to English.
  var UI_EN = {
    progress: 'Question {i} of {n}',
    back: 'Back', next: 'Next', see: 'See the recommendation', unsure_hint: 'The recommendation then uses the default for this question.',
    restart: 'Start again', copy: 'Copy link', copied: 'Link copied', copy_fail: 'Copy the address from the browser bar',
    edit: 'Change answers', edit_one: 'Change',
    result_title: 'Recommended setup',
    pipeline_label: 'Diagram of the recommended pipeline',
    slot_channels: 'Retrieval', slot_chunking: 'Chunks', slot_reranking_or_selection: 'Reranking or selection',
    slot_budget: 'Evidence budget', slot_agent: 'Search agent', slot_normalisation: 'Normalisation',
    extras_title: 'Also do', avoid_title: 'What the evidence rules out', tradeoffs_title: 'Trade-offs in your answers',
    evidence_title: 'Evidence from the paper', your_answers: 'Your answers',
    show_all: 'Show all {n} evidence cards', show_less: 'Show fewer',
    unsure_note: 'You answered "not sure" to {n} of {m} questions; the defaults stand there.',
    caveat: 'Caveat', refs: 'Evidence',
    strong: 'Strong', tentative: 'Tentative', measured: 'Measured', untested: 'Not tested',
    summary_label: 'In one sentence', universal_title: 'Holds for every setup ({n})', src: 'In the paper',
    key_note: 'The three cards that bear most on this recommendation are shown; the rest are one click away.',
    st_agent_tool: "agent's tool", st_agent_bm25: 'Agent: search again with BM25',
    legend_title: 'Confidence labels',
    note: 'Based on 90 test questions; post hoc analyses; your data may differ, so test on your own questions.',
    loading: 'Loading the chooser.', failed: 'The chooser data could not be loaded.',
    st_query: 'Question', st_norm: 'Normalise', st_bm25: 'BM25', st_dense: 'Dense', st_fuse: 'Fuse',
    st_rerank: 'Rerank', st_select: 'LLM select', st_pack: 'Pack', st_reader: 'Reader', st_agent: 'Agent: search again',
    st_optional: 'optional', st_if_fast: 'if fast enough', st_chars: 'chars', st_modest: 'modest'
  };

  var lang = 'en';
  function L(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (isObj(v)) { var s = v[lang]; if (s == null || s === '') s = v.en; else if (lang === 'fa' && G.AnyRAGNum) s = G.AnyRAGNum.signs(s); return s == null ? '' : String(s); }
    return String(v);
  }
  function hasText(v) { return !!L(v).trim(); }

  var D = null, mount = null, state = { ans: {}, step: 0, view: 'q' };
  var reduce = !!(G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function U(k, vars) {
    var s = D && D.ui[k] != null ? L(D.ui[k]) : '';
    if (!s) s = UI_EN[k] != null ? UI_EN[k] : k;
    if (vars) Object.keys(vars).forEach(function (n) { s = s.split('{' + n + '}').join(vars[n]); });
    return s;
  }

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    arr(kids).forEach(function (c) { if (c == null || c === false) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function T(tag, cls, v) { var e = el(tag, cls ? { class: cls } : null); e.textContent = L(v); return e; }

  // While Persian strings are empty, English fallbacks sit inside the RTL page: mark them LTR.
  var AR = /[؀-ۿﭐ-﷿ﹰ-﻿]/, LAT = /[A-Za-z]/;
  function markFallback(root) {
    if (lang !== 'fa') return;
    Array.prototype.forEach.call(root.querySelectorAll('p,span,h3,h4,legend,button,summary,dt,dd,li,a,th,td'), function (e) {
      if (e.hasAttribute('lang') || e.closest('svg') || (e.parentElement && e.parentElement.closest('[lang="en"]'))) return;
      var t = e.textContent || '';
      if (t.trim() && LAT.test(t) && !AR.test(t)) { e.setAttribute('lang', 'en'); e.setAttribute('dir', 'ltr'); }
    });
  }

  /* --- hash --- */
  function writeHash() {
    var h = Core.buildHash(D, state.ans, state.view === 'r' ? 'r=1' : (state.step ? 'step=' + state.step : null));
    if (G.history && G.history.replaceState) { try { G.history.replaceState(null, '', h); } catch (e) {} }
  }
  function readHash() {
    var o = Core.parseHash(G.location.hash);
    if (!o) return false;
    var ans = {};
    D.questions.forEach(function (q) { if (o[q.id] != null) ans[q.id] = o[q.id]; });
    state.ans = Core.cleanAnswers(D, ans);
    var vis = Core.visibleQuestions(D, state.ans);
    var first = 0; while (first < vis.length - 1 && state.ans[vis[first].id] != null) first++;
    var complete = vis.every(function (q) { return state.ans[q.id] != null; });
    if (o.r && complete) state.view = 'r';
    else {
      state.view = 'q';
      var s = parseInt(o.step, 10);
      state.step = isNaN(s) || s > first ? first : Math.max(0, s);
    }
    return true;
  }

  /* --- render --- */
  var live = null, touched = false, pendingDiag = null;
  function render(focus) {
    mount.innerHTML = '';
    mount.setAttribute('aria-busy', 'false');
    var body = state.view === 'r' ? renderResult() : renderQuestion();
    mount.appendChild(body);
    // the page shows the permanent note under the mount (data-i18n="choose.note"); show it here only if it does not
    if (!document.querySelector('[data-i18n="choose.note"]')) mount.appendChild(el('p', { class: 'ch-note' }, [T('span', '', D.notes.permanent || U('note'))]));
    live = el('p', { class: 'ch-live', 'aria-live': 'polite', role: 'status' });
    mount.appendChild(live);
    if (pendingDiag) { pendingDiag(); pendingDiag = null; }
    markFallback(mount);
    if (!reduce) { body.classList.add('ch-enter'); requestAnimationFrame(function () { requestAnimationFrame(function () { body.classList.add('ch-in'); }); }); }
    if (focus) { touched = true; var f = mount.querySelector('[data-focus]'); if (f) f.focus({ preventScroll: true }); }
    if (touched) writeHash();
  }
  function announce(s) { if (live) { live.textContent = ''; setTimeout(function () { if (live) live.textContent = s; }, 40); } }

  // numbers: the shared AnyRAGNum helper (assets/js/num.js); Persian digits only where the string around them is Persian
  function NUM() { return G.AnyRAGNum || null; }
  function nf(x, tpl) { var N = NUM(); return lang === 'fa' && (tpl == null || AR.test(tpl)) ? (N ? N.local(String(x), 'fa') : Number(x).toLocaleString('fa-IR')) : String(x); }
  // a value or source string from evidence.json: {en, fa} or a plain English string; numbers localised in Persian
  function LN(v) { var t = L(v), N = NUM(); return lang === 'fa' && N ? N.local(t, 'fa') : t; }
  function progText(i, n) { var t = U('progress'); return t.split('{i}').join(nf(i + 1, t)).split('{n}').join(nf(n, t)); }
  function progress(i, n) {
    var bar = el('div', { class: 'ch-prog', 'aria-hidden': 'true' });
    for (var k = 0; k < n; k++) bar.appendChild(el('span', { class: k < i ? 'done' : (k === i ? 'cur' : '') }));
    return bar;
  }

  function renderQuestion() {
    var vis = Core.visibleQuestions(D, state.ans);
    if (state.step >= vis.length) state.step = vis.length - 1;
    var q = vis[state.step], n = vis.length, i = state.step;
    var wrap = el('div', { class: 'ch-step' });
    wrap.appendChild(el('div', { class: 'ch-head' }, [el('span', { class: 'ch-count', text: progText(i, n) }), progress(i, n)]));
    var name = 'ch-' + q.id, helpId = 'ch-help-' + q.id;
    var fs = el('fieldset', { class: 'ch-q', 'aria-describedby': q.help ? helpId : null });
    fs.appendChild(el('legend', { class: 'ch-qtext', tabindex: '-1', 'data-focus': '' }, [T('span', '', q.text)]));
    if (hasText(q.help)) { var hp = T('p', 'ch-help', q.help); hp.id = helpId; fs.appendChild(hp); }
    var list = el('div', { class: 'ch-opts' });
    var cur = state.ans[q.id];
    q.options.forEach(function (o, oi) {
      var id = name + '-' + oi;
      var input = el('input', { type: 'radio', name: name, id: id, value: o.id, checked: cur === o.id,
        onchange: function () { pick(q, o.id); },
        onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); pick(q, o.id); go(1); } } });
      var lab = el('label', { 'for': id, class: 'ch-opt' + (o.unsure ? ' unsure' : '') });
      lab.appendChild(input);
      lab.appendChild(el('span', { class: 'ch-mark', 'aria-hidden': 'true' }));
      lab.appendChild(T('span', 'ch-olabel', o.label));
      var hint = o.hint || (o.unsure ? U('unsure_hint') : null);
      if (hint) lab.appendChild(T('span', 'ch-ohint', hint));
      list.appendChild(lab);
    });
    fs.appendChild(list);
    wrap.appendChild(fs);
    var nav = el('div', { class: 'ch-nav' });
    nav.appendChild(el('button', { type: 'button', class: 'ch-btn ghost', disabled: i === 0, onclick: function () { go(-1); } }, [U('back')]));
    var ok = cur != null;
    nav.appendChild(el('button', { type: 'button', class: 'ch-btn primary', 'data-next': '', disabled: !ok, onclick: function () { go(1); } }, [i === n - 1 ? U('see') : U('next')]));
    if (Object.keys(state.ans).length) nav.appendChild(el('button', { type: 'button', class: 'ch-btn link', onclick: restart }, [U('restart')]));
    wrap.appendChild(nav);
    return wrap;
  }

  function pick(q, v) {
    state.ans[q.id] = v;
    state.ans = Core.cleanAnswers(D, state.ans);
    touched = true;
    var vis = Core.visibleQuestions(D, state.ans), n = vis.length;
    var b = mount.querySelector('[data-next]');
    if (b) { b.disabled = false; b.textContent = state.step === n - 1 ? U('see') : U('next'); }
    var c = mount.querySelector('.ch-count'); if (c) c.textContent = progText(state.step, n);
    var p = mount.querySelector('.ch-prog'); if (p) p.parentNode.replaceChild(progress(state.step, n), p);
    writeHash();
  }

  function go(dir) {
    var vis = Core.visibleQuestions(D, state.ans), q = vis[state.step];
    if (dir > 0 && state.ans[q.id] == null) return;
    if (dir > 0 && state.step === vis.length - 1) { state.view = 'r'; render(true); announce(U('result_title')); scrollIntoViewIfNeeded(); return; }
    state.step = Math.max(0, Math.min(vis.length - 1, state.step + dir));
    render(true);
    announce(progText(state.step, Core.visibleQuestions(D, state.ans).length));
  }
  function restart() { state = { ans: {}, step: 0, view: 'q' }; render(true); scrollIntoViewIfNeeded(); }
  function scrollIntoViewIfNeeded() {
    var r = mount.getBoundingClientRect();
    if (r.top < 0 || r.top > G.innerHeight * 0.6) mount.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  function copyLink(btn) {
    writeHash();
    var url = G.location.href;
    function ok() { btn.textContent = U('copied'); announce(U('copied')); setTimeout(function () { btn.textContent = U('copy'); }, 2200); }
    function fail() { btn.textContent = U('copy_fail'); announce(U('copy_fail')); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok, fail);
    else { try { var t = el('textarea', { class: 'ch-live' }); t.value = url; document.body.appendChild(t); t.select(); var y = document.execCommand('copy'); t.remove(); if (y) ok(); else fail(); } catch (e) { fail(); } }
  }

  /* --- pipeline diagram --- */
  // Diagram stages from option ids; ids not listed here fall back to their prefix.
  var STAGE = {
    'rr.ce': 'rerank', 'rr.ce_xl': 'rerank', 'rr.ce_fast': 'rerank', 'rr.sel': 'select', 'rr.sel_6000': 'select',
    'ag.hybrid': 'agent', 'ag.hybrid_tool': 'agent', 'ag.hybrid_mix': 'agent',
    'ag.bm25_en': 'agent_bm25', 'ag.bm25_en_mix': 'agent_bm25', 'ag.bm25_lang': 'agent_bm25',
    'nm.fa': 'norm', 'nm.fa_mixed': 'norm'
  };
  var BUDGET = { 'bd.tight': '3,000', 'bd.tight_ce': '3,000', 'bd.tight_t1': '3,000', 'bd.moderate': '6,000', 'bd.generous': '≥15,500', 'bd.raise': '→15,500' };
  var BUDGET_FA = { 'bd.tight': '۳٬۰۰۰', 'bd.tight_ce': '۳٬۰۰۰', 'bd.tight_t1': '۳٬۰۰۰', 'bd.moderate': '۶٬۰۰۰', 'bd.generous': 'حداقل ۱۵٬۵۰۰', 'bd.raise': 'افزایش تا ۱۵٬۵۰۰' };
  function stagesFor(slots) {
    var st = [{ k: 'query' }];
    if (STAGE[slots.normalisation] === 'norm') st.push({ k: 'norm' });
    st.push({ k: 'retrieve', par: ['bm25', 'dense'], dashed: slots.channels === 'ch.cross' ? 'bm25' : null });
    st.push({ k: 'fuse' });
    var rr = STAGE[slots.reranking_or_selection];
    // at a generous budget the pack needs no reranker, but the hybrid-index agent uses one as its search tool
    if (!rr && slots.agent === 'ag.hybrid_tool') st.push({ k: 'rerank', sub: U('st_agent_tool') });
    else if (rr) st.push({ k: rr, sub: slots.reranking_or_selection === 'rr.ce_fast' ? U('st_if_fast') : null });
    var b = (lang === 'fa' && AR.test(U('st_chars')) ? BUDGET_FA : BUDGET)[slots.budget];
    st.push({ k: 'pack', sub: b ? b + ' ' + U('st_chars') : (slots.budget === 'bd.modest_t1' ? U('st_modest') : null) });
    st.push({ k: 'reader' });
    var ag = STAGE[slots.agent];
    return { stages: st, agent: !!ag, agentLabel: ag === 'agent_bm25' ? U('st_agent_bm25') : U('st_agent') };
  }

  var NS = 'http://www.w3.org/2000/svg';
  function sv(tag, a) { var e = document.createElementNS(NS, tag); Object.keys(a || {}).forEach(function (k) { e.setAttribute(k, a[k]); }); return e; }
  function label(txt, x, y, cls) {
    var t = sv('text', { x: x, y: y, 'text-anchor': 'middle', class: cls || 'ch-lab' });
    t.textContent = txt;
    t.setAttribute('direction', AR.test(txt) ? 'rtl' : 'ltr');
    return t;
  }

  function diagram(slots, width) {
    var P = stagesFor(slots), st = P.stages, n = st.length;
    var vertical = width < 640, rtl = lang === 'fa';
    var pos = [], W, H, gap = vertical ? 22 : 16;
    if (vertical) {
      W = Math.max(260, Math.min(width, 340));
      var bw = W - 48, x0 = rtl ? 40 : 8, y = 6;
      st.forEach(function (s) { var h = s.sub ? 48 : 38; pos.push({ x: x0, y: y, w: bw, h: h }); y += h + gap; });
      H = y - gap + 6;
    } else {
      W = Math.min(Math.max(width, 640), 980);
      var unit = (W - 4 - gap * (n - 1)) / n;
      st.forEach(function (s, i) {
        var h = s.par ? 92 : 54, x = 2 + i * (unit + gap);
        if (rtl) x = W - 2 - unit - i * (unit + gap);
        pos.push({ x: x, y: 6 + (92 - h) / 2, w: unit, h: h });
      });
      H = 104 + (P.agent ? 40 : 0);
    }
    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'ch-svg', role: 'img', 'aria-labelledby': 'ch-svg-t ch-svg-d' });
    svg.style.maxWidth = W + 'px';
    var t = sv('title', { id: 'ch-svg-t' }); t.textContent = U('pipeline_label'); svg.appendChild(t);
    var desc = sv('desc', { id: 'ch-svg-d' });
    desc.textContent = st.map(function (s) {
      return s.par ? s.par.map(function (p) { return U('st_' + p); }).join(' + ') : U('st_' + s.k) + (s.sub ? ' (' + s.sub + ')' : '');
    }).join(' → ') + (P.agent ? '; ' + P.agentLabel : '');
    svg.appendChild(desc);
    var defs = sv('defs'), mk = sv('marker', { id: 'ch-arrow', viewBox: '0 0 8 8', refX: '7.5', refY: '4', markerWidth: '6', markerHeight: '6', orient: 'auto-start-reverse' });
    mk.appendChild(sv('path', { d: 'M0,0 L8,4 L0,8 z', class: 'ch-ah' })); defs.appendChild(mk); svg.appendChild(defs);
    for (var i = 0; i < n - 1; i++) {
      var a = pos[i], b = pos[i + 1];
      if (vertical) svg.appendChild(sv('line', { x1: a.x + a.w / 2, y1: a.y + a.h, x2: b.x + b.w / 2, y2: b.y - 1, class: 'ch-edge', 'marker-end': 'url(#ch-arrow)' }));
      else {
        var cy = 6 + 46;
        svg.appendChild(sv('line', { x1: rtl ? a.x : a.x + a.w, y1: cy, x2: rtl ? b.x + b.w + 1 : b.x - 1, y2: cy, class: 'ch-edge', 'marker-end': 'url(#ch-arrow)' }));
      }
    }
    st.forEach(function (s, i) {
      var p = pos[i], g = sv('g', { class: 'ch-node' });
      if (s.par) {
        var k = s.par.length;
        s.par.forEach(function (c, j) {
          var bx, by, bw2, bh2;
          if (vertical) { bw2 = (p.w - 8) / k; bh2 = p.h; bx = rtl ? p.x + p.w - bw2 - j * (bw2 + 8) : p.x + j * (bw2 + 8); by = p.y; }
          else { bw2 = p.w; bh2 = (p.h - 8) / k; bx = p.x; by = p.y + j * (bh2 + 8); }
          g.appendChild(sv('rect', { x: bx, y: by, width: bw2, height: bh2, class: 'ch-box' + (s.dashed === c ? ' dashed' : '') }));
          g.appendChild(label(U('st_' + c), bx + bw2 / 2, by + bh2 / 2 + 4));
        });
      } else {
        var cls = 'ch-box' + (s.k === 'rerank' || s.k === 'select' ? ' hl' : '') + (s.k === 'reader' ? ' reader' : '');
        g.appendChild(sv('rect', { x: p.x, y: p.y, width: p.w, height: p.h, class: cls }));
        var ly = p.y + p.h / 2 + (s.sub ? -3 : 4);
        g.appendChild(label(U('st_' + s.k), p.x + p.w / 2, ly));
        if (s.sub) g.appendChild(label(s.sub, p.x + p.w / 2, ly + 15, 'ch-sub'));
      }
      svg.appendChild(g);
    });
    if (P.agent) {
      var ri = n - 1, qi = 0;
      st.forEach(function (s, j) { if (s.k === 'retrieve') qi = j; });
      var R = pos[ri], Q = pos[qi], d, lx, ly2;
      if (vertical) {
        var xr = rtl ? R.x - 18 : R.x + R.w + 18;
        d = 'M' + (rtl ? R.x : R.x + R.w) + ',' + (R.y + R.h / 2) + ' H' + xr + ' V' + (Q.y + Q.h / 2) + ' H' + (rtl ? Q.x - 1 : Q.x + Q.w + 1);
        svg.appendChild(sv('path', { d: d, class: 'ch-edge loop', 'marker-end': 'url(#ch-arrow)' }));
        lx = xr + (rtl ? -6 : 6); ly2 = (R.y + Q.y + Q.h) / 2;
        var lt = label(P.agentLabel, lx, ly2, 'ch-sub'); lt.setAttribute('transform', 'rotate(-90 ' + lx + ' ' + ly2 + ')');
        svg.appendChild(lt);
      } else {
        var yb = 6 + 92 + 26, x1 = R.x + R.w / 2, x2 = Q.x + Q.w / 2;
        d = 'M' + x1 + ',' + (R.y + R.h) + ' V' + yb + ' H' + x2 + ' V' + (Q.y + Q.h + 1);
        svg.appendChild(sv('path', { d: d, class: 'ch-edge loop', 'marker-end': 'url(#ch-arrow)' }));
        svg.appendChild(label(P.agentLabel, (x1 + x2) / 2, yb - 6, 'ch-sub'));
      }
    }
    return svg;
  }

  /* --- result --- */
  function badge(level, scope) {
    var lv = /^(strong|tentative|measured|untested)$/.test(level) ? level : 'tentative';
    var w = el('span', { class: 'ch-conf' }, [el('span', { class: 'ch-badge ' + lv, text: U(lv) })]);
    if (hasText(scope)) w.appendChild(T('span', 'ch-scope', scope));
    return w;
  }
  function confLine(o) {
    var c = el('span', { class: 'ch-confs' });
    arr(o.confidence).forEach(function (x) { c.appendChild(badge(x.level, x.scope)); });
    return c;
  }
  var refNo = {};
  function refs(o) {
    var ids = arr(o.evidence).filter(function (e) { return refNo[e]; });
    if (!ids.length) return null;
    var s = el('span', { class: 'ch-refs' }, [el('span', { class: 'ch-sr', text: U('refs') + ': ' })]);
    ids.forEach(function (e) {
      s.appendChild(el('a', { href: '#ch-ev-' + e, class: 'ch-ref', 'aria-label': U('refs') + ' ' + nf(refNo[e], U('refs')), onclick: function (ev) { jump(ev, e); } }, [nf(refNo[e], U('refs'))]));
    });
    return s;
  }
  function jump(ev, id) {
    ev.preventDefault();
    var t = document.getElementById('ch-ev-' + id);
    if (!t) return;
    if (t.hidden) { var more = mount.querySelector('[data-more]'); if (more) more.click(); }
    t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    t.focus({ preventScroll: true });
  }

  function optionItem(oid, tag) {
    var o = D.options[oid];
    var li = el(tag || 'li', { class: 'ch-item' });
    if (!o) { li.textContent = oid; return li; }
    var main = el('div', { class: 'ch-itext' }, [T('span', '', o.text)]);
    var r = refs(o); if (r) main.appendChild(r);
    li.appendChild(main);
    if (hasText(o.note)) li.appendChild(T('p', 'ch-inote', o.note));
    li.appendChild(confLine(o));
    return li;
  }

  function evidenceCard(id) {
    var e = D.evidence[id];
    if (!e) return null;
    var lv = String(e.confidence || '').toLowerCase();
    var art = el('article', { class: 'ch-ev', id: 'ch-ev-' + id, tabindex: '-1', 'aria-labelledby': 'ch-evh-' + id });
    var top = el('div', { class: 'ch-ev-top' }, [el('span', { class: 'ch-evno', text: nf(refNo[id]) }), badge(lv)]);
    art.appendChild(top);
    var h = T('h4', 'ch-claim', e.claim); h.id = 'ch-evh-' + id; art.appendChild(h);
    var nums = arr(e.numbers);
    if (nums.length) {
      var dl = el('dl', { class: 'ch-nums' });
      nums.forEach(function (x) { dl.appendChild(T('dt', '', x.label)); dl.appendChild(el('dd', { text: LN(x.value) })); });
      art.appendChild(dl);
    }
    if (hasText(e.caveat)) art.appendChild(el('p', { class: 'ch-cav' }, [el('span', { class: 'ch-k', text: U('caveat') }), ' ', T('span', '', e.caveat)]));
    var src = e.source && (isObj(e.source) && !('en' in e.source) ? e.source.paper : e.source);
    if (src && (typeof src === 'string' || isObj(src)) && hasText(src)) art.appendChild(el('p', { class: 'ch-src' }, [el('span', { class: 'ch-k', text: U('src') }), ' ', el('span', { text: LN(src) })]));
    return art;
  }

  function summaryLine(res) {
    var tpl = D.notes.summary, parts = Core.summaryParts(D, res);
    if (!tpl || !parts.channels || !parts.reranking_or_selection || !parts.budget) return null;
    var s = L(tpl);
    ['channels', 'reranking_or_selection', 'budget', 'agent'].forEach(function (k) { s = s.split('{' + k + '}').join(parts[k] ? L(parts[k]) : ''); });
    s = s.replace(/\s+([,.،؛])/g, '$1').replace(/\s{2,}/g, ' ').trim();
    s = s.charAt(0).toUpperCase() + s.slice(1);
    if (lang === 'fa' && NUM()) s = NUM().local(s, 'fa');
    return s;
  }

  function renderResult() {
    var res = Core.evaluate(D, state.ans);
    var order = Core.evidenceOrder(D, res).filter(function (e) { return D.evidence[e]; });
    refNo = {}; order.forEach(function (e, i) { refNo[e] = i + 1; });
    var keys = Core.keyEvidence(D, res, 3);
    var wrap = el('div', { class: 'ch-res' });

    var head = el('div', { class: 'ch-rhead' });
    head.appendChild(el('h3', { class: 'ch-rtitle', tabindex: '-1', 'data-focus': '' }, [U('result_title')]));
    var tools = el('div', { class: 'ch-tools' });
    tools.appendChild(el('button', { type: 'button', class: 'ch-btn ghost', onclick: function () { state.view = 'q'; state.step = 0; render(true); } }, [U('edit')]));
    tools.appendChild(el('button', { type: 'button', class: 'ch-btn ghost', onclick: restart }, [U('restart')]));
    var cb = el('button', { type: 'button', class: 'ch-btn primary', onclick: function () { copyLink(cb); } }, [U('copy')]);
    tools.appendChild(cb);
    head.appendChild(tools);
    wrap.appendChild(head);

    // the recommendation in one sentence (review item 9)
    var line = summaryLine(res);
    if (line) wrap.appendChild(el('p', { class: 'ch-summary', id: 'ch-summary' }, [el('span', { class: 'ch-k', text: U('summary_label') }), ' ', el('span', { text: line })]));

    // pipeline card
    var card = el('div', { class: 'ch-card', role: 'group', 'aria-label': U('result_title'), 'aria-describedby': line ? 'ch-summary' : null });
    var fig = el('figure', { class: 'ch-fig' });
    var holder = el('div', { class: 'ch-diag' });
    fig.appendChild(holder);
    card.appendChild(fig);
    var dl = el('dl', { class: 'ch-setup' });
    SLOTS.forEach(function (k) {
      if (!res.slots[k]) return;
      dl.appendChild(el('dt', { text: U('slot_' + k) }));
      dl.appendChild(optionItem(res.slots[k], 'dd'));
    });
    card.appendChild(dl);
    wrap.appendChild(card);
    pendingDiag = function () { drawDiag(holder, res.slots); };

    // only when the reranker came from the default rather than from an answer
    if (Core.showNoDefault(D, res) && hasText(D.notes.no_default)) wrap.appendChild(T('p', 'ch-default', D.notes.no_default));

    // your answers
    var sum = el('details', { class: 'ch-sum' });
    sum.appendChild(el('summary', { text: U('your_answers') }));
    var ol = el('ol');
    Core.visibleQuestions(D, state.ans).forEach(function (q, i) {
      var o = q.options.filter(function (x) { return x.id === res.answers[q.id]; })[0];
      var li = el('li');
      li.appendChild(T('span', 'ch-sq', q.text));
      li.appendChild(el('span', { text: ' ' }));
      var b = el('button', { type: 'button', class: 'ch-ans', onclick: function () { state.view = 'q'; state.step = i; render(true); } }, [T('span', '', o ? o.label : '')]);
      b.setAttribute('aria-label', U('edit_one') + ': ' + L(q.text) + ' — ' + (o ? L(o.label) : ''));
      li.appendChild(b);
      ol.appendChild(li);
    });
    sum.appendChild(ol);
    var nUnsure = res.unsure.length;
    if (nUnsure) { var ut = U('unsure_note'); sum.appendChild(el('p', { class: 'ch-unsure', text: U('unsure_note', { n: nf(nUnsure, ut), m: nf(Core.visibleQuestions(D, state.ans).length, ut) }) })); }
    wrap.appendChild(sum);
    if (nUnsure) { sum.open = nUnsure > 0 && nUnsure >= 3; }

    function list(ids) {
      var ul = el('ul', { class: 'ch-list' });
      ids.forEach(function (oid) { ul.appendChild(optionItem(oid)); });
      return ul;
    }
    function block(key, cls, ids) {
      if (!ids.length) return;
      var hid = 'ch-h-' + key;
      var sec = el('div', { class: 'ch-block ' + cls, role: 'group', 'aria-labelledby': hid });
      sec.appendChild(el('h4', { class: 'ch-h', id: hid, text: U(key + '_title') }));
      sec.appendChild(list(ids));
      wrap.appendChild(sec);
    }
    var av = Core.splitList(D, res.avoid), ex = Core.splitList(D, res.extras);
    block('tradeoffs', 'ch-trade', res.tradeoffs);
    block('avoid', 'ch-avoid', av.own);
    block('extras', 'ch-extra', ex.own);
    // advice that holds for every setup: one line, opened on demand (native details/summary: keyboard and aria built in)
    var uni = av.all.concat(ex.all);
    if (uni.length) {
      var ud = el('details', { class: 'ch-block ch-universal' });
      ud.appendChild(el('summary', { class: 'ch-h', text: U('universal_title', { n: nf(uni.length, U('universal_title')) }) }));
      if (av.all.length) { ud.appendChild(el('p', { class: 'ch-usub', text: U('avoid_title') })); ud.appendChild(list(av.all)); }
      if (ex.all.length) { ud.appendChild(el('p', { class: 'ch-usub', text: U('extras_title') })); ud.appendChild(list(ex.all)); }
      wrap.appendChild(ud);
    }

    if (order.length) {
      var es = el('div', { class: 'ch-block ch-evs', role: 'group', 'aria-labelledby': 'ch-h-ev' });
      es.appendChild(el('h4', { class: 'ch-h', id: 'ch-h-ev', text: U('evidence_title') }));
      var hidden = order.filter(function (id) { return keys.indexOf(id) < 0; });
      if (hidden.length) es.appendChild(el('p', { class: 'ch-keynote', text: U('key_note') }));
      var grid = el('div', { class: 'ch-grid', id: 'ch-grid' });
      var expanded = false;
      order.forEach(function (id) { var c = evidenceCard(id); if (c) { if (keys.indexOf(id) < 0) { c.hidden = true; c.classList.add('ch-extra-card'); } grid.appendChild(c); } });
      es.appendChild(grid);
      if (hidden.length) {
        var mb = el('button', { type: 'button', class: 'ch-btn ghost ch-more', 'data-more': '', 'aria-expanded': 'false', 'aria-controls': 'ch-grid',
          onclick: function () {
            expanded = !expanded;
            Array.prototype.forEach.call(grid.querySelectorAll('.ch-extra-card'), function (c) { c.hidden = !expanded; });
            mb.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            mb.textContent = expanded ? U('show_less') : U('show_all', { n: nf(order.length, U('show_all')) });
            markFallback(mb.parentNode);
          } }, [U('show_all', { n: nf(order.length, U('show_all')) })]);
        es.appendChild(mb);
      }
      var lg = D.notes.confidence_legend || {};
      var leg = el('div', { class: 'ch-legend', role: 'note', 'aria-label': U('legend_title') });
      ['strong', 'tentative', 'measured'].forEach(function (k) { if (hasText(lg[k])) leg.appendChild(T('p', '', lg[k])); });
      if (hasText(D.notes.untested)) leg.appendChild(T('p', '', D.notes.untested));
      if (hasText(D.notes.ranges)) leg.appendChild(T('p', '', D.notes.ranges));
      if (hasText(D.notes.scope)) leg.appendChild(T('p', '', D.notes.scope));
      if (hasText(D.notes.source)) leg.appendChild(T('p', '', D.notes.source));
      es.appendChild(leg);
      wrap.appendChild(es);
    }
    return wrap;
  }

  var lastSlots = null, lastW = 0;
  function drawDiag(holder, slots) {
    lastSlots = slots;
    holder.innerHTML = '';
    var w = holder.clientWidth || mount.clientWidth || 700;
    lastW = w;
    holder.appendChild(diagram(slots, w));
  }

  /* --- boot --- */
  function fetchJSON(u) { return fetch(u, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); }); }

  function boot() {
    mount = document.getElementById('chooser');
    if (!mount) return;
    lang = document.documentElement.lang === 'fa' ? 'fa' : 'en';
    var base = mount.getAttribute('data-src') || 'assets/data/';
    mount.classList.add('ch');
    mount.setAttribute('aria-busy', 'true');
    Promise.all([fetchJSON(base + 'chooser.json' + VQ), fetchJSON(base + 'evidence.json' + VQ)]).then(function (r) {
      D = Core.normalize(r[0], r[1]);
      G.AnyRAGChooser = { data: D, state: function () { return state; } };
      var fromHash = readHash();
      touched = fromHash;
      render(false);
      if (fromHash) {
        // a shared link: bring the chooser into view, again once late content (figures, fonts) has settled the layout
        var toChooser = function () { var sec = document.getElementById('choose') || mount; sec.scrollIntoView({ behavior: 'auto', block: 'start' }); };
        setTimeout(toChooser, 60);
        if (document.readyState !== 'complete') G.addEventListener('load', function () { setTimeout(toChooser, 120); }, { once: true });
        else setTimeout(toChooser, 600);
      }
    }).catch(function (e) {
      mount.setAttribute('aria-busy', 'false');
      mount.innerHTML = '';
      mount.appendChild(el('p', { class: 'ch-load', role: 'alert', text: UI_EN.failed }));
      if (G.console) console.warn('[chooser]', e);
    });

    document.addEventListener('langchange', function (ev) {
      var l = ev && ev.detail && ev.detail.lang ? ev.detail.lang : document.documentElement.lang;
      lang = l === 'fa' ? 'fa' : 'en';
      if (D) {
        var hadFocus = mount.contains(document.activeElement);
        render(false);
        if (hadFocus) { var f = mount.querySelector('[data-focus]'); if (f) f.focus({ preventScroll: true }); }
      }
    });
    G.addEventListener('hashchange', function () {
      if (D && /^#choose\?/.test(G.location.hash)) { readHash(); touched = true; render(false); }
    });
    var rt = null;
    G.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        var h = mount.querySelector('.ch-diag');
        if (h && lastSlots && Math.abs(h.clientWidth - lastW) > 30) drawDiag(h, lastSlots);
      }, 150);
    });
    if (G.matchMedia) {
      var mq = G.matchMedia('(prefers-reduced-motion: reduce)');
      var f = function () { reduce = mq.matches; };
      if (mq.addEventListener) mq.addEventListener('change', f); else if (mq.addListener) mq.addListener(f);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : globalThis);
