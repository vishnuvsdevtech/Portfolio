/* A bored cat that lives on the card borders.
 *
 * Why vector and not a sprite: a bitmap at 44px looks like clip art at any DPR.
 * Everything here is bezier + gradient + a 1.4px rim light, so it stays crisp
 * and reads as one continuous silhouette.
 *
 * Why it feels alive rather than animated:
 *   - anticipation before every jump, overshoot after every landing
 *   - the tail is a 4-segment verlet chain, so it LAGS the body instead of
 *     swinging on a sine
 *   - blinking is fast-close / slow-open at irregular intervals
 *   - breathing never stops, even asleep
 *   - it is attached to a real element's rect, so it rides the page on scroll
 */
(() => {
  const d = document;
  if (d.getElementById('cat-canvas')) return;

  try {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const canvas = d.createElement('canvas');
    canvas.id = 'cat-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, {
      position: 'fixed', inset: '0', width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: '7',
    });
    d.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    let W = 0, H = 0, dpr = 1;

    /* ------------------------------------------------------------ palette */
    const cssVar = (n, fb) => {
      const v = getComputedStyle(d.documentElement).getPropertyValue(n).trim();
      return v || fb;
    };
    const accentHue = () => {
      const n = parseFloat(cssVar('--accent-h', '145'));
      return Number.isFinite(n) ? n : 145;
    };
    const isLight = () => d.documentElement.getAttribute('data-theme') === 'light';

    let C = { hue: 145, body: '#0c0f0d', rim: '#5fd08a', eye: '#5fd08a' };
    function updatePalette() {
      const h = accentHue(), light = isLight();
      C = {
        hue: h,
        body: light ? '#f4efe4' : '#0b0e0c',
        rim: `hsl(${h}, 70%, ${light ? 42 : 62}%)`,
        eye: `hsl(${h}, 95%, ${light ? 44 : 66}%)`,
      };
    }

    /* ------------------------------------------------------------- perches */
    const PERCH_SEL = '.manifest, .card.work, .scan-card';
    function perches() {
      const out = [];
      for (const el of d.querySelectorAll(PERCH_SEL)) {
        const r = el.getBoundingClientRect();
        if (r.width < 90 || r.top < -80 || r.top > H + 40) continue;
        out.push({ el, x0: r.left + 18, x1: r.right - 18, y: r.top, w: r.width });
      }
      return out;
    }

    /* ----------------------------------------------------------------- cat */
    const TAU = Math.PI * 2;
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    const cat = {
      x: 0, y: 0, perch: null,
      state: 'sit', st: 0,          // st = ms in current state
      facing: 1,
      breath: 0,
      squashX: 1, squashY: 1,
      headShift: 0, headTilt: 0,
      eyeOpen: 1, blinkAt: 2000, blinkT: -1,
      look: { x: 0, y: 0 },
      jump: null,
      idle: 0,
      tail: [],
      dust: [],
      nextJumpAt: 0,      // absolute ms — behaviours must not delay each other
      nextYawnAt: 0,
    };

    function seedTail() {
      cat.tail = [];
      for (let i = 0; i < 5; i++) cat.tail.push({ x: cat.x - 2 - i * 4, y: cat.y - 8 });
    }

    function choosePerch(p, avoid) {
      if (!p.length) return null;
      const options = p.filter((q) => q.el !== (avoid && avoid.el));
      return options.length ? options[Math.floor(Math.random() * options.length)] : p[0];
    }

    function sitOn(p) {
      if (!p) return;
      cat.perch = p;
      cat.x = clamp(cat.x || p.x0 + p.w * 0.3, p.x0, p.x1);
      if (!cat.tail.length) seedTail();
    }

    /* ------------------------------------------------------------- states */
    function startJump() {
      const ps = perches();
      const target = choosePerch(ps, cat.perch);
      if (!target) return;
      const tx = clamp(target.x0 + Math.random() * (target.x1 - target.x0), target.x0, target.x1);
      const dist = Math.hypot(tx - cat.x, target.y - cat.y);
      cat.jump = {
        from: { x: cat.x, y: cat.y },
        to: { x: tx, y: target.y, perch: target },
        t: 0,
        dur: clamp(560 + dist * 0.42, 620, 1150),
        arc: clamp(52 + dist * 0.16, 60, 170),
        dir: Math.sign(tx - cat.x) || 1,
      };
      cat.state = 'crouch';
      cat.st = 0;
      cat.facing = cat.jump.dir;
    }

    function land() {
      cat.squashY = 0.80; cat.squashX = 1.18;
      for (let i = 0; i < 6; i++) {
        cat.dust.push({
          x: cat.x + (Math.random() - 0.5) * 22,
          y: cat.y + 1,
          vx: (Math.random() - 0.5) * 1.6,
          vy: -Math.random() * 0.7,
          life: 1,
          r: 1 + Math.random() * 1.8,
        });
      }
      cat.state = 'sit';
      cat.st = 0;
      if (!cat.nextJumpAt) cat.nextJumpAt = performance.now() + 6000;
      cat.perch = cat.jump.to.perch;
      cat.jump = null;
      cat.nextJumpAt = performance.now() + 8000 + Math.random() * 8000;
    }

    /* --------------------------------------------------------------- step */
    function step(dt, now) {
      const ms = dt * 1000;
      cat.st += ms;
      cat.breath += dt * (cat.state === 'sleep' ? 0.9 : 1.7);

      // squash/stretch springs back toward 1
      cat.squashY += (1 - cat.squashY) * Math.min(1, dt * 9);
      cat.squashX += (1 - cat.squashX) * Math.min(1, dt * 9);

      // follow the perch element (scroll-resilient)
      if (cat.perch) {
        const r = cat.perch.el.getBoundingClientRect();
        cat.perch.y = r.top; cat.perch.x0 = r.left + 18; cat.perch.x1 = r.right - 18;
        if (cat.state !== 'air') cat.y = cat.perch.y;
        cat.x = clamp(cat.x, cat.perch.x0 - 6, cat.perch.x1 + 6);
      }

      const near = pointer.active
        ? Math.hypot(pointer.x - cat.x, pointer.y - (cat.y - 26))
        : 9999;
      if (near < 230) cat.idle = 0; else cat.idle += ms;

      switch (cat.state) {
        case 'sit': {
          if (near < 230) { cat.state = 'look'; cat.st = 0; break; }
          if (cat.idle > 42000) { cat.state = 'sleep'; cat.st = 0; break; }
          if (now > cat.nextJumpAt) { startJump(); break; }
          if (now > cat.nextYawnAt) {
            cat.state = 'yawn'; cat.st = 0;
            cat.nextYawnAt = now + 14000 + Math.random() * 12000;
            break;
          }
          break;
        }
        case 'look': {
          cat.look.x = clamp((pointer.x - cat.x) / 90, -1, 1);
          cat.look.y = clamp((pointer.y - cat.y) / 120, -1, 1);
          cat.headShift += (cat.look.x * 2.2 - cat.headShift) * Math.min(1, dt * 8);
          cat.headTilt += (cat.look.x * 0.12 - cat.headTilt) * Math.min(1, dt * 6);
          cat.facing = cat.look.x >= 0 ? 1 : -1;
          if (near > 260) { cat.state = 'sit'; cat.st = 0; cat.nextJump = 4000; }
          break;
        }
        case 'yawn': {
          if (cat.st > 1300) { cat.state = 'sit'; cat.st = 0; }
          break;
        }
        case 'sleep': {
          if (near < 200) { cat.state = 'look'; cat.st = 0; cat.idle = 0; }
          break;
        }
        case 'crouch': {
          // anticipation: sink, then launch
          const k = Math.min(1, cat.st / 260);
          cat.squashY = 1 - 0.18 * k;
          cat.squashX = 1 + 0.10 * k;
          if (cat.st >= 260) {
            cat.state = 'air'; cat.st = 0;
            cat.squashY = 1.16; cat.squashX = 0.88;
          }
          break;
        }
        case 'air': {
          const p = Math.min(1, cat.st / cat.jump.dur);
          const e = easeInOut(p);
          cat.x = lerp(cat.jump.from.x, cat.jump.to.x, e);
          cat.y = lerp(cat.jump.from.y, cat.jump.to.y, e) - Math.sin(p * Math.PI) * cat.jump.arc;
          cat.squashY = 1 + Math.sin(p * Math.PI) * 0.12;
          cat.squashX = 1 - Math.sin(p * Math.PI) * 0.08;
          if (p >= 1) land();
          break;
        }
      }

      // blink: fast close, slower open, irregular
      if (cat.blinkT >= 0) {
        cat.blinkT += ms;
        const close = 78, open = 150;
        if (cat.blinkT < close) cat.eyeOpen = 1 - cat.blinkT / close;
        else if (cat.blinkT < close + open) cat.eyeOpen = (cat.blinkT - close) / open;
        else { cat.eyeOpen = 1; cat.blinkT = -1; cat.blinkAt = now + 2600 + Math.random() * 4200; }
      } else if (now > cat.blinkAt && cat.state !== 'sleep') {
        cat.blinkT = 0;
      }
      if (cat.state === 'sleep') cat.eyeOpen += (0.06 - cat.eyeOpen) * Math.min(1, dt * 6);

      // tail: verlet chain, lags the body
      const baseX = cat.x - (cat.state === 'air' ? 4 : 7), baseY = cat.y - 9;
      cat.tail[0].x = baseX; cat.tail[0].y = baseY;
      const sway = Math.sin(cat.breath * 1.15) * (cat.state === 'sleep' ? 1.2 : 3.0);
      for (let i = 1; i < cat.tail.length; i++) {
        const prev = cat.tail[i - 1], node = cat.tail[i];
        const targetX = prev.x - 5.5 - sway * (i / cat.tail.length);
        const targetY = prev.y - (cat.state === 'air' ? 3.5 : 2.2) + (cat.state === 'sleep' ? 1.6 : 0);
        node.x += (targetX - node.x) * Math.min(1, dt * 6);
        node.y += (targetY - node.y) * Math.min(1, dt * 6);
      }

      // dust
      for (let i = cat.dust.length - 1; i >= 0; i--) {
        const p = cat.dust[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.02; p.life -= dt * 1.1;
        if (p.life <= 0) cat.dust.splice(i, 1);
      }
    }

    /* --------------------------------------------------------------- draw */
    function drawCat() {
      const light = isLight();
      const t = cat.breath;
      const breathe = 1 + Math.sin(t) * 0.014;
      const S = 1.5;                       // readable at a glance, still unobtrusive
      const sy = cat.squashY * breathe;
      const sx = cat.squashX / breathe;

      ctx.save();
      ctx.translate(cat.x, cat.y);
      ctx.scale(cat.facing * sx * S, sy * S);

      const rim = C.rim, body = C.body;
      const glowA = light ? 0.07 : 0.16;

      // ambient halo: sells "it is lit, not drawn"
      const halo = ctx.createRadialGradient(0, -22, 3, 0, -22, 34);
      halo.addColorStop(0, `hsla(${C.hue}, 90%, ${light ? 45 : 65}%, ${glowA})`);
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(0, -22, 34, 0, TAU); ctx.fill();

      // contact shadow on the border line
      ctx.fillStyle = light ? 'rgba(30,28,24,.16)' : 'rgba(0,0,0,.4)';
      ctx.beginPath(); ctx.ellipse(0, 1.5, 15, 2.8, 0, 0, TAU); ctx.fill();

      // ---- tail (behind everything)
      ctx.strokeStyle = rim;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.9;
      for (let i = 1; i < cat.tail.length; i++) {
        const a = cat.tail[i - 1], b = cat.tail[i];
        ctx.lineWidth = 3.4 - i * 0.45;
        ctx.beginPath();
        ctx.moveTo(a.x - cat.x, a.y - cat.y);
        ctx.lineTo(b.x - cat.x, b.y - cat.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // ---- body: chibi silhouette, head-heavy
      // The silhouette needs its own value, not the page background — otherwise
      // a dark-theme cat is just an outline floating on darkness.
      const bg = ctx.createLinearGradient(0, -30, 0, 0);
      bg.addColorStop(0, light ? '#ffffff' : `hsl(${C.hue}, 26%, 17%)`);
      bg.addColorStop(1, light ? '#eae4d6' : `hsl(${C.hue}, 30%, 10%)`);

      ctx.beginPath();
      ctx.moveTo(-11.5, 0);
      ctx.bezierCurveTo(-13.5, -9, -12, -18, -6.5, -21.5);
      ctx.bezierCurveTo(-2.5, -24, 3, -24, 7, -21.5);
      ctx.bezierCurveTo(12.5, -18, 14, -9, 12, 0);
      ctx.closePath();
      ctx.fillStyle = bg; ctx.fill();
      ctx.strokeStyle = rim; ctx.lineWidth = 1.5; ctx.stroke();

      // front paws
      for (const lx of [-6.6, 5.4]) {
        ctx.beginPath();
        ctx.roundRect(lx - 2.3, -10, 4.6, 10, 2.3);
        ctx.fillStyle = bg; ctx.fill();
        ctx.strokeStyle = rim; ctx.lineWidth = 1.2; ctx.stroke();
        // toe line
        ctx.beginPath();
        ctx.moveTo(lx - 1.1, -2.2); ctx.lineTo(lx + 1.1, -2.2);
        ctx.strokeStyle = `hsla(${C.hue}, 60%, 70%, .45)`; ctx.lineWidth = 0.7; ctx.stroke();
      }

      // ---- head
      const hx = cat.headShift;
      ctx.save();
      ctx.translate(hx, -30.5);
      ctx.rotate(cat.headTilt * 0.5);

      // ears
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sgn * 7.6, -7.4);
        ctx.quadraticCurveTo(sgn * 9.0, -15.4, sgn * 10.2, -14.6);
        ctx.quadraticCurveTo(sgn * 11.0, -9.4, sgn * 9.4, -5.6);
        ctx.closePath();
        ctx.fillStyle = bg; ctx.fill();
        ctx.strokeStyle = rim; ctx.lineWidth = 1.3; ctx.stroke();
        // inner ear
        ctx.beginPath();
        ctx.moveTo(sgn * 8.2, -7.8);
        ctx.lineTo(sgn * 9.2, -12.6);
        ctx.lineTo(sgn * 6.0, -8.6);
        ctx.closePath();
        ctx.fillStyle = `hsla(${C.hue}, 90%, ${light ? 56 : 72}%, .5)`;
        ctx.fill();
      }

      // head
      const hg = ctx.createRadialGradient(-2, -9, 2, 0, -4, 15);
      hg.addColorStop(0, light ? '#ffffff' : `hsl(${C.hue}, 26%, 21%)`);
      hg.addColorStop(1, light ? '#eae4d6' : `hsl(${C.hue}, 30%, 12%)`);
      ctx.beginPath();
      ctx.ellipse(0, -4, 11.6, 10, 0, 0, TAU);
      ctx.fillStyle = hg; ctx.fill();
      ctx.strokeStyle = rim; ctx.lineWidth = 1.5; ctx.stroke();

      // cheek blush
      for (const sgn of [-1, 1]) {
        const bl = ctx.createRadialGradient(sgn * 7.4, 0.4, 0.4, sgn * 7.4, 0.4, 4.2);
        bl.addColorStop(0, `hsla(${C.hue + 20}, 90%, 65%, ${light ? 0.22 : 0.3})`);
        bl.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bl;
        ctx.beginPath(); ctx.arc(sgn * 7.4, 0.4, 4.2, 0, TAU); ctx.fill();
      }

      // ---- eyes: big, two-tone iris, one highlight
      const open = cat.state === 'sleep' ? 0.05 : cat.eyeOpen;
      for (const sgn of [-1, 1]) {
        const ex = sgn * 4.4, ry = 3.9 * open + 0.3, rx = 3.0;
        ctx.save();
        ctx.translate(ex, -4.6);
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
        ctx.fillStyle = light ? '#fffdf7' : '#04100a';
        ctx.fill();
        if (open > 0.2) {
          ctx.beginPath();
          ctx.ellipse(cat.look.x * 1.0, cat.look.y * 0.9, 2.0, 2.7 * open, 0, 0, TAU);
          ctx.fillStyle = C.eye;
          ctx.shadowColor = C.eye; ctx.shadowBlur = 7;
          ctx.fill();
          ctx.shadowBlur = 0;
          // darker pupil inside the iris
          ctx.beginPath();
          ctx.ellipse(cat.look.x * 1.0, cat.look.y * 0.9, 0.9, 1.7 * open, 0, 0, TAU);
          ctx.fillStyle = light ? `hsl(${C.hue}, 70%, 30%)` : '#04100a';
          ctx.fill();
          // highlight
          ctx.beginPath();
          ctx.arc(-0.8, -1.4, 0.85, 0, TAU);
          ctx.fillStyle = 'rgba(255,255,255,.92)';
          ctx.fill();
        }
        ctx.restore();
      }

      // nose
      ctx.beginPath();
      ctx.moveTo(0, 1.1); ctx.lineTo(-1.3, 2.6); ctx.lineTo(1.3, 2.6);
      ctx.closePath();
      ctx.fillStyle = `hsl(${C.hue + 15}, 80%, ${light ? 48 : 66}%)`;
      ctx.fill();

      // mouth: small cat omega, unless yawning
      if (cat.state !== 'yawn') {
        ctx.strokeStyle = `hsla(${C.hue}, 50%, ${light ? 40 : 80}%, .75)`;
        ctx.lineWidth = 0.8; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 2.8);
        ctx.quadraticCurveTo(-1.5, 4.6, -2.8, 3.1);
        ctx.moveTo(0, 2.8);
        ctx.quadraticCurveTo(1.5, 4.6, 2.8, 3.1);
        ctx.stroke();
      }

      // whiskers: two per side, faint
      ctx.strokeStyle = `hsla(${C.hue}, 55%, ${light ? 45 : 75}%, .35)`;
      ctx.lineWidth = 0.65;
      for (const sgn of [-1, 1]) {
        for (let i = 0; i < 2; i++) {
          ctx.beginPath();
          ctx.moveTo(sgn * 4.6, 1.6 + i * 1.1);
          ctx.quadraticCurveTo(sgn * 9.4, 1.1 + i * 2.0, sgn * 13.2, 0.4 + i * 2.6);
          ctx.stroke();
        }
      }

      if (cat.state === 'yawn') {
        const k = Math.sin(Math.min(1, cat.st / 1300) * Math.PI);
        ctx.beginPath();
        ctx.ellipse(0, 5.0, 2.3 + k * 1.2, 1.3 + k * 2.9, 0, 0, TAU);
        ctx.fillStyle = light ? '#3a352c' : '#04120b';
        ctx.fill();
        ctx.strokeStyle = rim; ctx.lineWidth = 1; ctx.stroke();
      }

      // collar pip
      ctx.beginPath();
      ctx.arc(0, -14.8, 1.6, 0, TAU);
      ctx.fillStyle = C.eye;
      ctx.shadowColor = C.eye; ctx.shadowBlur = 9; ctx.fill();
      ctx.shadowBlur = 0;

      ctx.restore();   // head
      ctx.restore();   // cat

      // dust motes
      ctx.globalCompositeOperation = 'lighter';
      for (const p of cat.dust) {
        ctx.fillStyle = `hsla(${C.hue}, 90%, 70%, ${0.4 * p.life})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    /* --------------------------------------------------------------- loop */
    const pointer = { x: -999, y: -999, active: false };
    addEventListener('pointermove', (e) => {
      pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true;
    }, { passive: true });

    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = innerWidth; H = innerHeight;
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduce.matches) drawStatic();
    }

    let running = false, raf = 0, last = 0;

    function frame(now) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      step(dt, now);
      ctx.clearRect(0, 0, W, H);
      drawCat();
      raf = requestAnimationFrame(frame);
    }

    function drawStatic() {
      ctx.clearRect(0, 0, W, H);
      if (!cat.perch) sitOn(choosePerch(perches(), null));
      drawCat();
    }

    function start() {
      if (running || reduce.matches) return;
      running = true; last = performance.now();
      raf = requestAnimationFrame(frame);
    }
    function stop() { running = false; cancelAnimationFrame(raf); }

    resize();
    addEventListener('resize', resize, { passive: true });
    updatePalette();
    sitOn(choosePerch(perches(), null));
    cat.nextJumpAt = performance.now() + 6500 + Math.random() * 4000;
    cat.nextYawnAt = performance.now() + 9000 + Math.random() * 6000;
    drawStatic();           // never depend on the first rAF tick

    if (!reduce.matches) start();
    reduce.addEventListener('change', () => {
      if (reduce.matches) { stop(); drawStatic(); } else start();
    });
    d.addEventListener('visibilitychange', () => {
      if (d.hidden) stop(); else if (!reduce.matches) start();
    });
    addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('#themeBtn, .swatch')) {
        setTimeout(() => { updatePalette(); if (reduce.matches) drawStatic(); }, 60);
      }
    }, { passive: true });
  } catch (err) {
    // never let a decorative layer break the page — but make it visible
    console.error('[cat] failed to start:', err);
  }
})();
