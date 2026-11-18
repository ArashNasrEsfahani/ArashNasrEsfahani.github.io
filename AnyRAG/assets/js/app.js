/* AnyRAG project page: shell (nav, theme, language, lazy video, section reveal, hero lattice, BibTeX copy).
   Plain JS, no dependencies. Components (chooser.js, viz2d.js, pipeline3d.js, video.js) read
   document.documentElement.lang ('en' | 'fa') and listen on document for:
     'langchange'  detail: {lang}
     'themechange' detail: {theme}   ('light' | 'dark', the effective theme)
   window.AnyRAG exposes {lang, theme, t(key), ready} for them. */
(function () {
  'use strict';
  var root = document.documentElement;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var mq = function (q) { return window.matchMedia ? window.matchMedia(q) : { matches: false, addEventListener: function () {} }; };
  var reduceMQ = mq('(prefers-reduced-motion: reduce)');
  var darkMQ = mq('(prefers-color-scheme: dark)');
  var NS = 'http://www.w3.org/2000/svg';
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  /* ---------- language ---------- */
  var lang = root.lang === 'fa' ? 'fa' : 'en';
  var dict = {};
  var EXTRA = { 'lang.toFa': 'تغییر به فارسی', 'lang.toEn': 'Switch to English' };

  function entry(key) { return dict[key] || null; }
  function t(key) {
    var e = entry(key);
    if (lang === 'fa' && e && e.fa) return e.fa;
    if (e && e.en) return e.en;
    return EXTRA[key] || key;
  }

  function applyLang() {
    root.lang = lang; root.dir = lang === 'fa' ? 'rtl' : 'ltr';
    $$('[data-i18n]').forEach(function (el) {
      if (el.dataset.en === undefined) el.dataset.en = el.innerHTML;
      var e = entry(el.dataset.i18n);
      if (lang === 'fa' && e && e.fa) {
        el.innerHTML = window.AnyRAGNum ? window.AnyRAGNum.signs(e.fa) : e.fa;
        el.removeAttribute('data-i18n-fb'); el.removeAttribute('lang'); el.removeAttribute('dir');
      } else {
        el.innerHTML = el.dataset.en;
        if (lang === 'fa') { el.setAttribute('data-i18n-fb', ''); el.setAttribute('lang', 'en'); el.setAttribute('dir', 'ltr'); }
        else { el.removeAttribute('data-i18n-fb'); el.removeAttribute('lang'); el.removeAttribute('dir'); }
      }
    });
    $$('[data-i18n-attr]').forEach(function (el) {
      el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var p = pair.split('|'), attr = p[0], key = p[1];
        if (!attr || !key) return;
        var store = 'en' + attr.replace(/(^|-)(\w)/g, function (_, __, c) { return c.toUpperCase(); });
        if (el.dataset[store] === undefined) el.dataset[store] = el.getAttribute(attr) || '';
        var e = entry(key);
        el.setAttribute(attr, lang === 'fa' && e && e.fa ? e.fa : el.dataset[store]);
      });
    });
    var lb = $('#langBtn');
    if (lb) lb.setAttribute('aria-label', lang === 'fa' ? EXTRA['lang.toEn'] : EXTRA['lang.toFa']);
    // section numbers and other bare numerals: Persian digits in Persian
    $$('.sn,[data-num]').forEach(function (el) {
      if (el.dataset.numEn === undefined) el.dataset.numEn = el.textContent;
      var N = window.AnyRAGNum;
      el.textContent = lang === 'fa' && N ? N.local(el.dataset.numEn, 'fa') : el.dataset.numEn;
    });
    labelPipes();
    document.title = 'AnyRAG';
  }
  function setLang(next, announce) {
    lang = next;
    applyLang();
    if (announce) document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: lang } }));
  }
  var langBtn = $('#langBtn');
  if (langBtn) langBtn.addEventListener('click', function () {
    var next = lang === 'fa' ? 'en' : 'fa';
    store('anyrag-lang', next);
    setLang(next, true);
  });

  /* ---------- theme ---------- */
  function effectiveTheme() {
    var cur = root.getAttribute('data-theme');
    return cur === 'dark' || cur === 'light' ? cur : (darkMQ.matches ? 'dark' : 'light');
  }
  function fireTheme() { document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: effectiveTheme() } })); }
  var themeBtn = $('#themeBtn');
  if (themeBtn) themeBtn.addEventListener('click', function () {
    var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    store('anyrag-theme', next);
    fireTheme();
  });
  if (darkMQ.addEventListener) darkMQ.addEventListener('change', function () { if (!root.getAttribute('data-theme')) fireTheme(); });

  /* ---------- public API for the components ---------- */
  var readyResolve;
  window.AnyRAG = {
    get lang() { return lang; },
    get theme() { return effectiveTheme(); },
    get reducedMotion() { return reduceMQ.matches; },
    t: t,
    ready: new Promise(function (r) { readyResolve = r; })
  };

  /* ---------- mobile menu ---------- */
  var menuBtn = $('#menuBtn'), links = $('#navLinks');
  function closeMenu() { if (links) links.classList.remove('open'); if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false'); }
  if (menuBtn && links) {
    menuBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = !links.classList.contains('open');
      links.classList.toggle('open', open); menuBtn.setAttribute('aria-expanded', String(open));
    });
    links.addEventListener('click', function (e) { if (e.target.closest('a')) closeMenu(); });
    document.addEventListener('click', function (e) { if (!e.target.closest('.nav')) closeMenu(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && links.classList.contains('open')) { closeMenu(); menuBtn.focus(); } });
  }

  /* ---------- small tables: labels for the stacked phone layout ---------- */
  function labelPipes() {
    var tb = $('.pipes'); if (!tb) return;
    var heads = $$('thead th', tb).map(function (th) { return th.textContent.trim(); });
    $$('tbody tr', tb).forEach(function (tr) {
      $$('th,td', tr).forEach(function (c, i) { if (c.classList.contains('num')) c.setAttribute('data-label', heads[i] || ''); });
    });
  }

  /* ---------- mounts: quiet placeholder until a component renders ---------- */
  $$('.mount').forEach(function (m) {
    var clear = function () {
      var ph = $(':scope > .ph', m);
      if (!ph) return true;
      var other = Array.prototype.some.call(m.childNodes, function (n) { return n !== ph && (n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim())); });
      if (other) { ph.remove(); return true; }
      return false;
    };
    if (clear() || !('MutationObserver' in window)) return;
    var mo = new MutationObserver(function () { if (clear()) mo.disconnect(); });
    mo.observe(m, { childList: true });
  });

  /* ---------- lazy video: any <video data-src> or <source data-src> gets its src when near the viewport ---------- */
  function wake(v) {
    $$('source[data-src]', v).concat(v.hasAttribute('data-src') ? [v] : []).forEach(function (s) { s.src = s.getAttribute('data-src'); s.removeAttribute('data-src'); });
    if (v.load) v.load();
  }
  function lazyVideos() {
    var vids = $$('video').filter(function (v) { return v.hasAttribute('data-src') || $('source[data-src]', v); });
    if (!vids.length) return;
    if (!('IntersectionObserver' in window)) { vids.forEach(wake); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); wake(e.target); } });
    }, { rootMargin: '400px' });
    vids.forEach(function (v) { io.observe(v); });
  }

  /* ---------- section reveal + current nav item ---------- */
  var secs = $$('main .sec');
  if ('IntersectionObserver' in window) {
    var rio = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('seen'); rio.unobserve(e.target); } });
    }, { threshold: 0.08 });
    secs.forEach(function (s) { rio.observe(s); });
    var navA = $$('.links a');
    var cio = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        navA.forEach(function (a) { if (a.getAttribute('href') === '#' + e.target.id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    secs.forEach(function (s) { cio.observe(s); });
  } else secs.forEach(function (s) { s.classList.add('seen'); });

  /* in-page links: the target section's heading draws a short lapis rule */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href').slice(1), el = id && document.getElementById(id);
    if (!el) return;
    var sec = el.closest('.sec'); if (!sec) return;
    sec.classList.remove('landed'); void sec.offsetWidth;
    setTimeout(function () { sec.classList.add('landed'); }, reduceMQ.matches ? 0 : 450);
    setTimeout(function () { sec.classList.remove('landed'); }, 2800);
  });

  /* ---------- hero: a girih-like hairline lattice (eight-point stars and crosses);
     a few stars are lit in turquoise and joined to one lapis star, the reader ---------- */
  function lattice() {
    var svg = $('#lattice'); if (!svg) return;
    var W = 900, H = 860, s = 100, r = 24, q = r * Math.SQRT2;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('preserveAspectRatio', 'xMaxYMid slice');
    var cols = Math.ceil(W / s) + 1, rows = Math.ceil(H / s) + 1, d = '';
    function star(cx, cy) {
      var p = [];
      for (var i = 0; i < 16; i++) {
        // two overlapping squares (circumradius q): tips alternate with the crossings at q*cos45/cos22.5, an eight-point khatam
        var a = Math.PI / 8 * i - Math.PI / 2, rr = i % 2 ? q * 0.7654 : q;
        p.push((cx + rr * Math.cos(a)).toFixed(1) + ',' + (cy + rr * Math.sin(a)).toFixed(1));
      }
      return 'M' + p.join('L') + 'Z';
    }
    for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) {
      var cx = i * s + s / 2, cy = j * s + s / 2;
      d += star(cx, cy);
      // links to the right and down neighbours, tip to tip, and the diagonal crosses between them
      d += 'M' + (cx + q) + ',' + cy + 'H' + (cx + s - q);
      d += 'M' + cx + ',' + (cy + q) + 'V' + (cy + s - q);
      var k = s / 2, m = 11;
      d += 'M' + (cx + k - m) + ',' + (cy + k) + 'L' + (cx + k) + ',' + (cy + k - m) + 'L' + (cx + k + m) + ',' + (cy + k) + 'L' + (cx + k) + ',' + (cy + k + m) + 'Z';
    }
    var g = document.createElementNS(NS, 'path'); g.setAttribute('class', 'g'); g.setAttribute('d', d); svg.appendChild(g);
    var C = function (i, j) { return [i * s + s / 2, j * s + s / 2]; };
    var lit = [C(3, 1), C(2, 4), C(4, 5)], reader = C(7, 3);
    lit.forEach(function (c, n) {
      var f = document.createElementNS(NS, 'path'); f.setAttribute('class', 'litfill'); f.setAttribute('d', star(c[0], c[1]));
      f.style.setProperty('--d', (0.6 + n * 0.35) + 's'); svg.appendChild(f);
      var p = document.createElementNS(NS, 'path'); p.setAttribute('class', 'lit');
      p.setAttribute('d', star(c[0], c[1]) + 'M' + c[0] + ',' + c[1] + 'L' + reader[0] + ',' + reader[1]);
      p.style.setProperty('--d', (0.6 + n * 0.35) + 's'); svg.appendChild(p);
    });
    var rd = document.createElementNS(NS, 'path'); rd.setAttribute('class', 'reader'); rd.setAttribute('d', star(reader[0], reader[1]));
    rd.style.setProperty('--d', '1.9s'); svg.appendChild(rd);
    $$('.lit,.reader', svg).forEach(function (p) { try { p.style.setProperty('--len', Math.ceil(p.getTotalLength()) + 1); } catch (e) {} });
    requestAnimationFrame(function () { requestAnimationFrame(function () { svg.classList.add('on'); }); });
  }

  /* ---------- BibTeX copy ---------- */
  var copyBtn = $('#copyBib');
  if (copyBtn) copyBtn.addEventListener('click', function () {
    var text = $('#bibText').textContent, status = $('#copyStatus');
    function done(ok) {
      status.textContent = t(ok ? 'copy.done' : 'copy.fail');
      copyBtn.classList.toggle('done', ok);
      setTimeout(function () { status.textContent = ''; copyBtn.classList.remove('done'); }, 2400);
    }
    function legacy() {
      try {
        var sel = window.getSelection(), rg = document.createRange();
        rg.selectNodeContents($('#bibText')); sel.removeAllRanges(); sel.addRange(rg);
        var ok = document.execCommand && document.execCommand('copy');
        done(!!ok);
      } catch (e) { done(false); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, legacy);
    else legacy();
  });

  /* ---------- start ---------- */
  applyLang();
  lattice();
  lazyVideos();
  function finish() { if (readyResolve) readyResolve(window.AnyRAG); if (lang === 'fa') document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: lang } })); }
  if (window.fetch) {
    fetch('assets/data/i18n.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (j) { dict = j || {}; applyLang(); finish(); })
      .catch(function () { finish(); });
  } else finish();
})();
