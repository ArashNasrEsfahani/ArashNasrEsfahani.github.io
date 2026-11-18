/* AnyRAG explainer player (W5).
 * Mounts one <video> in #video-mount and swaps the English / Persian render when the page language changes
 * (app.js dispatches `langchange` on document with detail {lang}). Keeps the play position across the swap:
 * both renders share one timeline. No autoplay; nothing is downloaded until the viewer presses play. */
(function () {
  'use strict';
  /* cache-busting: the ?v= of this script's own URL (set in index.html) is added to the files it loads */
  var VQ = (function () { try { var v = new URL(document.currentScript.src).searchParams.get('v'); return v ? '?v=' + encodeURIComponent(v) : ''; } catch (e) { return ''; } })();

  var BASE = 'assets/';
  var LABEL = {
    en: 'AnyRAG explainer video, 90 seconds, on-screen text with music, no narration',
    fa: 'ویدیوی معرفی AnyRAG، ۹۰ ثانیه، متن روی تصویر همراه با موسیقی، بدون گفتار'
  };
  var FALLBACK = {
    en: 'Your browser cannot play this video. ',
    fa: 'مرورگر شما این ویدیو را پخش نمی‌کند. '
  };
  var DOWNLOAD = { en: 'Download the MP4', fa: 'دریافت فایل MP4' };
  // chapters (start in seconds, from the video's timeline.json); both renders share one timeline
  var CHAPTERS = [
    [7, 'What RAG is', 'RAG چیست'],
    [20, 'The question', 'پرسش پژوهش'],
    [29, 'The benchmark', 'بنچمارک'],
    [40, 'Where answers are lost', 'پاسخ‌ها کجا از دست می‌روند'],
    [54, 'What helps, and when', 'چه چیزی در چه شرایطی کمک می‌کند'],
    [70, 'Persian and English', 'فارسی و انگلیسی'],
    [80, 'Limits', 'محدودیت‌ها']
  ];
  var CH_LABEL = { en: 'Chapters', fa: 'فصل‌ها' };
  function clock(t, c) {
    var s = Math.floor(t % 60), m = Math.floor(t / 60), out = m + ':' + (s < 10 ? '0' : '') + s;
    return c === 'fa' && window.AnyRAGNum ? window.AnyRAGNum.digits(out) : out;
  }

  function code(lang) { return lang === 'fa' ? 'fa' : 'en'; }
  function src(c) { return BASE + 'video/explainer_' + c + '.mp4' + VQ; }
  function poster(c) { return BASE + 'img/explainer_' + c + '.jpg' + VQ; }

  function mount() {
    var host = document.getElementById('video-mount');
    if (!host || host.querySelector('video')) return;

    var c = code(document.documentElement.lang);
    var video = document.createElement('video');
    video.id = 'explainer';
    video.controls = true;
    video.preload = 'none';
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('width', '1920');
    video.setAttribute('height', '1080');
    video.style.width = '100%';
    video.style.height = 'auto';
    video.style.aspectRatio = '16 / 9';
    video.style.display = 'block';

    var source = document.createElement('source');
    source.type = 'video/mp4';
    video.appendChild(source);

    var fallback = document.createElement('p');
    var link = document.createElement('a');
    fallback.appendChild(document.createTextNode(''));
    fallback.appendChild(link);
    video.appendChild(fallback);

    function apply(c2, keepTime) {
      if (video.dataset.code === c2) return;
      var t = keepTime ? video.currentTime : 0;
      var wasPlaying = keepTime && !video.paused && !video.ended;
      video.dataset.code = c2;
      video.poster = poster(c2);
      video.setAttribute('aria-label', LABEL[c2]);
      source.src = src(c2);
      link.href = src(c2);
      link.textContent = DOWNLOAD[c2];
      fallback.firstChild.nodeValue = FALLBACK[c2];
      if (!keepTime || (t === 0 && !wasPlaying)) { video.load(); return; }
      video.pause();
      video.preload = 'metadata'; // the viewer already started it: fetch metadata so the position can be restored
      video.load();
      var resume = function () {
        video.removeEventListener('loadedmetadata', resume);
        try { video.currentTime = Math.min(t, (video.duration || t) - 0.1); } catch (e) { /* ignore */ }
        if (wasPlaying) { var p = video.play(); if (p && p.catch) p.catch(function () {}); }
      };
      video.addEventListener('loadedmetadata', resume);
    }

    apply(c, false);
    host.appendChild(video);

    // a line of chapters under the player; a chapter starts the video at that point
    var nav = document.createElement('nav');
    nav.className = 'chapters';
    var list = document.createElement('ol');
    nav.appendChild(list);
    host.appendChild(nav);
    function seek(t) {
      var go = function () {
        try { video.currentTime = t; } catch (e) { /* ignore */ }
        var p = video.play(); if (p && p.catch) p.catch(function () {});
      };
      if (video.readyState >= 1) go();
      else { video.preload = 'metadata'; video.addEventListener('loadedmetadata', go, { once: true }); video.load(); }
    }
    function chapters(c2) {
      nav.setAttribute('aria-label', CH_LABEL[c2]);
      list.textContent = '';
      CHAPTERS.forEach(function (ch) {
        var li = document.createElement('li'), b = document.createElement('button');
        b.type = 'button';
        var tm = document.createElement('span'); tm.className = 'ch-t'; tm.textContent = clock(ch[0], c2);
        var nm = document.createElement('span'); nm.textContent = c2 === 'fa' ? ch[2] : ch[1];
        b.appendChild(tm); b.appendChild(nm);
        b.addEventListener('click', function () { seek(ch[0]); });
        li.appendChild(b); list.appendChild(li);
      });
    }
    chapters(c);

    document.addEventListener('langchange', function (e) {
      var lang = (e && e.detail && e.detail.lang) || document.documentElement.lang;
      apply(code(lang), true);
      chapters(code(lang));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
