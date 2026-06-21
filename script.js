// Progressive enhancement: the page is fully readable with no JS.
// Adding `.js` to <html> opts the page into the reveal animations.
document.documentElement.classList.add('js');

document.addEventListener('DOMContentLoaded', () => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hasIO = 'IntersectionObserver' in window;

    /* ---- Current year in footer ---- */
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    /* ---- Landing: automatic "Space Eagle" intro. The inside is shown, it flips
       to the front, then the eagle launches up and the site is revealed. CSS drives
       the whole sequence (and auto-hides the overlay even without JS); JS just locks
       scroll, lets a tap skip ahead, and removes the node when it finishes. */
    const landing = document.getElementById('landing');
    if (landing) {
        if (prefersReduced) {
            landing.remove();
        } else {
            document.documentElement.classList.add('landing-lock');
            document.body.classList.add('landing-lock');
            const endIntro = () => {
                if (!landing.isConnected) return;
                document.documentElement.classList.remove('landing-lock');
                document.body.classList.remove('landing-lock');
                landing.remove();
            };
            landing.addEventListener('click', () => {
                landing.classList.add('is-skip');
                window.setTimeout(endIntro, 260);
            });
            landing.addEventListener('animationend', (e) => {
                if (e.target === landing && e.animationName === 'overlayFade') endIntro();
            });
            // Fallback in case animationend never fires.
            window.__introTimer = window.setTimeout(endIntro, 6000);
        }
    }

    /* ---- Staggered reveal on scroll ----
       Each "group" (hero, a section, the footer) reveals its items with a
       small per-item delay so content eases in as you scroll to it. */
    const ITEM_SEL = '.eyebrow, .section-title, .prose p, .news-item, .pub, .entry, .project, .award-list li, .skill-block';
    const groups = [];

    const heroMain = document.querySelector('.hero-main');
    if (heroMain) groups.push({ container: heroMain, items: Array.from(heroMain.children), immediate: true });

    document.querySelectorAll('.section').forEach(section => {
        const items = Array.from(section.querySelectorAll(ITEM_SEL));
        groups.push({ container: section, items: items.length ? items : [section] });
    });

    const footer = document.querySelector('.footer-inner');
    if (footer) groups.push({ container: footer, items: Array.from(footer.children) });

    groups.forEach(g => g.items.forEach((el, i) => {
        el.classList.add('reveal');
        el.style.transitionDelay = Math.min(i * 60, 360) + 'ms';
    }));

    const revealGroup = g => g.items.forEach(el => el.classList.add('in'));

    if (prefersReduced || !hasIO) {
        groups.forEach(revealGroup);
    } else {
        // Reveal the hero right away for a clean load-in.
        const hero = groups.find(g => g.immediate);
        if (hero) requestAnimationFrame(() => requestAnimationFrame(() => revealGroup(hero)));

        const revealObserver = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const g = groups.find(gr => gr.container === entry.target);
                if (g) revealGroup(g);
                obs.unobserve(entry.target);
            });
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

        groups.forEach(g => { if (!g.immediate) revealObserver.observe(g.container); });
    }

    /* ---- Sticky topbar: show border + name once scrolled past the hero ---- */
    const topbar = document.querySelector('.topbar');
    const heroEl = document.querySelector('.hero');
    if (topbar && heroEl && hasIO) {
        const heroSentinel = new IntersectionObserver(([entry]) => {
            topbar.classList.toggle('scrolled', !entry.isIntersecting);
        }, { rootMargin: '-60px 0px 0px 0px', threshold: 0 });
        heroSentinel.observe(heroEl);
    }

    /* ---- Scrollspy: highlight the active section in the nav ---- */
    const navLinks = Array.from(document.querySelectorAll('.topbar-links a[href^="#"]'));
    const linkById = new Map(navLinks.map(a => [a.getAttribute('href').slice(1), a]));
    const spySections = Array.from(document.querySelectorAll('main section[id], header[id]'))
        .filter(s => linkById.has(s.id));

    if (spySections.length && hasIO) {
        let active = null;
        const setActive = (id) => {
            if (id === active) return;
            active = id;
            navLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#${id}`));
        };
        const spy = new IntersectionObserver((entries) => {
            const visible = entries
                .filter(e => e.isIntersecting)
                .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
            if (visible[0]) setActive(visible[0].target.id);
        }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
        spySections.forEach(s => spy.observe(s));
    }

    /* ---- Scroll-position progress bar ---- */
    const progress = document.querySelector('.scroll-progress span');
    if (progress) {
        let ticking = false;
        const update = () => {
            const doc = document.documentElement;
            const max = doc.scrollHeight - doc.clientHeight;
            const p = max > 0 ? Math.min(doc.scrollTop / max, 1) : 0;
            progress.style.transform = `scaleX(${p})`;
            ticking = false;
        };
        window.addEventListener('scroll', () => {
            if (!ticking) { ticking = true; requestAnimationFrame(update); }
        }, { passive: true });
        update();
    }
});
