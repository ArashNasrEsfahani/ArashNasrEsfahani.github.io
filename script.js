// Everything here is optional: with JavaScript off the page reads the same, without the Space Eagle and its notebook.
(() => {
    const year = document.getElementById('year');
    if (year) year.textContent = new Date().getFullYear();

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const buddy = document.getElementById('buddy');
    const notebook = document.getElementById('notebook');
    const perches = Array.from(document.querySelectorAll('.perch'));
    if (!buddy || !notebook || !perches.length) return;

    const craft = buddy.querySelector('.buddy-craft');
    const act = buddy.querySelector('.act');
    const sprite = buddy.querySelector('.sprite');
    const menu = buddy.querySelector('.buddy-menu');
    const fx = document.createElement('div');
    fx.className = 'fx';
    fx.setAttribute('aria-hidden', 'true');
    document.body.appendChild(fx);

    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const now = () => performance.now();

    /* ------------------------------------------------------------------ state
       The eagle lives in page coordinates (it scrolls with the page while it sits on a perch).
       mode: 'perched' | 'flying' | 'drag' | 'launch' */
    const S = {
        x: -300, y: -300, vx: 0, vy: 0,
        mode: 'perched', perch: null, flight: null, launch: null,
        thrust: 0, thrustTarget: 0,
        tilt: 0, lag: 0, lagV: 0, lean: 0,
        lastPuff: 0, raf: 0, lastT: 0,
    };

    const size = () => [buddy.offsetWidth, buddy.offsetHeight];
    const spot = (perch) => {
        const r = perch.getBoundingClientRect();
        const [w, h] = size();
        return [r.left + r.width / 2 + window.scrollX - w / 2, r.bottom + window.scrollY - h];
    };
    const render = () => {
        buddy.style.transform = `translate3d(${S.x.toFixed(1)}px, ${S.y.toFixed(1)}px, 0)`;
        sprite.style.transform = `translateY(${S.lag.toFixed(2)}px) rotate(${(S.tilt + S.lean).toFixed(2)}deg)`;
        buddy.style.setProperty('--thrust', S.thrust.toFixed(3));
        buddy.classList.toggle('is-firing', S.thrust > 0.04);
    };

    /* ------------------------------------------------------------------ particles: exhaust puffs and landing dust */
    const feet = () => {
        const [w, h] = size();
        return [S.x + w * 0.42, S.y + h * 0.97];
    };
    const puff = (x, y, opts) => {
        if (reduce || fx.childElementCount > 46) return;
        const p = document.createElement('i');
        p.className = 'puff' + (opts.dust ? ' dust' : '');
        p.style.left = x.toFixed(1) + 'px';
        p.style.top = y.toFixed(1) + 'px';
        p.style.setProperty('--s', opts.s.toFixed(1) + 'px');
        p.style.setProperty('--dx', opts.dx.toFixed(1) + 'px');
        p.style.setProperty('--dy', opts.dy.toFixed(1) + 'px');
        p.style.setProperty('--d', opts.d + 'ms');
        p.addEventListener('animationend', () => p.remove());
        fx.appendChild(p);
    };
    const exhaust = (t, rate) => {
        if (t - S.lastPuff < rate) return;
        S.lastPuff = t;
        const [fx0, fy0] = feet();
        puff(fx0 + (Math.random() - 0.5) * 10, fy0, {
            s: 7 + Math.random() * 8 + S.thrust * 6,
            dx: -S.vx * 0.12 + (Math.random() - 0.5) * 18,
            dy: 26 + Math.random() * 22 - S.vy * 0.08,
            d: 520 + Math.random() * 260,
        });
    };
    const dust = () => {
        const [fx0, fy0] = feet();
        for (let i = 0; i < 6; i++) {
            const side = i % 2 ? 1 : -1;
            puff(fx0 + side * 4, fy0 - 2, { s: 6 + Math.random() * 7, dx: side * (16 + Math.random() * 22), dy: -4 - Math.random() * 8, d: 480 + Math.random() * 220, dust: true });
        }
    };

    /* ------------------------------------------------------------------ one-off moves on the inner wrapper (CSS keyframes) */
    const play = (name, ms) => {
        if (reduce) return;
        act.classList.remove('do-land', 'do-hop', 'do-wiggle', 'do-turn', 'do-crouch');
        void act.offsetWidth;
        act.classList.add('do-' + name);
        window.clearTimeout(play.t);
        play.t = window.setTimeout(() => act.classList.remove('do-' + name), ms);
    };
    const setIdle = (on) => buddy.classList.toggle('is-idle', on && !reduce);

    /* ------------------------------------------------------------------ the frame loop (only runs while something moves) */
    const loop = (t) => {
        const dt = Math.min(0.05, (t - (S.lastT || t)) / 1000);
        S.lastT = t;
        let active = false;
        const px = S.x, py = S.y;

        if (S.mode === 'flying' && S.flight) {
            const f = S.flight;
            const u = clamp((t - f.t0) / f.dur, 0, 1);
            const e = ease(u);
            const a = 1 - e;
            S.x = a * a * f.ax + 2 * a * e * f.cx + e * e * f.bx;
            S.y = a * a * f.ay + 2 * a * e * f.cy + e * e * f.by;
            // the perch may have moved (images loading, resizing): track it near the end
            if (u > 0.6 && f.perch) { const [bx, by] = spot(f.perch); f.bx += (bx - f.bx) * 0.2; f.by += (by - f.by) * 0.2; }
            S.thrustTarget = u < 0.85 ? 0.75 + 0.25 * Math.sin(u * Math.PI) : 1 - (u - 0.85) / 0.15 * 0.9;
            exhaust(t, 34);
            active = true;
            if (u >= 1) land();
        } else if (S.mode === 'launch' && S.launch) {
            const L = S.launch, k = t - L.t0;
            const top = window.scrollY - size()[1] - 80;
            if (k < 220) {                                   // crouch, flames start
                S.thrustTarget = 0.35;
            } else if (L.phase === 'up') {                   // accelerate up and off the screen
                const s = (k - 220) / 1000;
                S.y = L.y0 - 2600 * s * s;
                S.x = L.x0 + Math.sin(s * 9) * 6;
                S.thrustTarget = 1;
                exhaust(t, 18);
                if (S.y < top - 60) { L.phase = 'gone'; L.tg = t; }
            } else if (L.phase === 'gone') {
                S.thrustTarget = 0;
                S.y = top - 60;
                if (t - L.tg > 380) { L.phase = 'down'; L.td = t; }
            } else if (L.phase === 'down') {                 // drop back in from the top with a landing burn
                const [bx, by] = spot(S.perch);
                const u = clamp((t - L.td) / 1100, 0, 1);
                const e = 1 - Math.pow(1 - u, 3);
                const sy = window.scrollY - size()[1] - 60;
                S.x = bx + Math.sin(u * 7) * (1 - u) * 14;
                S.y = sy + (by - sy) * e;
                S.thrustTarget = 0.5 + 0.5 * (1 - u);
                exhaust(t, 30);
                if (u >= 1) { S.mode = 'flying'; S.flight = null; land(); }
            }
            active = true;
        } else if (S.mode === 'drag') {
            S.thrustTarget = 0.85;
            exhaust(t, 30);
            active = true;
        } else {
            S.thrustTarget = 0;
        }

        // velocity, lean into horizontal motion, thrust easing
        if (dt > 0 && S.mode !== 'drag') { S.vx = (S.x - px) / dt; S.vy = (S.y - py) / dt; }
        const tiltTarget = S.mode === 'perched' ? 0 : clamp(S.vx * 0.022, -32, 32);
        S.tilt += (tiltTarget - S.tilt) * Math.min(1, dt * 9);
        S.thrust += (S.thrustTarget - S.thrust) * Math.min(1, dt * 10);
        // scroll lag: a spring on the drawing only
        S.lagV += (-S.lag * 160 - S.lagV * 16) * dt;
        S.lag += S.lagV * dt;
        S.lean *= Math.pow(0.02, dt);
        if (Math.abs(S.lag) > 0.08 || Math.abs(S.lagV) > 0.5 || Math.abs(S.tilt) > 0.15 || S.thrust > 0.01 || Math.abs(S.lean) > 0.1) active = true;

        render();
        S.raf = active ? window.requestAnimationFrame(loop) : 0;
        if (!active) S.lastT = 0;
    };
    const kick = () => { if (!S.raf) S.raf = window.requestAnimationFrame(loop); };

    /* ------------------------------------------------------------------ flying between perches on a curved path */
    function land() {
        S.mode = 'perched';
        S.flight = null;
        S.vx = S.vy = 0;
        const [bx, by] = spot(S.perch);
        S.x = bx; S.y = by;
        dust();
        play('land', 520);
        setIdle(true);
        kick();
    }
    const flyTo = (perch) => {
        S.perch = perch;
        closeMenu();
        if (reduce) {
            const [bx, by] = spot(perch);
            S.x = bx; S.y = by; S.mode = 'perched';
            render();
            return;
        }
        const [bx, by] = spot(perch);
        const ax = S.x, ay = S.y;
        const dx = bx - ax, dy = by - ay;
        const dist = Math.hypot(dx, dy) || 1;
        // swing out towards the side of the page with more room, and lift a little
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        const side = (mx - window.scrollX) < window.innerWidth / 2 ? -1 : 1;
        const off = Math.min(dist * 0.28, Math.max(70, window.innerWidth * 0.22));
        S.flight = {
            ax, ay, bx, by, perch,
            cx: mx + side * off * Math.abs(dy) / dist + (dy === 0 ? 0 : 0),
            cy: my - Math.min(dist * 0.12, 90) + (-side) * off * (dx / dist) * 0.3,
            t0: now(),
            dur: clamp(520 + dist * 0.42, 700, 1600),
        };
        S.mode = 'flying';
        setIdle(false);
        kick();
    };

    /* ------------------------------------------------------------------ which perch: the one nearest the reading line that is on screen */
    const pick = () => {
        if (S.mode === 'launch' || S.mode === 'drag' || !menu.hidden || notebook.open) return;
        const vh = window.innerHeight;
        const atBottom = window.scrollY + vh >= document.documentElement.scrollHeight - 4;
        let best = null, bestD = Infinity;
        for (const p of perches) {
            const r = p.getBoundingClientRect();
            if (r.bottom < vh * 0.12 || r.bottom > vh * 0.97) continue;
            const d = Math.abs(r.bottom - vh * 0.5);
            if (d < bestD) { best = p; bestD = d; }
        }
        const last = perches[perches.length - 1];
        if (atBottom && last.getBoundingClientRect().bottom <= vh) best = last;
        const target = S.mode === 'flying' && S.flight ? S.flight.perch : S.perch;
        if (best && best !== target) flyTo(best);
    };

    /* ------------------------------------------------------------------ it feels the scroll: the drawing lags and sways with the page's speed */
    let lastY = window.scrollY, lastScrollT = now(), ticking = false;
    window.addEventListener('scroll', () => {
        const t = now(), y = window.scrollY;
        const v = (y - lastY) / Math.max(8, t - lastScrollT);   // px per ms
        lastY = y; lastScrollT = t;
        if (!reduce && S.mode === 'perched') {
            S.lagV += clamp(v, -6, 6) * 60;
            S.lean += clamp(v, -6, 6) * 2.2;
            kick();
        }
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(() => { ticking = false; pick(); });
    }, { passive: true });
    window.addEventListener('resize', () => {
        if (S.mode === 'perched' && S.perch) { const [bx, by] = spot(S.perch); S.x = bx; S.y = by; render(); }
        pick();
    });

    /* ------------------------------------------------------------------ desktop: it leans towards a nearby mouse */
    if (window.matchMedia('(hover: hover)').matches && !reduce) {
        window.addEventListener('pointermove', (e) => {
            if (S.mode !== 'perched' || e.pointerType !== 'mouse') return;
            const r = craft.getBoundingClientRect();
            const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            const d = Math.hypot(e.clientX - cx, e.clientY - cy);
            if (d > 180) return;
            S.lean += ((e.clientX - cx) / 180) * 1.6 * (1 - d / 180);
            S.lean = clamp(S.lean, -12, 12);
            kick();
        }, { passive: true });
    }

    /* ------------------------------------------------------------------ drag it anywhere; let go and it flies home */
    let down = null, dragged = false;
    craft.addEventListener('pointerdown', (e) => {
        if (reduce || e.button > 0) return;
        down = { x: e.clientX, y: e.clientY, id: e.pointerId, t: now(), ox: e.clientX + window.scrollX - S.x, oy: e.clientY + window.scrollY - S.y };
        dragged = false;
    });
    craft.addEventListener('pointermove', (e) => {
        if (!down || e.pointerId !== down.id) return;
        if (!dragged && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 7) return;
        if (!dragged) {
            dragged = true;
            craft.setPointerCapture(e.pointerId);
            closeMenu();
            S.mode = 'drag';
            S.flight = null;
            setIdle(false);
            buddy.classList.add('is-dragging');
            kick();
        }
        const t = now();
        const nx = e.clientX + window.scrollX - down.ox, ny = e.clientY + window.scrollY - down.oy;
        const dt = Math.max(8, t - down.t) / 1000;
        S.vx = S.vx * 0.6 + ((nx - S.x) / dt) * 0.4;
        S.vy = S.vy * 0.6 + ((ny - S.y) / dt) * 0.4;
        S.x = nx; S.y = ny; down.t = t;
    });
    const release = () => {
        if (!down) return;
        down = null;
        if (!dragged) return;
        buddy.classList.remove('is-dragging');
        S.mode = 'flying';
        // home: the nearest perch on screen, else the one it came from
        let best = null, bestD = Infinity;
        for (const p of perches) {
            const r = p.getBoundingClientRect();
            if (r.bottom < 0 || r.top > window.innerHeight) continue;
            const [px, py] = spot(p);
            const d = Math.hypot(px - S.x, py - S.y);
            if (d < bestD) { best = p; bestD = d; }
        }
        flyTo(best || S.perch);
    };
    craft.addEventListener('pointerup', release);
    craft.addEventListener('pointercancel', release);

    /* ------------------------------------------------------------------ a tap opens its menu (keyboard: Enter / Space) */
    function closeMenu() {
        if (menu.hidden) return;
        menu.hidden = true;
        craft.setAttribute('aria-expanded', 'false');
    }
    const openMenu = () => {
        const r = buddy.getBoundingClientRect();
        buddy.classList.toggle('menu-right', r.left < Math.min(272, window.innerWidth - 40) && r.left < window.innerWidth / 2);
        menu.hidden = false;
        craft.setAttribute('aria-expanded', 'true');
        const bar = document.querySelector('.bar');
        buddy.classList.toggle('menu-below', r.top - menu.offsetHeight - 12 < (bar ? bar.getBoundingClientRect().bottom : 0));
        play('hop', 600);
    };
    craft.addEventListener('click', () => {
        if (dragged) { dragged = false; return; }
        if (S.mode !== 'perched') return;
        if (menu.hidden) openMenu(); else closeMenu();
    });
    document.addEventListener('click', (e) => { if (!buddy.contains(e.target) && !menu.hidden) { closeMenu(); pick(); } });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

    buddy.querySelector('.buddy-launch').addEventListener('click', () => {
        if (S.mode !== 'perched') return;
        closeMenu();
        if (reduce) {
            S.thrust = 1; render();
            window.setTimeout(() => { S.thrust = 0; render(); }, 900);
            return;
        }
        setIdle(false);
        play('crouch', 240);
        S.mode = 'launch';
        S.launch = { t0: now(), x0: S.x, y0: S.y, phase: 'up' };
        kick();
    });

    /* ------------------------------------------------------------------ while it waits: a hover, and now and then a hop, a wiggle or a turn */
    const fidget = () => {
        window.setTimeout(fidget, 6500 + Math.random() * 6000);
        if (reduce || S.mode !== 'perched' || !menu.hidden || document.hidden) return;
        const r = craft.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) return;
        const move = ['hop', 'wiggle', 'turn'][Math.floor(Math.random() * 3)];
        play(move, move === 'turn' ? 1300 : 800);
        if (move === 'hop') { S.thrust = 0.7; S.thrustTarget = 0; kick(); window.setTimeout(dust, 520); }
    };

    /* ------------------------------------------------------------------ first appearance: it flies in to the portrait */
    const start = () => {
        buddy.hidden = false;
        const first = perches[0];
        S.perch = first;
        const [bx, by] = spot(first);
        if (reduce) { S.x = bx; S.y = by; S.mode = 'perched'; render(); pick(); return; }
        S.x = window.scrollX + window.innerWidth + 40;
        S.y = window.scrollY - 120;
        render();
        flyTo(first);
        window.setTimeout(() => {
            const tip = document.createElement('span');
            tip.className = 'buddy-tip';
            tip.textContent = 'tap me, or drag me';
            buddy.appendChild(tip);
            window.setTimeout(() => tip.remove(), 4200);
        }, 1700);
        window.setTimeout(fidget, 7000);
        window.setTimeout(pick, 1800);
    };

    /* ------------------------------------------------------------------ the inventions notebook */
    const invention = notebook.querySelector('.invention');
    const card = notebook.querySelector('.inv-card');
    const look = notebook.querySelector('.inv-look');
    const invLaunch = notebook.querySelector('.inv-launch');
    let invBusy = false;
    const setInside = (inside) => {
        invention.classList.toggle('is-inside', inside);
        look.textContent = inside ? 'Back to outside' : 'Look inside';
        card.setAttribute('aria-label', inside ? 'Flip back to the outside' : 'Flip to see inside');
    };
    const flip = () => { if (!invBusy) setInside(!invention.classList.contains('is-inside')); };
    card.addEventListener('click', flip);
    look.addEventListener('click', flip);
    invLaunch.addEventListener('click', () => {
        if (invBusy) return;
        const go = () => {
            invBusy = true;
            look.disabled = invLaunch.disabled = true;
            invention.classList.add('is-firing');
            if (!reduce) invention.classList.add('is-launch');
            window.setTimeout(() => {
                invention.classList.remove('is-firing', 'is-launch');
                invBusy = false;
                look.disabled = invLaunch.disabled = false;
            }, reduce ? 900 : 2750);
        };
        if (invention.classList.contains('is-inside')) { setInside(false); window.setTimeout(go, reduce ? 0 : 750); } else go();
    });
    const openNotebook = () => {
        closeMenu();
        setInside(false);
        if (typeof notebook.showModal === 'function') notebook.showModal(); else notebook.setAttribute('open', '');
    };
    document.querySelectorAll('.open-notebook').forEach((b) => b.addEventListener('click', openNotebook));
    notebook.querySelector('.nb-close').addEventListener('click', () => notebook.close());
    notebook.addEventListener('click', (e) => { if (e.target === notebook) notebook.close(); });
    notebook.addEventListener('close', pick);
    document.querySelectorAll('.notebook-cta').forEach((el) => { el.hidden = false; });

    document.addEventListener('visibilitychange', () => { if (document.hidden && S.raf) { window.cancelAnimationFrame(S.raf); S.raf = 0; S.lastT = 0; } else kick(); });
    if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();
