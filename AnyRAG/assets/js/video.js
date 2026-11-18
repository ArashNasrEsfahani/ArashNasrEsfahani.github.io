/* AnyRAG explainer player (W5).
 * Mounts one <video> in #video-mount and swaps the English / Persian render when the page language changes
 * (app.js dispatches `langchange` on document with detail {lang}). Keeps the play position across the swap:
 * both renders share one timeline. No autoplay; nothing is downloaded until the viewer presses play. */
(function () {
  'use strict';

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

  function code(lang) { return lang === 'fa' ? 'fa' : 'en'; }
  function src(c) { return BASE + 'video/explainer_' + c + '.mp4'; }
  function poster(c) { return BASE + 'img/explainer_' + c + '.jpg'; }

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

    document.addEventListener('langchange', function (e) {
      var lang = (e && e.detail && e.detail.lang) || document.documentElement.lang;
      apply(code(lang), true);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
