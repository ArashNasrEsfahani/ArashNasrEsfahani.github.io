/* AnyRAG shared number formatting for English and Persian (W7). Classic script, no dependencies.
   window.AnyRAGNum:
     isFa(lang?)            true when the page (or the given lang) is Persian
     digits(s)              Latin digits to Persian digits, nothing else
     local(s, lang?)        localise every number inside a free string: Persian digits, «٬» thousands, «٫» decimals,
                            a true minus «−», and an LRM before a sign so it stays on the left of the number in RTL;
                            Latin digits inside names and codes (BM25, GLM-5.3-flash, T1, Qwen3 235B, bge-m3) are kept
     num(n, dec, lang?)     6,000 / ۶٬۰۰۰ ; 1.8 / ۱٫۸
     signed(n, dec, lang?)  +5 / −10 (true minus), localised
     range(a, b, o, lang?)  a single value when a == b; else en "a–b" (o.words: "a to b"), fa «a تا b» (o.compact and
                            unsigned: «a–b»). o.signed adds the sign, o.dec the decimals
     of(a, b, lang?)        "31 of 90" / «۳۱ از ۹۰»
     iso(s, lang?)          wraps Persian text in RLI…PDI so it reads right to left inside an LTR SVG */
(function (G) {
  'use strict';
  var FA = '۰۱۲۳۴۵۶۷۸۹', LRM = '‎';
  function isFa(l) {
    var v = l || (G.document && G.document.documentElement && G.document.documentElement.lang) || 'en';
    return String(v).slice(0, 2) === 'fa';
  }
  function digits(s) { return String(s).replace(/[0-9]/g, function (d) { return FA[+d]; }); }
  function faNumber(t) {
    // t: a run of digits with , and . (maybe a leading .)
    if (t.charAt(0) === '.') t = '0' + t;
    return digits(t.replace(/,/g, '٬').replace(/\./g, '٫'));
  }
  // a Latin word (kept as is, digits included) | a number with an optional sign
  var TOK = /([A-Za-z][A-Za-z0-9_]*(?:[.\-+][A-Za-z0-9_]+)*)|([+\-−±]?)((?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+))(?![A-Za-z0-9])/g;
  function local(s, l) {
    s = String(s == null ? '' : s);
    if (!isFa(l)) return s.replace(/(^|[\s(\/])-(?=\d)/g, '$1−');
    return s.replace(TOK, function (m, word, sign, n, off, all) {
      if (word) return word;
      var prev = off > 0 ? all.charAt(off - 1) : '';
      var out = faNumber(n).replace(/٫$/, '');
      if (sign) {
        if (/[0-9A-Za-z۰-۹]/.test(prev)) return sign + out; // a dash between two values, not a sign
        out = LRM + (sign === '-' ? '−' : sign) + out;
      }
      return out;
    }).replace(/([۰-۹])%/g, '$1٪');
  }
  function plain(n, dec) {
    var x = Math.abs(+n), s = x.toFixed(dec || 0), p = s.split('.');
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return p.join('.');
  }
  function num(n, dec, l) {
    var s = (+n < 0 ? '−' : '') + plain(n, dec);
    return isFa(l) ? (+n < 0 ? LRM : '') + (+n < 0 ? '−' : '') + faNumber(plain(n, dec)) : s;
  }
  function signed(n, dec, l) {
    if (+n === 0) return num(0, dec, l);
    var sg = +n > 0 ? '+' : '−';
    return (isFa(l) ? LRM + sg + faNumber(plain(n, dec)) : sg + plain(n, dec));
  }
  function range(a, b, o, l) {
    o = o || {};
    var f = function (v) { return o.signed ? signed(v, o.dec, l) : num(v, o.dec, l); };
    if (a === b) return f(a);
    if (isFa(l)) return (o.compact && !o.signed && a >= 0) ? f(a) + '–' + f(b) : f(a) + ' تا ' + f(b);
    return (o.words || o.signed) ? f(a) + ' to ' + f(b) : f(a) + '–' + f(b);
  }
  function of(a, b, l) { return isFa(l) ? local(a, 'fa') + ' از ' + local(b, 'fa') : a + ' of ' + b; }
  // only text with Persian letters is isolated; a number in Persian digits reads left to right on its own
  function iso(s, l) { return isFa(l) && /[؀-ٟٮ-ۯۺ-ۿ]/.test(s) ? '⁧' + s + '⁩' : s; }
  // authored Persian prose: keep a sign on the left of a Persian-digit number in RTL (an LRM before it)
  function signs(s) { return String(s).replace(/(^|[\s(\[«،؛:])([+\-−±])(?=[۰-۹])/g, function (m, p, sg) { return p + LRM + (sg === '-' ? '−' : sg); }); }
  G.AnyRAGNum = { isFa: isFa, digits: digits, local: local, num: num, signed: signed, range: range, of: of, iso: iso, signs: signs, LRM: LRM };
})(typeof window !== 'undefined' ? window : this);
