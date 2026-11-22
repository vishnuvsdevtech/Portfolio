/* =========================================================
   Live pieces: agent workflow, 3D floor map, edit timeline,
   and the build previews. Everything follows the accent and
   light/dark theme, and only animates while it is on screen.
   ========================================================= */
(() => {
  'use strict';
  const d = document, root = d.documentElement;
  const $ = (s, c = d) => c.querySelector(s);
  const $$ = (s, c = d) => Array.from(c.querySelectorAll(s));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const easeIO = (x) => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const MONO = (px, wt = 500) => `${wt} ${px}px "Geist Mono", ui-monospace, monospace`;

  /* ---------- theme colours ---------- */
  const C = {};
  const toHex = (() => {
    const c = d.createElement('canvas').getContext('2d');
    return (v) => { c.fillStyle = '#000'; c.fillStyle = v; return c.fillStyle; };
  })();
  const themeFns = [];
  function readColors() {
    const cs = getComputedStyle(root);
    ['bg', 'bg-2', 'card', 'card-2', 'ink', 'ink-2', 'muted', 'accent', 'accent-ink'].forEach(k => { C[k] = toHex(cs.getPropertyValue('--' + k).trim()); });
  }
  function rgba(hex, a) {
    if (!hex || hex[0] !== '#') return hex;
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
  }
  readColors();
  new MutationObserver(() => { readColors(); themeFns.forEach(f => f()); })
    .observe(root, { attributes: true, attributeFilter: ['data-accent', 'data-theme'] });

  /* ---------- helpers ---------- */
  // run frame(t, dt) only while el is on screen (and the tab is visible)
  function animate(el, frame, opts = {}) {
    let vis = false, running = false, last = 0, enabled = opts.enabled ? opts.enabled() : true;
    const loop = (now) => {
      if (!vis || d.hidden || !enabled) { running = false; return; }
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      frame(now / 1000, dt);
      requestAnimationFrame(loop);
    };
    const start = () => {
      enabled = opts.enabled ? opts.enabled() : true;
      if (running || !vis || !enabled) return;
      if (reduce) { frame(opts.still || 3, 0.016); return; }
      running = true; last = performance.now(); requestAnimationFrame(loop);
    };
    new IntersectionObserver(([e]) => { vis = e.isIntersecting; start(); }, { rootMargin: '80px 0px' }).observe(el);
    d.addEventListener('visibilitychange', start);
    return { start, draw: () => frame(reduce ? (opts.still || 3) : performance.now() / 1000, 0.016) };
  }
  // keep a canvas backing store matched to its CSS size
  function fit(cv, onResize) {
    const st = { w: 0, h: 0, ctx: cv.getContext('2d') };
    new ResizeObserver(([e]) => {
      const r = e.contentRect;
      st.w = r.width; st.h = r.height;
      cv.width = Math.max(1, Math.round(r.width * DPR)); cv.height = Math.max(1, Math.round(r.height * DPR));
      onResize && onResize(st);
    }).observe(cv);
    return st;
  }
  function begin(st) {
    const { ctx } = st;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    return ctx;
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  }
  function corners(ctx, x, y, w, h, len, col, lw) {
    const l = Math.min(len, w / 2, h / 2);
    ctx.strokeStyle = col; ctx.lineWidth = lw || 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y + l); ctx.lineTo(x, y); ctx.lineTo(x + l, y);
    ctx.moveTo(x + w - l, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + l);
    ctx.moveTo(x + w, y + h - l); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - l, y + h);
    ctx.moveTo(x + l, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - l);
    ctx.stroke();
  }
  function chip(ctx, x, y, text, bg, fg, px = 9.5) {
    ctx.font = MONO(px);
    const tw = ctx.measureText(text).width + 10;
    ctx.fillStyle = bg; ctx.fillRect(x, y - 14, tw, 14);
    ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(text, x + 5, y - 6.5);
    return tw;
  }

  /* =========================================================
     1. Agent workflow — request → gateway → agent ⇄ model/tools → reply
     ========================================================= */
  function agentFlow() {
    const shell = $('#agentShell'); if (!shell) return;
    const stage = $('#agentStage'), svg = $('#agentWires'), logEl = $('#agentLog');
    const clockEl = $('#agentClock'), stateEl = $('#agentState'), bar = $('#agentBar');
    const tabs = $$('.agent-tab', shell);
    const NS = 'http://www.w3.org/2000/svg';
    const nodes = Object.fromEntries($$('.anode', stage).map(n => [n.dataset.node, n]));

    const LAYOUT = {
      wide: { you: [14, 22], gate: [15, 62], tts: [36, 88], agent: [50, 47], model: [50, 10], stt: [78, 10], search: [86, 32], browser: [86, 56], github: [84, 80], skills: [61, 89] },
      tall: { you: [19, 7], gate: [50, 7], tts: [81, 7], stt: [25, 28], model: [77, 28], agent: [50, 48], search: [22, 68], browser: [78, 68], skills: [27, 90], github: [73, 90] },
    };
    const EDGES = [['you', 'gate'], ['gate', 'agent'], ['agent', 'model'], ['agent', 'stt'], ['agent', 'search'], ['agent', 'browser'], ['agent', 'github'], ['agent', 'skills'], ['agent', 'tts'], ['tts', 'gate']];
    // [from, to, packet label, trace line, simulated seconds]
    const SCN = [
      [
        ['you', 'gate', 'voice 0:14', ['telegram', 'voice note received · 0:14'], 0.2],
        ['gate', 'agent', 'update', ['gateway', 'sender on allow-list · forward'], 0.1],
        ['agent', 'stt', 'audio.ogg', ['tool', 'faster-whisper · transcribe locally'], 0.3],
        ['stt', 'agent', 'transcript', ['stt', '“research how NVRs offload footage”'], 1.2],
        ['agent', 'model', 'plan?', ['deepseek', 'plan: search → brief → speak'], 0.4],
        ['model', 'agent', '3 steps', null, 1.1],
        ['agent', 'search', 'query ×3', ['tool', 'exa.search × 3'], 0.2],
        ['search', 'agent', '12 hits', ['exa', '12 results · 3 kept'], 2.0],
        ['agent', 'skills', 'pitch-research', ['skill', 'project-pitch-research'], 0.2],
        ['skills', 'agent', 'brief.md', ['skill', 'brief.md · 410 words'], 3.1],
        ['agent', 'tts', 'summary', ['tool', 'edge-tts · 38 s voice reply'], 0.3],
        ['tts', 'gate', 'voice.mp3', null, 0.8],
        ['gate', 'you', 'brief + voice', ['telegram', 'reply sent · brief.md + voice'], 0.2],
      ],
      [
        ['you', 'gate', '“review site”', ['telegram', '“review my portfolio”'], 0.2],
        ['gate', 'agent', 'update', ['gateway', 'sender on allow-list · forward'], 0.1],
        ['agent', 'skills', 'portfolio-review', ['skill', 'portfolio-review · checklist loaded'], 0.2],
        ['agent', 'browser', 'open site', ['tool', 'browser · open the live site'], 0.4],
        ['browser', 'agent', 'pages', ['browser', '6 sections read · 2 issues'], 2.6],
        ['agent', 'model', 'fix plan?', ['deepseek', 'draft fixes for 2 issues'], 0.3],
        ['model', 'agent', 'patch', null, 2.2],
        ['agent', 'github', 'branch', ['tool', 'github · branch, commit, push'], 0.6],
        ['github', 'agent', 'PR open', ['github', 'pull request opened'], 1.0],
        ['agent', 'gate', 'link', null, 0.1],
        ['gate', 'you', 'PR ready', ['telegram', '“PR ready for review”'], 0.2],
      ],
      [
        ['you', 'gate', '/usage', ['telegram', '/usage'], 0.2],
        ['gate', 'agent', 'update', ['gateway', 'sender on allow-list · forward'], 0.1],
        ['agent', 'skills', 'usage-report', ['skill', 'api-usage-report'], 0.2],
        ['agent', 'model', 'balance?', ['tool', 'deepseek api · balance + usage'], 0.3],
        ['model', 'agent', 'usage.json', ['deepseek', 'tokens this week · balance left'], 0.6],
        ['agent', 'gate', 'report', ['report', 'on demand only · no cron'], 0.2],
        ['gate', 'you', 'report', ['telegram', 'usage report sent'], 0.1],
      ],
    ];

    // build svg: one path per edge, a trail copy, and the packet
    const edges = {};
    EDGES.forEach(([a, b]) => {
      const base = d.createElementNS(NS, 'path'); base.setAttribute('class', 'aw');
      const glow = d.createElementNS(NS, 'path'); glow.setAttribute('class', 'aw-on');
      svg.append(base, glow);
      edges[a + '>' + b] = { a, b, base, glow };
    });
    const pk = d.createElementNS(NS, 'g'); pk.setAttribute('class', 'apk');
    const pkHalo = d.createElementNS(NS, 'circle'); pkHalo.setAttribute('r', '9'); pkHalo.setAttribute('class', 'apk-halo');
    const pkDot = d.createElementNS(NS, 'circle'); pkDot.setAttribute('r', '4'); pkDot.setAttribute('class', 'apk-dot');
    const pkTag = d.createElementNS(NS, 'g'); pkTag.setAttribute('class', 'apk-tag');
    const pkRect = d.createElementNS(NS, 'rect'); pkRect.setAttribute('rx', '3'); pkRect.setAttribute('height', '17');
    const pkText = d.createElementNS(NS, 'text'); pkText.setAttribute('y', '12');
    pkTag.append(pkRect, pkText); pk.append(pkHalo, pkDot, pkTag);
    const pkSvg = d.createElementNS(NS, 'svg'); pkSvg.setAttribute('class', 'agent-pk'); pkSvg.append(pk); stage.append(pkSvg);

    const edgeOf = (a, b) => edges[a + '>' + b] ? { e: edges[a + '>' + b], rev: false } : { e: edges[b + '>' + a], rev: true };
    let centers = {};
    function layout() {
      const W = stage.clientWidth, H = stage.clientHeight;
      const L = W < 640 ? LAYOUT.tall : LAYOUT.wide;
      stage.classList.toggle('is-tall', W < 640);
      Object.entries(L).forEach(([k, [x, y]]) => {
        nodes[k].style.left = x + '%'; nodes[k].style.top = y + '%';
        centers[k] = [x / 100 * W, y / 100 * H];
      });
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`); pkSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      Object.values(edges).forEach(({ a, b, base, glow }) => {
        const [x1, y1] = centers[a], [x2, y2] = centers[b];
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1;
        const k = 0.14; // gentle bow, perpendicular to the edge
        const cx = mx - dy * k, cy = my + dx * k;
        const dd = `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
        base.setAttribute('d', dd); glow.setAttribute('d', dd);
        glow.style.setProperty('--len', glow.getTotalLength().toFixed(1));
      });
    }
    new ResizeObserver(layout).observe(stage);
    layout();

    // scenario timeline
    const STEP = 0.95, HOLD = 2.6;
    let scn = 0, stepIdx = -1, stepT = 0, simClock = 0, holdT = 0, manualAt = 0;
    const totalSteps = () => SCN[scn].length;
    function clear() {
      Object.values(edges).forEach(e => e.glow.classList.remove('is-on', 'is-trail'));
      Object.values(nodes).forEach(n => n.classList.remove('is-hot', 'is-used'));
      logEl.innerHTML = ''; simClock = 0; stepIdx = -1; stepT = 0; holdT = 0;
      pk.style.opacity = 0; nodes.agent.classList.remove('is-think');
    }
    function setScn(i, manual) {
      scn = (i + SCN.length) % SCN.length; clear();
      tabs.forEach((t, j) => { t.classList.toggle('is-on', j === scn); t.setAttribute('aria-selected', String(j === scn)); });
      if (manual) manualAt = performance.now();
      stateEl.textContent = 'listening';
    }
    function fmt(sec) { const m = Math.floor(sec / 60), s = sec - m * 60; return String(m).padStart(2, '0') + ':' + s.toFixed(1).padStart(4, '0'); }
    function enterStep(i) {
      const [a, b, label, line, sim] = SCN[scn][i];
      simClock += sim;
      const { e } = edgeOf(a, b);
      Object.values(edges).forEach(x => { if (x.glow.classList.contains('is-on')) { x.glow.classList.remove('is-on'); x.glow.classList.add('is-trail'); } });
      e.glow.classList.remove('is-trail'); e.glow.classList.add('is-on');
      Object.values(nodes).forEach(n => n.classList.remove('is-hot'));
      nodes[a].classList.add('is-hot', 'is-used'); nodes[b].classList.add('is-hot', 'is-used');
      nodes.agent.classList.toggle('is-think', a === 'model' || b === 'model');
      pkText.textContent = label;
      const tw = pkText.getComputedTextLength ? pkText.getComputedTextLength() : label.length * 6;
      pkRect.setAttribute('width', (tw + 12).toFixed(0)); pkRect.setAttribute('x', '-6'); pkText.setAttribute('x', '0');
      pk.style.opacity = 1;
      if (line) {
        const li = d.createElement('li');
        li.innerHTML = `<span class="lt">${fmt(simClock)}</span><span class="lk">${line[0]}</span><span class="lv"></span>`;
        li.querySelector('.lv').textContent = line[1];
        logEl.append(li);
        while (logEl.children.length > 9) logEl.firstElementChild.remove();
        requestAnimationFrame(() => li.classList.add('in'));
      }
      clockEl.textContent = fmt(simClock);
      stateEl.textContent = b === 'you' ? 'replied' : (a === 'agent' || b === 'agent') ? (b === 'model' || a === 'model' ? 'thinking' : 'calling tools') : 'routing';
    }
    function placePacket(i, k) {
      const [a, b] = SCN[scn][i];
      const { e, rev } = edgeOf(a, b);
      const L = e.glow.getTotalLength();
      const p = e.glow.getPointAtLength((rev ? 1 - k : k) * L);
      pk.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
      pkTag.setAttribute('transform', `translate(10 -26)`);
      pkTag.style.opacity = clamp(Math.min(k, 1 - k) * 7, 0, 1).toFixed(2);
    }
    function finish() {
      Object.values(edges).forEach(x => { if (x.glow.classList.contains('is-on')) { x.glow.classList.remove('is-on'); x.glow.classList.add('is-trail'); } });
      Object.values(nodes).forEach(n => n.classList.remove('is-hot'));
      nodes.you.classList.add('is-hot'); nodes.agent.classList.remove('is-think');
      pk.style.opacity = 0;
    }
    function frame(t, dt) {
      if (stepIdx >= totalSteps()) {
        holdT += dt;
        bar.style.transform = 'scaleX(1)';
        if (holdT > HOLD) setScn(scn + 1);
        return;
      }
      if (stepIdx < 0) { stepIdx = 0; stepT = 0; enterStep(0); }
      stepT += dt;
      const k = easeIO(clamp(stepT / STEP, 0, 1));
      placePacket(stepIdx, k);
      bar.style.transform = `scaleX(${((stepIdx + k) / totalSteps()).toFixed(3)})`;
      if (stepT >= STEP + 0.12) {
        stepIdx++; stepT = 0;
        if (stepIdx < totalSteps()) enterStep(stepIdx); else finish();
      }
    }
    function still() {
      // reduced motion: show the whole run at once
      clear();
      SCN[scn].forEach((_, i) => enterStep(i));
      finish(); bar.style.transform = 'scaleX(1)';
    }
    tabs.forEach((t, i) => t.addEventListener('click', () => { setScn(i, true); if (reduce) still(); }));
    tabs.forEach((t, i) => t.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault(); const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[n].focus(); tabs[n].click();
    }));
    setScn(0);
    if (reduce) { still(); return; }
    animate(shell, frame);
  }

  /* =========================================================
     2. 3D floor map — orbit, pan, zoom; people walk between rooms,
        anyone inside a camera's coverage gets boxed.
     ========================================================= */
  function floorMap() {
    const host = $('#map3d'); if (!host) return;
    const cv = $('#map3dCanvas'), hint = $('#mapHint'), countEl = $('#mapCount'), viewEl = $('#mapView');
    const st = fit(cv, () => api && api.draw());
    const W = 40, D = 26, WALL = 2.7;

    // walls as [x1, z1, x2, z2]; gaps are doorways
    const WALLS = [
      [0, 0, 4, 0], [8, 0, 40, 0], [40, 0, 40, 26], [40, 26, 0, 26], [0, 26, 0, 0],
      [14, 0, 14, 4], [14, 7, 14, 12],
      [0, 12, 5, 12], [8, 12, 20, 12], [23, 12, 32, 12], [35, 12, 40, 12],
      [26, 12, 26, 17], [26, 20, 26, 26],
    ];
    const ROOMS = [
      { name: 'LOBBY', x0: 0, z0: 0, x1: 14, z1: 12 },
      { name: 'LAB', x0: 14, z0: 0, x1: 40, z1: 12 },
      { name: 'DESKS', x0: 0, z0: 12, x1: 26, z1: 26 },
      { name: 'SERVER', x0: 26, z0: 12, x1: 40, z1: 26 },
    ];
    const roomAt = (x, z) => ROOMS.findIndex(r => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
    const CAMS = [
      { id: 'CAM_01', x: 0.6, z: 0.6, dir: Math.PI / 4, room: 0 },
      { id: 'CAM_02', x: 39.4, z: 0.6, dir: Math.PI * 3 / 4, room: 1 },
      { id: 'CAM_03', x: 0.6, z: 25.4, dir: -Math.PI / 4, room: 2 },
      { id: 'CAM_04', x: 39.4, z: 25.4, dir: -Math.PI * 3 / 4, room: 3 },
    ];
    const FOV = 1.15, RANGE = 15, CAM_H = 2.5;
    // coverage fan clipped to the camera's room
    CAMS.forEach(c => {
      const r = ROOMS[c.room], pts = [[c.x, c.z]];
      for (let i = 0; i <= 16; i++) {
        const a = c.dir - FOV / 2 + FOV * i / 16, dx = Math.cos(a), dz = Math.sin(a);
        let t = RANGE;
        if (dx > 1e-6) t = Math.min(t, (r.x1 - c.x) / dx); if (dx < -1e-6) t = Math.min(t, (r.x0 - c.x) / dx);
        if (dz > 1e-6) t = Math.min(t, (r.z1 - c.z) / dz); if (dz < -1e-6) t = Math.min(t, (r.z0 - c.z) / dz);
        pts.push([c.x + dx * t, c.z + dz * t]);
      }
      c.fan = pts;
    });
    const sees = (c, x, z) => {
      if (roomAt(x, z) !== c.room) return false;
      const dx = x - c.x, dz = z - c.z, dist = Math.hypot(dx, dz);
      if (dist > RANGE) return false;
      let da = Math.atan2(dz, dx) - c.dir; da = Math.atan2(Math.sin(da), Math.cos(da));
      return Math.abs(da) < FOV / 2;
    };

    // walkable graph: points inside rooms plus doorway centres
    const WP = {
      L1: [7, 6], L2: [3, 9.5], L3: [10.5, 3], E: [6, 1.2],
      B1: [27, 6], B2: [35, 3.5], B3: [19, 8.5], B4: [33, 9.5],
      D1: [13, 19], D2: [5, 22.5], D3: [20, 23], D4: [9, 15.5],
      S1: [33, 19], S2: [37, 23.5], S3: [30, 15],
      dLB: [14, 5.5], dLD: [6.5, 12], dBD: [21.5, 12], dBS: [33.5, 12], dDS: [26, 18.5],
    };
    const LINKS = {
      L1: ['L2', 'L3', 'E', 'dLB', 'dLD'], L2: ['L1', 'dLD', 'L3'], L3: ['L1', 'E', 'dLB', 'L2'], E: ['L1', 'L3'],
      B1: ['B2', 'B3', 'B4', 'dLB', 'dBD', 'dBS'], B2: ['B1', 'B4', 'dBS'], B3: ['B1', 'dLB', 'dBD'], B4: ['B1', 'B2', 'dBS'],
      D1: ['D2', 'D3', 'D4', 'dLD', 'dBD', 'dDS'], D2: ['D1', 'D4', 'dLD'], D3: ['D1', 'dDS', 'dBD'], D4: ['D1', 'D2', 'dLD'],
      S1: ['S2', 'S3', 'dBS', 'dDS'], S2: ['S1', 'S3'], S3: ['S1', 'S2', 'dBS', 'dDS'],
      dLB: ['L1', 'L3', 'B1', 'B3'], dLD: ['L1', 'L2', 'D1', 'D2', 'D4'], dBD: ['B1', 'B3', 'D1', 'D3'], dBS: ['B1', 'B2', 'B4', 'S1', 'S3'], dDS: ['D1', 'D3', 'S1', 'S3'],
    };
    const starts = ['L1', 'B1', 'B2', 'D1', 'D3', 'S1', 'L2', 'B4', 'D2'];
    const people = starts.map((k, i) => {
      const [x, z] = WP[k];
      return { id: i + 1, x, z, at: k, to: k, off: [(rnd(i) - .5) * 1.4, (rnd(i + 5) - .5) * 1.4], sp: 1.05 + rnd(i + 2) * 0.5, wait: rnd(i + 8) * 2, phase: rnd(i) * 6, trail: [], tick: 0 };
    });
    function stepPeople(dt) {
      for (const p of people) {
        if (p.wait > 0) { p.wait -= dt; continue; }
        if (p.at === p.to) {
          const opts = LINKS[p.at];
          p.to = opts[Math.floor(Math.random() * opts.length)];
        }
        const isDoor = p.to[0] === 'd';
        const [tx, tz] = WP[p.to], ox = isDoor ? 0 : p.off[0], oz = isDoor ? 0 : p.off[1];
        const dx = tx + ox - p.x, dz = tz + oz - p.z, dist = Math.hypot(dx, dz);
        if (dist < 0.15) { p.at = p.to; if (!isDoor && Math.random() < 0.35) p.wait = 0.6 + Math.random() * 2.2; continue; }
        const v = Math.min(dist, p.sp * dt);
        p.x += dx / dist * v; p.z += dz / dist * v; p.phase += dt * 7.5;
        p.tick += dt;
        if (p.tick > 0.18) { p.tick = 0; p.trail.push([p.x, p.z]); if (p.trail.length > 26) p.trail.shift(); }
      }
    }

    // camera rig: goal values eased into the live ones
    const HOME = { yaw: -0.62, pitch: 0.74, dist: 41, tx: W / 2, tz: D / 2 };
    const cam = { ...HOME }, goal = { ...HOME };
    let lastInput = -1e9, mode = 'persp';
    const LIM = { pitch: [0.22, 1.5], dist: [18, 95] };
    const setMode = (m) => {
      mode = m;
      $$('.map-ctl [data-view="persp"], .map-ctl [data-view="top"]', host).forEach(b => {
        const on = b.dataset.view === m; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on));
      });
      viewEl.textContent = m === 'top' ? 'plan view' : 'orbit 3D';
    };

    function proj() {
      const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
      const ex = cam.tx + cam.dist * cp * sy, ey = cam.dist * sp, ez = cam.tz + cam.dist * cp * cy;
      // forward, right, up
      let fx = cam.tx - ex, fy = -ey, fz = cam.tz - ez; const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
      let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl; // cross(f, up)
      const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy; // cross(r, f)
      const focal = (Math.min(st.h, st.w * 0.72) / 2) / Math.tan(0.42), cx = st.w / 2, cyy = st.h / 2 + st.h * 0.03;
      return (x, y, z) => {
        const qx = x - ex, qy = y - ey, qz = z - ez;
        const zc = qx * fx + qy * fy + qz * fz;
        const xc = qx * rx + qz * rz;
        const yc = qx * ux + qy * uy + qz * uz;
        return [cx + xc / zc * focal, cyy - yc / zc * focal, zc];
      };
    }
    const poly = (ctx, pts) => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); };

    function render(t) {
      const ctx = begin(st); if (!st.w) return;
      const P = proj();
      const inkA = (a) => rgba(C.ink, a), acA = (a) => rgba(C.accent, a);

      // floor slab + grid
      const slab = [[0, 0], [W, 0], [W, D], [0, D]].map(([x, z]) => P(x, 0, z));
      poly(ctx, slab); ctx.fillStyle = inkA(0.035); ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = inkA(0.06); ctx.beginPath();
      for (let x = 2; x < W; x += 2) { const a = P(x, 0, 0), b = P(x, 0, D); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      for (let z = 2; z < D; z += 2) { const a = P(0, 0, z), b = P(W, 0, z); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      ctx.stroke();

      // coverage fans
      CAMS.forEach(c => {
        const pts = c.fan.map(([x, z]) => P(x, 0.01, z));
        poly(ctx, pts); ctx.fillStyle = acA(0.07); ctx.fill();
        ctx.strokeStyle = acA(0.28); ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]);
      });

      // room labels on the floor
      ctx.font = MONO(10); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ROOMS.forEach(r => {
        const [x, y, zc] = P((r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2 + (r.z1 - r.z0) * 0.3);
        if (zc > 0) { ctx.fillStyle = inkA(0.4); ctx.fillText(r.name, x, y); }
      });

      // trails + shadows
      for (const p of people) {
        if (p.trail.length > 1) {
          ctx.beginPath();
          p.trail.forEach(([x, z], i) => { const q = P(x, 0.02, z); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
          const q = P(p.x, 0.02, p.z); ctx.lineTo(q[0], q[1]);
          ctx.strokeStyle = acA(0.22); ctx.lineWidth = 1.2; ctx.stroke();
        }
        const s = P(p.x, 0, p.z), s2 = P(p.x + 0.35, 0, p.z);
        const rx = Math.max(2, Math.abs(s2[0] - s[0]));
        ctx.fillStyle = inkA(0.14); ctx.beginPath(); ctx.ellipse(s[0], s[1], rx, rx * 0.45 + 0.6, 0, 0, 7); ctx.fill();
      }

      // depth-sorted items: walls, cameras, people
      const items = [];
      WALLS.forEach(([x1, z1, x2, z2]) => {
        const a = P(x1, 0, z1), b = P(x2, 0, z2), c = P(x2, WALL, z2), e = P(x1, WALL, z1);
        const mid = P((x1 + x2) / 2, WALL / 2, (z1 + z2) / 2);
        items.push({ z: mid[2], draw: () => {
          poly(ctx, [a, b, c, e]); ctx.fillStyle = inkA(0.06); ctx.fill();
          ctx.strokeStyle = inkA(0.18); ctx.lineWidth = 1; ctx.stroke();
          ctx.strokeStyle = inkA(0.6); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(e[0], e[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
        } });
      });
      let inView = 0;
      CAMS.forEach(c => {
        const base = P(c.x, CAM_H, c.z), tip = P(c.x + Math.cos(c.dir) * 0.9, CAM_H - 0.3, c.z + Math.sin(c.dir) * 0.9);
        items.push({ z: base[2], draw: () => {
          ctx.strokeStyle = C.accent; ctx.lineWidth = 3; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke(); ctx.lineCap = 'butt';
          ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(base[0], base[1], 3, 0, 7); ctx.fill();
          const blink = (t * 1.3 + c.x) % 1 < 0.5;
          ctx.fillStyle = blink ? '#e5341c' : inkA(0.3); ctx.beginPath(); ctx.arc(tip[0], tip[1], 1.6, 0, 7); ctx.fill();
          ctx.font = MONO(9); ctx.textAlign = 'center'; ctx.fillStyle = C.accent; ctx.fillText(c.id, base[0], base[1] - 10);
        } });
      });
      for (const p of people) {
        const seenBy = CAMS.find(c => sees(c, p.x, p.z));
        if (seenBy) inView++;
        const bob = Math.abs(Math.sin(p.phase)) * 0.05;
        const foot = P(p.x, 0, p.z), hip = P(p.x, 0.9 + bob, p.z), neck = P(p.x, 1.45 + bob, p.z), head = P(p.x, 1.66 + bob, p.z), top = P(p.x, 1.85 + bob, p.z);
        items.push({ z: hip[2], draw: () => {
          const hgt = Math.max(6, foot[1] - top[1]);
          const lw = clamp(hgt * 0.16, 1.5, 5);
          const col = seenBy ? C.accent : C['ink-2'];
          // legs: a little scissor while walking
          const sw = Math.sin(p.phase) * lw * 0.9;
          ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineWidth = lw * 0.8;
          ctx.beginPath(); ctx.moveTo(hip[0], hip[1]); ctx.lineTo(foot[0] - sw, foot[1]); ctx.moveTo(hip[0], hip[1]); ctx.lineTo(foot[0] + sw, foot[1]); ctx.stroke();
          ctx.lineWidth = lw * 1.25; ctx.beginPath(); ctx.moveTo(hip[0], hip[1]); ctx.lineTo(neck[0], neck[1]); ctx.stroke();
          ctx.lineCap = 'butt';
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(head[0], head[1], Math.max(1.8, hgt * 0.1), 0, 7); ctx.fill();
          if (seenBy && hgt > 9) {
            const bw = Math.max(10, hgt * 0.62), bx = foot[0] - bw / 2, by = top[1] - 3, bh = foot[1] - by + 3;
            ctx.strokeStyle = acA(0.35); ctx.lineWidth = 1; ctx.strokeRect(bx + .5, by + .5, bw, bh);
            corners(ctx, bx, by, bw, bh, 5, C.accent, 1.5);
            if (hgt > 16) chip(ctx, bx, by, `ID ${p.id} · ${seenBy.id.slice(-2)}`, C.accent, C['accent-ink'], 8.5);
          } else if (hgt > 16) {
            ctx.font = MONO(8.5); ctx.textAlign = 'center'; ctx.fillStyle = C.muted; ctx.fillText('ID ' + p.id, top[0], top[1] - 6);
          }
        } });
      }
      items.sort((a, b) => b.z - a.z).forEach(it => it.draw());
      countEl.textContent = `${people.length} tracks · ${inView} in view`;
    }

    let api = null;
    let tLast = 0;
    function frame(t, dt) {
      if (!reduce) stepPeople(dt);
      const idle = performance.now() - lastInput > 5000;
      if (idle && mode === 'persp' && !dragging) goal.yaw += dt * 0.07;
      const k = 1 - Math.pow(0.0008, dt || 0.016);
      for (const key of ['yaw', 'pitch', 'dist', 'tx', 'tz']) cam[key] = lerp(cam[key], goal[key], k);
      render(t); tLast = t;
    }
    if (reduce) { for (let i = 0; i < 260; i++) stepPeople(0.05); }
    api = animate(host, frame, { still: 4 });

    // interaction
    const ptrs = new Map(); let dragging = false, panMode = false, pinch0 = 0, mid0 = null;
    const poke = () => { lastInput = performance.now(); host.classList.add('is-live'); if (reduce) api.draw(); };
    const panBy = (dx, dy) => {
      const s = goal.dist / Math.max(300, st.h) * 1.15;
      const cy = Math.cos(goal.yaw), sy = Math.sin(goal.yaw);
      // screen right on the ground = (cos yaw, -sin yaw); screen up on the ground = (-sin yaw, -cos yaw)
      goal.tx = clamp(goal.tx - (dx * cy - dy * sy) * s, 0, W);
      goal.tz = clamp(goal.tz - (-dx * sy - dy * cy) * s, 0, D);
    };
    const zoomBy = (f) => { goal.dist = clamp(goal.dist * f, LIM.dist[0], LIM.dist[1]); };
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      dragging = true; panMode = e.button === 2 || e.shiftKey;
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); mid0 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
      host.classList.add('is-drag'); poke();
    });
    cv.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) return;
      const prev = ptrs.get(e.pointerId), dx = e.clientX - prev[0], dy = e.clientY - prev[1];
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size >= 2) {
        const [a, b] = [...ptrs.values()];
        const dist = Math.hypot(a[0] - b[0], a[1] - b[1]), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (pinch0) zoomBy(pinch0 / dist);
        if (mid0) panBy(mid[0] - mid0[0], mid[1] - mid0[1]);
        pinch0 = dist; mid0 = mid;
      } else if (panMode) panBy(dx, dy);
      else {
        goal.yaw -= dx * 0.006;
        goal.pitch = clamp(goal.pitch + dy * 0.005, LIM.pitch[0], LIM.pitch[1]);
        if (mode === 'top' && Math.abs(dy) > 1) setMode('persp');
      }
      poke();
    });
    const up = e => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) { pinch0 = 0; mid0 = null; }
      if (!ptrs.size) { dragging = false; host.classList.remove('is-drag'); }
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    let hintT = 0;
    cv.addEventListener('wheel', e => {
      if (!(e.ctrlKey || e.metaKey)) {
        hint.classList.add('flash'); clearTimeout(hintT); hintT = setTimeout(() => hint.classList.remove('flash'), 1400);
        return;
      }
      e.preventDefault();
      zoomBy(Math.exp(e.deltaY * 0.0022)); poke();
    }, { passive: false });
    cv.addEventListener('dblclick', () => { Object.assign(goal, HOME); setMode('persp'); poke(); });
    $$('.map-ctl button', host).forEach(b => b.addEventListener('click', () => {
      const v = b.dataset.view, z = b.dataset.zoom;
      if (v === 'persp') { goal.pitch = HOME.pitch; setMode('persp'); }
      if (v === 'top') { goal.pitch = LIM.pitch[1]; goal.yaw = Math.round(goal.yaw / (Math.PI / 2)) * (Math.PI / 2); setMode('top'); }
      if (v === 'reset') { Object.assign(goal, HOME); setMode('persp'); }
      if (z) zoomBy(z === 'in' ? 0.8 : 1.25);
      poke();
      if (reduce) { Object.assign(cam, goal); api.draw(); }
    }));
    // keyboard on the canvas: arrows orbit, +/- zoom
    cv.tabIndex = 0;
    cv.addEventListener('keydown', e => {
      const k = e.key; let used = true;
      if (k === 'ArrowLeft') goal.yaw += 0.15; else if (k === 'ArrowRight') goal.yaw -= 0.15;
      else if (k === 'ArrowUp') goal.pitch = clamp(goal.pitch + 0.1, LIM.pitch[0], LIM.pitch[1]);
      else if (k === 'ArrowDown') goal.pitch = clamp(goal.pitch - 0.1, LIM.pitch[0], LIM.pitch[1]);
      else if (k === '+' || k === '=') zoomBy(0.85); else if (k === '-') zoomBy(1.18);
      else used = false;
      if (used) { e.preventDefault(); poke(); if (reduce) { Object.assign(cam, goal); api.draw(); } }
    });
    themeFns.push(() => api.draw());
  }

  /* =========================================================
     3. Edit timeline — script, clips, song; a playhead sweeps the cut
     ========================================================= */
  function editTimeline() {
    const cv = $('#nleCanvas'); if (!cv) return;
    const st = fit(cv, () => api && api.draw());
    const LEN = 12; // seconds in the loop
    const CLIPS = [[0, 1.8], [1.8, 3.9], [3.9, 5.2], [5.2, 7.6], [7.6, 9.4], [9.4, 12]];
    const LYR = [[0.3, 3.6, 'verse 1'], [3.9, 7.4, 'chorus'], [7.7, 11.6, 'verse 2']];
    let api = null;
    function draw(t) {
      const ctx = begin(st); if (!st.w) return;
      const w = st.w, h = st.h, gut = 74, rul = 18, pad = 2;
      const tw = w - gut - pad, x0 = gut;
      const T = t % LEN, ph = x0 + T / LEN * tw;
      const rows = [
        { k: 'T1', n: 'Claude', y: rul + 6, h: 16 },
        { k: 'V1', n: 'Flow', y: rul + 28, h: Math.max(30, (h - rul - 70) * 0.62) },
      ];
      rows.push({ k: 'A1', n: 'Suno', y: rows[1].y + rows[1].h + 8, h: h - (rows[1].y + rows[1].h + 8) - 4 });
      // ruler
      ctx.font = MONO(9); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      for (let s = 0; s <= LEN; s++) {
        const x = x0 + s / LEN * tw;
        ctx.fillStyle = rgba(C.ink, s % 2 ? 0.15 : 0.3); ctx.fillRect(x, rul - (s % 2 ? 4 : 7), 1, s % 2 ? 4 : 7);
        if (s % 2 === 0 && s < LEN && x + 34 < w - 92) { ctx.fillStyle = C.muted; ctx.fillText('00:' + String(s).padStart(2, '0'), x + 3, 6); }
      }
      // track labels
      rows.forEach(r => {
        ctx.fillStyle = rgba(C.ink, 0.06); rr(ctx, 0, r.y, gut - 8, r.h, 5); ctx.fill();
        ctx.font = MONO(9); ctx.fillStyle = C.accent; ctx.textBaseline = 'middle';
        ctx.fillText(r.k, 7, r.y + Math.min(r.h / 2, 9));
        ctx.fillStyle = C.ink; ctx.fillText(r.n, 26, r.y + Math.min(r.h / 2, 9));
      });
      // script / lyric blocks
      const R0 = rows[0];
      LYR.forEach(([a, b, name]) => {
        const xa = x0 + a / LEN * tw, xb = x0 + b / LEN * tw, on = T >= a && T < b;
        ctx.fillStyle = on ? rgba(C.accent, 0.22) : rgba(C.ink, 0.07); rr(ctx, xa, R0.y, xb - xa, R0.h, 4); ctx.fill();
        ctx.fillStyle = on ? C.accent : C.muted; ctx.font = MONO(8.5); ctx.fillText(name, xa + 6, R0.y + R0.h / 2);
      });
      // clips with tiny generated "thumbnails"
      const R1 = rows[1];
      CLIPS.forEach(([a, b], i) => {
        const xa = x0 + a / LEN * tw + 1, xb = x0 + b / LEN * tw - 1, on = T >= a && T < b, cw = xb - xa;
        ctx.save(); rr(ctx, xa, R1.y, cw, R1.h, 5); ctx.clip();
        ctx.fillStyle = on ? rgba(C.accent, 0.16) : rgba(C.ink, 0.06); ctx.fillRect(xa, R1.y, cw, R1.h);
        // frame strips: sky line, hill, sun, a character blob — varies by shot
        const fw = R1.h * 0.9;
        for (let fx = xa + 4; fx < xb - 4; fx += fw + 4) {
          const fy = R1.y + 4, fh = R1.h - 8, ww = Math.min(fw, xb - 4 - fx);
          ctx.fillStyle = rgba(C.ink, 0.07); ctx.fillRect(fx, fy, ww, fh);
          ctx.fillStyle = on ? rgba(C.accent, 0.55) : rgba(C.ink, 0.25);
          ctx.beginPath(); ctx.ellipse(fx + ww * 0.5, fy + fh + fh * 0.1, ww * 0.8, fh * 0.45, 0, Math.PI, 0); ctx.fill();
          ctx.beginPath(); ctx.arc(fx + ww * (0.25 + (i % 3) * 0.22), fy + fh * 0.32, Math.max(1.5, fh * 0.11), 0, 7); ctx.fill();
        }
        ctx.restore();
        ctx.strokeStyle = on ? C.accent : rgba(C.ink, 0.18); ctx.lineWidth = on ? 1.5 : 1; rr(ctx, xa, R1.y, cw, R1.h, 5); ctx.stroke();
        if (cw > 46) chip(ctx, xa + 4, R1.y + 16, 'shot ' + String(i + 1).padStart(2, '0'), on ? C.accent : rgba(C.bg, 0.75), on ? C['accent-ink'] : C.ink, 8.5);
      });
      // waveform
      const R2 = rows[2], midY = R2.y + R2.h / 2;
      ctx.fillStyle = rgba(C.ink, 0.05); rr(ctx, x0, R2.y, tw, R2.h, 5); ctx.fill();
      for (let x = x0 + 2; x < x0 + tw - 2; x += 3) {
        const u = (x - x0) / tw * LEN;
        const env = 0.35 + 0.65 * Math.abs(Math.sin(u * 0.9)) * (0.6 + 0.4 * Math.sin(u * 3.1));
        const amp = (R2.h / 2 - 3) * env * (0.55 + 0.45 * Math.abs(Math.sin(x * 0.37)));
        ctx.fillStyle = x < ph ? C.accent : rgba(C.ink, 0.28);
        ctx.fillRect(x, midY - amp, 1.6, amp * 2);
      }
      // playhead
      ctx.fillStyle = C.ink; ctx.fillRect(ph - 0.5, rul - 2, 1.5, h - rul);
      ctx.beginPath(); ctx.moveTo(ph - 5, rul - 9); ctx.lineTo(ph + 6, rul - 9); ctx.lineTo(ph + 0.5, rul - 2); ctx.closePath(); ctx.fill();
      const tc = `00:${String(Math.floor(T)).padStart(2, '0')}:${String(Math.floor((T % 1) * 24)).padStart(2, '0')}`;
      ctx.font = MONO(9); ctx.fillStyle = C.muted; ctx.textAlign = 'right'; ctx.fillText(tc + ' · 24 fps', w - 2, 6); ctx.textAlign = 'left';
    }
    api = animate(cv, (t) => draw(t), { still: 6.3 });
    themeFns.push(() => api.draw());
  }

  /* =========================================================
     4. Builds — accordion, plus a live preview inside each open row
     ========================================================= */
  function builds() {
    const list = $('#buildList'); if (!list) return;
    const items = $$('.build', list);
    const previews = [];
    items.forEach(li => {
      const btn = $('.build-row', li);
      btn.addEventListener('click', () => {
        const open = !li.classList.contains('is-open');
        const mobile = matchMedia('(max-width: 900px)').matches;
        /* On phones the accordion is exclusive, so opening one row COLLAPSES the
           one above it. That removes several hundred pixels of content above the
           tapped row and the page lurches upward — the row the user just touched
           jumps off screen. Fix: pin the tapped row by compensating scroll, and
           on small screens skip the height animation so the compensation is
           exact rather than chasing a 700ms transition. */
        const anchorY = li.getBoundingClientRect().top;
        if (mobile) list.classList.add('no-anim');
        items.forEach(o => { const on = o === li ? open : false; o.classList.toggle('is-open', on); $('.build-row', o).setAttribute('aria-expanded', String(on)); });
        previews.forEach(p => p.start());
        if (mobile) {
          const dy = li.getBoundingClientRect().top - anchorY;
          if (dy) window.scrollBy(0, dy);
          requestAnimationFrame(() => requestAnimationFrame(() => list.classList.remove('no-anim')));
        }
      });
    });

    /* --- Keychain Buddy: a 128×64 1-bit face, booped by click --- */
    function buddy(cv) {
      const st = fit(cv, () => a && a.draw());
      const FW = 128, FH = 64, fb = new Uint8Array(FW * FH);
      const px = (x, y) => { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < FW && y < FH) fb[y * FW + x] = 1; };
      const rect = (x, y, w, h) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j); };
      const rrect = (x, y, w, h, r) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const cx = i < r ? r - i : i >= w - r ? i - (w - r - 1) : 0, cy = j < r ? r - j : j >= h - r ? j - (h - r - 1) : 0; if (cx * cx + cy * cy <= r * r) px(x + i, y + j); } };
      const line = (x0, y0, x1, y1, th = 1) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1; for (let k = 0; k <= n; k++) { const x = x0 + (x1 - x0) * k / n, y = y0 + (y1 - y0) * k / n; rect(x - th / 2, y - th / 2, th, th); } };
      let mood = 'idle', moodT = 0, blinkAt = 2.4, glance = 0, glanceGoal = 0, nextGlance = 3, booped = [], idleFor = 0;
      cv.addEventListener('click', () => {
        const now = performance.now(); booped = booped.filter(x => now - x < 1100); booped.push(now);
        mood = booped.length >= 3 ? 'dizzy' : 'happy'; moodT = mood === 'dizzy' ? 1.4 : 0.9; idleFor = 0;
        if (reduce) a.draw();
      });
      function face(t, dt) {
        fb.fill(0);
        if (moodT > 0) { moodT -= dt; if (moodT <= 0) mood = 'idle'; }
        idleFor += dt;
        if (mood === 'idle' && idleFor > 14) mood = 'sleep';
        nextGlance -= dt; if (nextGlance < 0) { glanceGoal = [-5, 0, 5, 0][Math.floor(Math.random() * 4)]; nextGlance = 2 + Math.random() * 3; }
        glance = lerp(glance, glanceGoal, 0.15);
        const ex1 = 38 + glance, ex2 = 74 + glance, ey = 18;
        if (mood === 'happy') {
          [ex1, ex2].forEach(x => { line(x, ey + 14, x + 8, ey + 4, 3); line(x + 8, ey + 4, x + 16, ey + 14, 3); });
          for (let i = 0; i <= 12; i++) { const a = Math.PI * i / 12; rect(56 + 8 - Math.cos(a) * 8, 46 + Math.sin(a) * 5, 2, 2); }
          // a little heart, top right
          const hx = 108, hy = 8; [[1, 0], [2, 0], [4, 0], [5, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [2, 3], [3, 3], [4, 3], [3, 4]].forEach(([i, j]) => rect(hx + i * 2, hy + j * 2, 2, 2));
        } else if (mood === 'dizzy') {
          const wob = Math.sin(t * 18) * 2;
          [ex1, ex2].forEach(x => { line(x + 2 + wob, ey + 2, x + 16 + wob, ey + 18, 3); line(x + 16 + wob, ey + 2, x + 2 + wob, ey + 18, 3); });
          for (let i = 0; i < 24; i++) rect(52 + i, 48 + Math.sin(i * 0.8 + t * 10) * 2, 2, 2);
        } else if (mood === 'sleep') {
          [ex1, ex2].forEach(x => rect(x, ey + 12, 18, 3));
          const z = (t * 0.8) % 1;
          rect(100, 18 - z * 8, 6, 1); line(105, 18 - z * 8, 100, 23 - z * 8); rect(100, 23 - z * 8, 6, 1);
        } else {
          blinkAt -= dt;
          const blinking = blinkAt < 0;
          if (blinkAt < -0.13) blinkAt = 2.2 + Math.random() * 3.4;
          [ex1, ex2].forEach(x => blinking ? rect(x, ey + 11, 18, 3) : rrect(x, ey, 18, 24, 5));
          rect(58, 50, 12, 2);
        }
        // battery glyph
        rect(110, 56, 12, 6); rect(122, 58, 1, 2); for (let i = 0; i < 12; i++) fb[56 * FW + 110 + i] = 1;
        for (let j = 57; j < 61; j++) for (let i = 111; i < 121; i++) fb[j * FW + i] = (i > 112 && i < 118) ? 1 : 0;
      }
      function draw(t, dt) {
        const ctx = begin(st); if (!st.w) return;
        face(t, dt || 0.016);
        const s = Math.max(2, Math.floor(Math.min((st.w - 32) / FW, (st.h - 32) / FH)));
        const sw = FW * s, sh = FH * s, ox = Math.round((st.w - sw) / 2), oy = Math.round((st.h - sh) / 2);
        ctx.fillStyle = '#050505'; rr(ctx, ox - 10, oy - 10, sw + 20, sh + 20, 10); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.03)'; ctx.fillRect(ox, oy, sw, sh);
        const hue = getComputedStyle(root).getPropertyValue('--accent-h').trim() || '145';
        ctx.fillStyle = `hsl(${hue} 100% 64%)`;
        const g = s > 3 ? 1 : 0;
        for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) if (fb[y * FW + x]) ctx.fillRect(ox + x * s, oy + y * s, s - g, s - g);
        ctx.font = MONO(9); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = C.muted; ctx.fillText('SSD1306 · 128×64 · ' + mood, 14, st.h - 14);
      }
      const a = animate(cv, draw, { enabled: () => cv.closest('.build').classList.contains('is-open'), still: 1 });
      themeFns.push(() => a.draw());
      return a;
    }

    /* --- ICE ↔ EdgeVision: a sequence diagram that plays itself --- */
    function mqtt(cv) {
      const st = fit(cv, () => a && a.draw());
      const LANES = ['ICE', 'Broker', 'Connector', 'EdgeVision'];
      const MSG = [[0, 1, 'HTTP POST · onboard'], [1, 2, 'MQTT · cmd/onboard'], [2, 3, 'add camera'], [3, 2, 'ok · cam_07'], [2, 1, 'MQTT · reply'], [1, 0, 'HTTP 200']];
      const T = 7.2;
      function draw(t) {
        const ctx = begin(st); if (!st.w) return;
        const w = st.w, h = st.h, top = 34, bot = h - 14;
        const lx = (i) => 52 + i * (w - 104) / 3;
        const ph = t % T, fade = ph > T - 0.5 ? (T - ph) / 0.5 : 1;
        ctx.font = MONO(10); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        LANES.forEach((n, i) => {
          const x = lx(i);
          ctx.fillStyle = rgba(C.ink, 0.07); const tw = ctx.measureText(n).width + 16; rr(ctx, x - tw / 2, 6, tw, 20, 10); ctx.fill();
          ctx.fillStyle = i === 2 ? C.accent : C.ink; ctx.fillText(n, x, 16.5);
          ctx.strokeStyle = rgba(C.ink, 0.16); ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bot); ctx.stroke(); ctx.setLineDash([]);
        });
        const gap = (bot - top - 10) / MSG.length;
        ctx.globalAlpha = fade;
        MSG.forEach(([f, to, label], i) => {
          const t0 = 0.3 + i * 0.95, k = clamp((ph - t0) / 0.6, 0, 1);
          if (k <= 0) return;
          const y = top + 14 + i * gap, x1 = lx(f), x2 = lx(to), x = lerp(x1, x2, easeOut(k));
          const back = to < f;
          ctx.strokeStyle = back ? rgba(C.ink, 0.6) : C.accent; ctx.lineWidth = 1.5;
          if (back) ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
          const dir = Math.sign(x2 - x1);
          ctx.fillStyle = back ? rgba(C.ink, 0.6) : C.accent;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dir * 6, y - 3.5); ctx.lineTo(x - dir * 6, y + 3.5); ctx.closePath(); ctx.fill();
          if (k > 0.4) {
            ctx.globalAlpha = fade * clamp((k - 0.4) / 0.4, 0, 1);
            ctx.font = MONO(9.5); ctx.fillStyle = back ? C.muted : C.ink; ctx.textAlign = 'center';
            ctx.fillText(label, (x1 + x2) / 2, y - 9);
            ctx.globalAlpha = fade;
          }
          if (k < 1) { ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill(); }
          // the connector runs the command: a short busy bar on the EdgeVision lane
          if (i === 2 && k >= 1 && ph < t0 + 1.6) { ctx.fillStyle = rgba(C.accent, 0.25); ctx.fillRect(lx(3) - 4, y, 8, Math.min(gap, (ph - t0 - 0.6) * 60)); }
        });
        ctx.globalAlpha = 1;
      }
      const a = animate(cv, draw, { enabled: () => cv.closest('.build').classList.contains('is-open'), still: 6.6 });
      themeFns.push(() => a.draw());
      return a;
    }

    /* --- This portfolio: the portrait walks the seven accent hues --- */
    function hue(cv) {
      const st = fit(cv, () => a && a.draw());
      const NAMES = ['orange', 'red', 'amber', 'green', 'teal', 'blue', 'violet'], HUES = [14, 2, 38, 145, 178, 214, 268];
      const imgs = NAMES.map(n => { const im = new Image(); im.decoding = 'async'; im.src = `assets/img/avatar/avatar-${n}.webp`; im.onload = () => a && a.draw(); return im; });
      const STEP = 1.7;
      function draw(t) {
        const ctx = begin(st); if (!st.w) return;
        const w = st.w, h = st.h, cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.36;
        const u = t / STEP, i = Math.floor(u) % 7, j = (i + 1) % 7, k = easeIO(clamp((u % 1 - 0.65) / 0.35, 0, 1));
        const pr = R * 0.78;
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, pr, 0, 7); ctx.clip();
        if (imgs[i].complete && imgs[i].naturalWidth) ctx.drawImage(imgs[i], cx - pr, cy - pr, pr * 2, pr * 2);
        if (k > 0 && imgs[j].complete && imgs[j].naturalWidth) {
          // wipe in the next theme from the left, like a scan line
          ctx.save(); ctx.beginPath(); ctx.rect(cx - pr, cy - pr, pr * 2 * k, pr * 2); ctx.clip();
          ctx.drawImage(imgs[j], cx - pr, cy - pr, pr * 2, pr * 2); ctx.restore();
          ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.85; ctx.fillRect(cx - pr + pr * 2 * k - 1, cy - pr, 2, pr * 2); ctx.globalAlpha = 1;
        }
        ctx.restore();
        ctx.strokeStyle = rgba(C.ink, 0.15); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, pr + 6, 0, 7); ctx.stroke();
        // hue ring with the seven stops
        for (let s = 0; s < 72; s++) {
          const a0 = s / 72 * Math.PI * 2 - Math.PI / 2;
          ctx.strokeStyle = `hsl(${s * 5} 80% 58% / .5)`; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(cx, cy, R + 10, a0, a0 + Math.PI * 2 / 72 + 0.01); ctx.stroke();
        }
        HUES.forEach((hh, n) => {
          const ang = hh / 360 * Math.PI * 2 - Math.PI / 2, x = cx + Math.cos(ang) * (R + 10), y = cy + Math.sin(ang) * (R + 10);
          const cur = n === (k > 0.5 ? j : i);
          ctx.fillStyle = `hsl(${hh} 92% 56%)`; ctx.beginPath(); ctx.arc(x, y, cur ? 7 : 4.5, 0, 7); ctx.fill();
          if (cur) { ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 10, 0, 7); ctx.stroke(); }
        });
        const cur = k > 0.5 ? j : i;
        ctx.font = MONO(10); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = C.muted;
        ctx.fillText(`accent · ${NAMES[cur]}`, 14, h - 30);
        ctx.fillStyle = C.ink; ctx.fillText(`oklch hue → ${HUES[cur]}° swatch`, 14, h - 14);
      }
      const a = animate(cv, draw, { enabled: () => cv.closest('.build').classList.contains('is-open'), still: 1.2 });
      themeFns.push(() => a.draw());
      return a;
    }

    /* --- Angular: an RxJS marble diagram for search-as-you-type --- */
    function marbles(cv) {
      const st = fit(cv, () => a && a.draw());
      const T = 8;
      const KEYS = [[0.4, 'a'], [0.7, 'an'], [0.95, 'ang'], [2.9, 'angu'], [3.15, 'angul'], [3.4, 'angula'], [3.6, 'angular']];
      const DEB = 0.9; // debounce window, scaled
      const debOut = KEYS.filter((k, i) => !KEYS[i + 1] || KEYS[i + 1][0] - k[0] > DEB).map(k => [k[0] + DEB, k[1]]);
      // switchMap: the first request is slow and gets cancelled when the second starts
      const REQ = [[debOut[0][0], debOut[0][0] + 2.6, 'r1'], [debOut[1][0], debOut[1][0] + 1.2, 'r2']];
      function draw(t) {
        const ctx = begin(st); if (!st.w) return;
        const w = st.w, h = st.h, x0 = 128, x1 = w - 18, ph = t % T, X = (s) => x0 + s / T * (x1 - x0);
        const lanes = [['keyup$', 0.24], ['debounceTime(300)', 0.52], ['switchMap(search)', 0.8]];
        ctx.font = MONO(9.5); ctx.textBaseline = 'middle';
        lanes.forEach(([n, f]) => {
          const y = h * f;
          ctx.fillStyle = C.muted; ctx.textAlign = 'left'; ctx.fillText(n, 12, y);
          ctx.strokeStyle = rgba(C.ink, 0.3); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x1 - 6, y - 4); ctx.moveTo(x1, y); ctx.lineTo(x1 - 6, y + 4); ctx.stroke();
        });
        const marble = (s, y, label, filled, r = 9) => {
          if (s > ph) return;
          const x = X(s), a = easeOut(clamp((ph - s) / 0.25, 0, 1));
          ctx.fillStyle = filled ? C.accent : C.card; ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(x, y, r * a, 0, 7); ctx.fill(); ctx.stroke();
          ctx.fillStyle = filled ? C['accent-ink'] : C.ink; ctx.textAlign = 'center'; ctx.font = MONO(8.5);
          ctx.fillText(label, x, y + 0.5);
        };
        KEYS.forEach(([s, v]) => marble(s, h * 0.24, v.slice(-1), false, 7.5));
        debOut.forEach(([s, v]) => {
          marble(s, h * 0.52, v.length > 4 ? '…' + v.slice(-3) : v, true, 11);
          if (s <= ph) { ctx.strokeStyle = rgba(C.accent, 0.35); ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(X(s), h * 0.52 + 12); ctx.lineTo(X(s), h * 0.8 - 12); ctx.stroke(); ctx.setLineDash([]); }
        });
        // in-flight request bars; r1 is cut off by r2
        REQ.forEach(([s, e, name], i) => {
          if (s > ph) return;
          const cut = i === 0 ? REQ[1][0] : Infinity, end = Math.min(e, cut, ph);
          const y = h * 0.8 + (i ? 0 : -1);
          ctx.fillStyle = rgba(C.accent, 0.18); ctx.fillRect(X(s), y - 4, X(end) - X(s), 8);
          if (i === 0 && ph >= cut) {
            const x = X(cut); ctx.strokeStyle = C.muted; ctx.lineWidth = 1.6;
            ctx.beginPath(); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x - 5, y + 5); ctx.stroke();
            ctx.font = MONO(9); ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.fillText('cancelled', x, y + 17);
          }
          if (i === 1 && ph >= e) marble(e, y, 'r2', true, 11);
        });
        // time cursor
        ctx.fillStyle = rgba(C.ink, 0.5); ctx.fillRect(X(ph), h * 0.1, 1, h * 0.82);
      }
      const a = animate(cv, draw, { enabled: () => cv.closest('.build').classList.contains('is-open'), still: 7.5 });
      themeFns.push(() => a.draw());
      return a;
    }

    /* --- Nine months, organised: forty weeks as ticks around a ring --- */
    function weeks(cv) {
      const st = fit(cv, () => a && a.draw());
      const T = 24;                                  // one sweep, seconds
      function draw(t) {
        const ctx = begin(st); if (!st.w) return;
        const w = st.w, h = st.h;
        const cx = w * 0.5, cy = h * 0.5, R = Math.min(w, h) * 0.36;
        const top = -Math.PI / 2;
        const wk = 1 + ((t % T) / T) * 39;           // 1 → 40, then round again
        const ang = (n) => top + (n / 40) * Math.PI * 2;

        // the three trimesters as quiet bands behind the ticks
        [[0, 13], [13, 28], [28, 40]].forEach(([s, e], i) => {
          ctx.strokeStyle = rgba(C.ink, [0.16, 0.11, 0.07][i]);
          ctx.lineWidth = 7; ctx.lineCap = 'butt';
          ctx.beginPath(); ctx.arc(cx, cy, R, ang(s), ang(e)); ctx.stroke();
        });

        // a tick a week; the ones she has passed take the accent
        for (let i = 0; i <= 40; i++) {
          const a1 = ang(i), major = i % 4 === 0;
          const r1 = R + 11, r2 = R + (major ? 24 : 17);
          ctx.strokeStyle = i <= wk ? C.accent : rgba(C.ink, major ? 0.26 : 0.14);
          ctx.lineWidth = major ? 1.7 : 1;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1);
          ctx.lineTo(cx + Math.cos(a1) * r2, cy + Math.sin(a1) * r2);
          ctx.stroke();
        }

        // the scale itself: 10, 20, 30, 40 outside their ticks
        ctx.fillStyle = C.muted; ctx.font = MONO(9);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        [10, 20, 30, 40].forEach((n) => {
          const a2 = ang(n);
          ctx.fillText(String(n), cx + Math.cos(a2) * (R + 34), cy + Math.sin(a2) * (R + 34));
        });

        // where she is now
        const dx = cx + Math.cos(ang(wk)) * R, dy = cy + Math.sin(ang(wk)) * R;
        ctx.fillStyle = C.card; ctx.beginPath(); ctx.arc(dx, dy, 7.5, 0, 7); ctx.fill();
        ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(dx, dy, 5, 0, 7); ctx.fill();

        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = C.ink; ctx.font = MONO(28);
        ctx.fillText(String(Math.floor(wk)), cx, cy - 7);
        ctx.fillStyle = C.muted; ctx.font = MONO(9);
        ctx.fillText('of 40 weeks', cx, cy + 16);
        ctx.fillText(wk < 13 ? 'first trimester' : wk < 28 ? 'second trimester' : 'third trimester', cx, cy + 34);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }
      const a = animate(cv, draw, { enabled: () => cv.closest('.build').classList.contains('is-open'), still: 5.2 });
      themeFns.push(() => a.draw());
      return a;
    }

    const MAKERS = { buddy, mqtt, hue, marbles, weeks };
    $$('canvas[data-build-viz]', list).forEach(cv => { const m = MAKERS[cv.dataset.buildViz]; if (m) previews.push(m(cv)); });
  }

  agentFlow();
  floorMap();
  editTimeline();
  builds();
})();
