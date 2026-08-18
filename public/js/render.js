const Renderer = (() => {
  const starsCanvas = document.getElementById("stars");
  const starsCtx = starsCanvas.getContext("2d");
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const stars = [];
  const particles = [];
  const rockSprites = new Map();
  let backdrop = null;
  let w = 0;
  let h = 0;
  let time = 0;
  const shake = { x: 0, y: 0, mag: 0 };
  const camSoft = { x: 0, y: 0, ready: false };
  const MAX_PARTICLES = 90;

  function dpr() {
    return Math.min(1.5, window.devicePixelRatio || 1);
  }

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    const scale = dpr();
    for (const c of [starsCanvas, canvas]) {
      c.width = w * scale;
      c.height = h * scale;
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      c.getContext("2d").setTransform(scale, 0, 0, scale, 0, 0);
    }
    seedField();
    paintBackdrop();
  }

  function seedField() {
    stars.length = 0;
    for (let i = 0; i < 220; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        z: Math.random() * 2.2 + 0.3,
        a: 0.35 + Math.random() * 0.55,
      });
    }
  }

  function paintBackdrop() {
    backdrop = document.createElement("canvas");
    backdrop.width = Math.max(1, w);
    backdrop.height = Math.max(1, h);
    const g = backdrop.getContext("2d");
    g.fillStyle = "#050814";
    g.fillRect(0, 0, w, h);
    const a = g.createRadialGradient(w * 0.22, h * 0.28, 20, w * 0.22, h * 0.28, Math.max(w, h) * 0.55);
    a.addColorStop(0, "rgba(88, 36, 160, 0.32)");
    a.addColorStop(1, "transparent");
    const b = g.createRadialGradient(w * 0.78, h * 0.62, 20, w * 0.78, h * 0.62, Math.max(w, h) * 0.5);
    b.addColorStop(0, "rgba(18, 90, 170, 0.26)");
    b.addColorStop(1, "transparent");
    const c = g.createRadialGradient(w * 0.55, h * 0.08, 10, w * 0.55, h * 0.08, 340);
    c.addColorStop(0, "rgba(56, 189, 248, 0.1)");
    c.addColorStop(1, "transparent");
    g.fillStyle = a;
    g.fillRect(0, 0, w, h);
    g.fillStyle = b;
    g.fillRect(0, 0, w, h);
    g.fillStyle = c;
    g.fillRect(0, 0, w, h);
    const vig = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
    vig.addColorStop(0, "transparent");
    vig.addColorStop(1, "rgba(0,0,0,0.45)");
    g.fillStyle = vig;
    g.fillRect(0, 0, w, h);
  }

  function burst(x, y, color, n, speed, life, size) {
    const room = MAX_PARTICLES - particles.length;
    const count = Math.min(n, Math.max(0, room));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * speed;
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life,
        max: life,
        color,
        r: (size || 2) * (0.4 + Math.random()),
        drag: 0.96,
      });
    }
  }

  function addExplosion(x, y, color) {
    burst(x, y, color, 12, 240, 0.4, 2.6);
    burst(x, y, "#ff8a3d", 8, 160, 0.32, 2);
    shake.mag = Math.min(10, shake.mag + 4);
  }

  function addShake(n) {
    shake.mag = Math.min(18, shake.mag + n);
  }

  function ingestImpacts(list) {
    for (const hit of list || []) {
      if (hit.kind === "boom" || hit.kind === "death") addExplosion(hit.x, hit.y, hit.color);
      else if (hit.kind === "spark") burst(hit.x, hit.y, hit.color, 4, 140, 0.18, 1.4);
      else if (hit.kind === "pickup") burst(hit.x, hit.y, hit.color, 6, 80, 0.25, 1.8);
      else if (hit.kind === "gate") burst(hit.x, hit.y, hit.color, 8, 100, 0.28, 1.8);
    }
  }

  function wrapDelta(a, b, max) {
    let d = b - a;
    if (d > max / 2) d -= max;
    if (d < -max / 2) d += max;
    return d;
  }

  function cameraFor(me, world, dt) {
    if (!me || !world) return { x: 0, y: 0 };
    const look = 0.22;
    const targetX = me.x + (me.vx || 0) * look - w / 2;
    const targetY = me.y + (me.vy || 0) * look - h / 2;
    if (!camSoft.ready) {
      camSoft.x = targetX;
      camSoft.y = targetY;
      camSoft.ready = true;
    } else {
      const k = 1 - Math.pow(0.001, dt);
      while (camSoft.x - targetX > world.w / 2) camSoft.x -= world.w;
      while (camSoft.x - targetX < -world.w / 2) camSoft.x += world.w;
      while (camSoft.y - targetY > world.h / 2) camSoft.y -= world.h;
      while (camSoft.y - targetY < -world.h / 2) camSoft.y += world.h;
      camSoft.x += (targetX - camSoft.x) * k;
      camSoft.y += (targetY - camSoft.y) * k;
    }
    return { x: camSoft.x, y: camSoft.y };
  }

  function wrapToView(coord, center, span) {
    return coord - Math.round((coord - center) / span) * span;
  }

  function worldToScreen(wx, wy, cam, world) {
    let x = wx - cam.x + shake.x;
    let y = wy - cam.y + shake.y;
    if (world) {
      x = wrapToView(x, w / 2, world.w);
      y = wrapToView(y, h / 2, world.h);
    }
    return { x, y };
  }

  function nearestScreen(wx, wy, from, cam, world) {
    let best = null;
    let bestD = Infinity;
    for (const ox of [-world.w, 0, world.w]) {
      for (const oy of [-world.h, 0, world.h]) {
        const s = { x: wx + ox - cam.x + shake.x, y: wy + oy - cam.y + shake.y };
        const d = from ? (s.x - from.x) ** 2 + (s.y - from.y) ** 2 : (s.x - w / 2) ** 2 + (s.y - h / 2) ** 2;
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
    }
    return best;
  }

  function hexRgb(hex) {
    const n = hex.replace("#", "");
    return {
      r: parseInt(n.slice(0, 2), 16),
      g: parseInt(n.slice(2, 4), 16),
      b: parseInt(n.slice(4, 6), 16),
    };
  }

  function drawMenuStars(dt) {
    time += dt;
    starsCtx.fillStyle = "#03040a";
    starsCtx.fillRect(0, 0, w, h);
    const g1 = starsCtx.createRadialGradient(w * 0.28, h * 0.3, 10, w * 0.28, h * 0.3, 520);
    g1.addColorStop(0, "rgba(70, 30, 140, 0.28)");
    g1.addColorStop(1, "transparent");
    const g2 = starsCtx.createRadialGradient(w * 0.75, h * 0.62, 10, w * 0.75, h * 0.62, 460);
    g2.addColorStop(0, "rgba(20, 90, 160, 0.2)");
    g2.addColorStop(1, "transparent");
    starsCtx.fillStyle = g1;
    starsCtx.fillRect(0, 0, w, h);
    starsCtx.fillStyle = g2;
    starsCtx.fillRect(0, 0, w, h);
    starsCtx.fillStyle = "rgba(220,235,255,0.7)";
    for (const s of stars) {
      s.y += s.z * 10 * dt;
      if (s.y > h) s.y = 0;
      starsCtx.fillRect(s.x, s.y, s.z, s.z);
    }
    drawMenuHollow(starsCtx);
  }

  function drawMenuHollow(c) {
    c.save();
    c.fillStyle = "#7c3aed";
    for (let i = 0; i < 16; i++) {
      const x = ((time * 52 + i * 36) % (w + 200)) - 100;
      const y = h * 0.78 + Math.sin(time * 1.5 + i * 0.42) * 22;
      const r = i === 0 ? 16 : Math.max(4, 12 - i * 0.4);
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  function rockSprite(seed, r) {
    const key = `${seed.toFixed(4)}:${r | 0}`;
    const hit = rockSprites.get(key);
    if (hit) return hit;
    const pad = 10;
    const dim = Math.ceil(r * 2 + pad * 2);
    const c = document.createElement("canvas");
    c.width = dim;
    c.height = dim;
    const g = c.getContext("2d");
    g.translate(dim / 2, dim / 2);
    const n = 11;
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const jagged = 0.7 + ((Math.sin(seed * 41 + i * 2.4) + 1) / 2) * 0.36;
      const x = Math.cos(a) * r * jagged;
      const y = Math.sin(a) * r * jagged;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    const shade = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.08, r * 0.15, r * 0.2, r * 1.05);
    shade.addColorStop(0, "#8b93a8");
    shade.addColorStop(0.4, "#4a5266");
    shade.addColorStop(0.78, "#2a3144");
    shade.addColorStop(1, "#141821");
    g.fillStyle = shade;
    g.fill();
    g.strokeStyle = "#a8b2c6";
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = "rgba(10,12,18,0.35)";
    const craters = r > 36 ? 5 : r > 22 ? 3 : 2;
    for (let i = 0; i < craters; i++) {
      const a = seed * 13 + i * 1.9;
      g.beginPath();
      g.ellipse(Math.cos(a) * r * 0.32, Math.sin(a) * r * 0.28, 2.2 + i * 0.9, 1.6 + i * 0.5, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "rgba(230,238,255,0.16)";
    g.beginPath();
    g.ellipse(-r * 0.28, -r * 0.32, r * 0.38, r * 0.18, -0.6, 0, Math.PI * 2);
    g.fill();
    const sprite = { c, dim };
    rockSprites.set(key, sprite);
    return sprite;
  }

  function drawAsteroid(a, s) {
    const spr = rockSprite(a.seed, a.r);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(a.rot);
    ctx.drawImage(spr.c, -spr.dim / 2, -spr.dim / 2);
    ctx.restore();
  }

  function drawShip(p, x, y, isMe) {
    const rgb = hexRgb(p.color);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(p.angle);
    if (p.lastHit > 0) {
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.fill();
    }
    if (p.riding) {
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(196,181,253,${0.4 + Math.sin(time * 12) * 0.2})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (p.shield > 0) {
      const pulse = 0.3 + Math.sin(time * 10) * 0.12;
      const sg = ctx.createRadialGradient(0, 0, 12, 0, 0, 27);
      sg.addColorStop(0, "transparent");
      sg.addColorStop(1, `rgba(94,234,255,${pulse})`);
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(0, 0, 27, 0, Math.PI * 2);
      ctx.fill();
    }
    const flame = p.boosting ? 34 + Math.random() * 14 : p.thrust ? 18 + Math.random() * 8 : 0;
    if (flame) {
      const fg = ctx.createLinearGradient(-8, 0, -8 - flame, 0);
      fg.addColorStop(0, p.boosting ? "#7af0ff" : "#ffe08a");
      fg.addColorStop(0.5, p.boosting ? "#3b82f6" : "#ff7a18");
      fg.addColorStop(1, "transparent");
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(-10, -6);
      ctx.lineTo(-12 - flame, 0);
      ctx.lineTo(-10, 6);
      ctx.fill();
    }
    ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.18)`;
    ctx.beginPath();
    ctx.moveTo(-6, -16);
    ctx.lineTo(4, -7);
    ctx.lineTo(-10, -4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-6, 16);
    ctx.lineTo(4, 7);
    ctx.lineTo(-10, 4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(-4, 9);
    ctx.lineTo(-14, 5);
    ctx.lineTo(-9, 0);
    ctx.lineTo(-14, -5);
    ctx.lineTo(-4, -9);
    ctx.closePath();
    const hull = ctx.createLinearGradient(-16, -10, 22, 8);
    hull.addColorStop(0, "#121826");
    hull.addColorStop(0.45, p.color);
    hull.addColorStop(1, "#f4fbff");
    ctx.fillStyle = hull;
    ctx.fill();
    ctx.fillStyle = "rgba(230,248,255,0.85)";
    ctx.beginPath();
    ctx.ellipse(6, 0, 6, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(8,12,20,0.55)";
    ctx.fillRect(-12, -2.2, 7, 4.4);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(-2, -8, 1.6, 0, Math.PI * 2);
    ctx.arc(-2, 8, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawTether(ax, ay, bx, by, color) {
    const mx = (ax + bx) / 2 + Math.sin(time * 9) * 8;
    const my = (ay + by) / 2 + Math.cos(time * 8) * 8;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(mx, my, bx, by);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();
  }

  function drawHollow(hollow, cam, world) {
    const nearHead = nearestScreen(hollow.segs[0].x, hollow.segs[0].y, null, cam, world);
    if (nearHead.x < -720 || nearHead.y < -720 || nearHead.x > w + 720 || nearHead.y > h + 720) return;
    const pts = [];
    let prev = null;
    for (const seg of hollow.segs) {
      const s = nearestScreen(seg.x, seg.y, prev, cam, world);
      pts.push({ ...s, r: seg.r, angle: seg.angle, node: seg.node, nodeHp: seg.nodeHp });
      prev = s;
    }
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = hollow.howl > 0 ? "rgba(244,114,182,0.7)" : "rgba(109,40,217,0.7)";
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#2a1050";
    ctx.strokeStyle = "rgba(196,181,253,0.5)";
    ctx.lineWidth = 1.2;
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (p.node && p.nodeHp > 0) {
        ctx.fillStyle = "#fb7185";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2a1050";
      }
    }
    const head = pts[0];
    const jaw = hollow.howl > 0 ? 0.62 : 0.32 + Math.sin(time * 2) * 0.04;
    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(hollow.segs[0].angle);
    ctx.fillStyle = "#1a0828";
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(head.r * 1.35, head.r * jaw);
    ctx.lineTo(head.r * 0.3, head.r * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(head.r * 1.35, -head.r * jaw);
    ctx.lineTo(head.r * 0.3, -head.r * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f8fafc";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(head.r * 0.7, side * 6);
      ctx.lineTo(head.r * 1.15, side * head.r * jaw * 0.7);
      ctx.lineTo(head.r * 0.72, side * 12);
      ctx.fill();
    }
    ctx.fillStyle = hollow.howl > 0 ? "#fb7185" : "#67e8f9";
    ctx.beginPath();
    ctx.ellipse(8, -11, 5, 3.4, 0.2, 0, Math.PI * 2);
    ctx.ellipse(8, 11, 5, 3.4, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  function drawGate(g, s) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(time * 1.6);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, 28 - i * 6, 16 + i * 3, i * 0.7, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(125,211,252,${0.55 - i * 0.12})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    const core = ctx.createRadialGradient(0, 0, 2, 0, 0, 18);
    core.addColorStop(0, "rgba(255,255,255,0.7)");
    core.addColorStop(1, "rgba(56,189,248,0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawMinimap(state, me) {
    if (!me) return;
    const size = 236;
    const pad = 14;
    const x = w - size - pad;
    const y = h - size - pad - 6;
    const cx = x + size / 2;
    const cy = y + size / 2;
    const world = state.world;
    const range = Math.max(world.w, world.h) * 0.5;
    const scale = (size / 2 - 22) / range;

    const rel = (wx, wy) => ({
      x: cx + wrapDelta(me.x, wx, world.w) * scale,
      y: cy + wrapDelta(me.y, wy, world.h) * scale,
    });

    ctx.save();
    ctx.fillStyle = "rgba(4,8,18,0.92)";
    ctx.strokeStyle = "rgba(94,234,255,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    roundRect(ctx, x, y, size, size, 14);
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    roundRect(ctx, x + 2, y + 2, size - 4, size - 4, 12);
    ctx.clip();

    ctx.strokeStyle = "rgba(148,163,184,0.16)";
    ctx.lineWidth = 1;
    for (const r of [0.33, 0.66, 1]) {
      ctx.beginPath();
      ctx.arc(cx, cy, (size / 2 - 22) * r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx, y + 8);
    ctx.lineTo(cx, y + size - 8);
    ctx.moveTo(x + 8, cy);
    ctx.lineTo(x + size - 8, cy);
    ctx.stroke();

    const rim = size / 2 - 16;
    ctx.strokeStyle = "rgba(94,234,255,0.85)";
    ctx.lineWidth = 2.4;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(me.angle) * 12, cy + Math.sin(me.angle) * 12);
    ctx.lineTo(cx + Math.cos(me.angle) * rim, cy + Math.sin(me.angle) * rim);
    ctx.stroke();
    ctx.setLineDash([]);
    const tipX = cx + Math.cos(me.angle) * (rim - 2);
    const tipY = cy + Math.sin(me.angle) * (rim - 2);
    ctx.fillStyle = "#5eeaff";
    ctx.beginPath();
    ctx.arc(tipX, tipY, 4, 0, Math.PI * 2);
    ctx.fill();

    const spd = Math.hypot(me.vx || 0, me.vy || 0);
    if (spd > 16) {
      const vx = (me.vx / spd) * Math.min(rim - 8, 18 + spd * 0.22);
      const vy = (me.vy / spd) * Math.min(rim - 8, 18 + spd * 0.22);
      ctx.strokeStyle = "rgba(253,224,71,0.9)";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + vx, cy + vy);
      ctx.stroke();
    }

    const ox = cx + wrapDelta(me.x, 0, world.w) * scale;
    const oy = cy + wrapDelta(me.y, 0, world.h) * scale;
    ctx.strokeStyle = "rgba(94,234,255,0.4)";
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(ox, oy, world.w * scale, world.h * scale);
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(148,163,184,0.5)";
    for (const a of state.asteroids) {
      const p = rel(a.x, a.y);
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
    ctx.fillStyle = "#67e8f9";
    for (const g of state.gates || []) {
      const p = rel(g.x, g.y);
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    if (state.hollow) {
      ctx.strokeStyle = "#c084fc";
      ctx.lineWidth = 3;
      ctx.beginPath();
      state.hollow.segs.forEach((seg, i) => {
        const p = rel(seg.x, seg.y);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }

    for (const p of state.players) {
      if (p.swallowed || !p.alive || p.id === me.id) continue;
      const m = rel(p.x, p.y);
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = "rgba(8,10,16,0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(-6, 6);
      ctx.lineTo(-6, -6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "rgba(8,10,16,0.7)";
      ctx.fillRect(m.x - 28, m.y - 20, 56, 13);
      ctx.fillStyle = p.color;
      ctx.font = "700 11px Rajdhani, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(p.name, m.x, m.y - 10);
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(me.angle);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#5eeaff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(-8, 7);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-8, -7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    ctx.font = "800 11px Rajdhani, sans-serif";
    ctx.fillStyle = "#7dd3fc";
    ctx.textAlign = "left";
    ctx.fillText("RADAR  ·  you are center", x + 10, y + 16);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "600 10px Rajdhani, sans-serif";
    ctx.fillText("cyan course  ·  yellow drift  ·  box = map edge", x + 10, y + size - 8);
    ctx.restore();
  }

  function drawOffscreen(state, me, cam, world) {
    if (!me) return;
    const pad = 28;
    for (const p of state.players) {
      if (p.id === me.id || !p.alive || p.swallowed) continue;
      const s = worldToScreen(p.x, p.y, cam, world);
      const on = s.x > 40 && s.x < w - 40 && s.y > 40 && s.y < h - 40;
      if (on) continue;
      const dx = wrapDelta(me.x, p.x, world.w);
      const dy = wrapDelta(me.y, p.y, world.h);
      const ang = Math.atan2(dy, dx);
      const radarPad = 260;
      let edgeX = Math.max(pad, Math.min(w - pad, w / 2 + Math.cos(ang) * (w * 0.42)));
      let edgeY = Math.max(pad + 50, Math.min(h - pad - 80, h / 2 + Math.sin(ang) * (h * 0.38)));
      if (edgeX > w - radarPad && edgeY > h - radarPad) {
        edgeX = w - radarPad - 8;
        edgeY = Math.min(edgeY, h - radarPad - 8);
      }
      ctx.save();
      ctx.translate(edgeX, edgeY);
      ctx.rotate(ang);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-8, 8);
      ctx.lineTo(-8, -8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = p.color;
      ctx.font = "700 12px Rajdhani, sans-serif";
      ctx.textAlign = "center";
      const dist = Math.round(Math.hypot(dx, dy));
      ctx.fillText(`${p.name}  ${dist}m`, edgeX, edgeY - 16);
    }
  }

  function drawBounds(cam, world) {
    ctx.save();
    ctx.setLineDash([8, 10]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(94,234,255,0.28)";
    for (const ox of [-world.w, 0, world.w]) {
      for (const oy of [-world.h, 0, world.h]) {
        const x0 = ox - cam.x + shake.x;
        const y0 = oy - cam.y + shake.y;
        if (x0 > w + 4 || y0 > h + 4 || x0 + world.w < -4 || y0 + world.h < -4) continue;
        ctx.strokeRect(x0, y0, world.w, world.h);
      }
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(125,211,252,0.08)";
    ctx.lineWidth = 1;
    const step = 400;
    const gx = Math.floor(cam.x / step) * step;
    const gy = Math.floor(cam.y / step) * step;
    ctx.beginPath();
    for (let x = gx - step; x < cam.x + w + step; x += step) {
      const sx = wrapToView(x - cam.x + shake.x, w / 2, world.w);
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
    }
    for (let y = gy - step; y < cam.y + h + step; y += step) {
      const sy = wrapToView(y - cam.y + shake.y, h / 2, world.h);
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
    }
    ctx.stroke();
    ctx.restore();
  }

  function roundRect(c, x, y, rw, rh, r) {
    c.moveTo(x + r, y);
    c.arcTo(x + rw, y, x + rw, y + rh, r);
    c.arcTo(x + rw, y + rh, x, y + rh, r);
    c.arcTo(x, y + rh, x, y, r);
    c.arcTo(x, y, x + rw, y, r);
  }

  function stepParticles(dt, cam, world) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      const s = worldToScreen(p.x, p.y, cam, world);
      ctx.globalAlpha = p.life / p.max;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function draw(state, meId, dt) {
    time += dt;
    shake.mag *= 0.86;
    shake.x = (Math.random() - 0.5) * shake.mag;
    shake.y = (Math.random() - 0.5) * shake.mag;

    if (backdrop) ctx.drawImage(backdrop, 0, 0);
    else {
      ctx.fillStyle = "#050814";
      ctx.fillRect(0, 0, w, h);
    }
    if (!state || !state.world) return;

    const me = state.players.find((p) => p.id === meId) || state.players[0];
    const cam = cameraFor(me, state.world, dt);

    if (state.howl > 0) {
      ctx.fillStyle = "rgba(40,8,24,0.28)";
      ctx.fillRect(0, 0, w, h);
    }

    ctx.fillStyle = "rgba(220,235,255,0.82)";
    for (const s of stars) {
      const px = (s.x + w - ((cam.x * s.z * 0.04) % w) + w) % w;
      const py = (s.y + h - ((cam.y * s.z * 0.04) % h) + h) % h;
      ctx.fillRect(px, py, s.z, s.z);
    }

    drawBounds(cam, state.world);

    if (state.howl > 0) {
      addShake(0.35);
      ctx.fillStyle = "rgba(150,20,90,0.08)";
      ctx.fillRect(0, 0, w, h);
    }

    for (const g of state.gates || []) drawGate(g, worldToScreen(g.x, g.y, cam, state.world));
    if (state.hollow) drawHollow(state.hollow, cam, state.world);

    for (const a of state.asteroids) {
      const s = worldToScreen(a.x, a.y, cam, state.world);
      if (s.x < -90 || s.y < -90 || s.x > w + 90 || s.y > h + 90) continue;
      drawAsteroid(a, s);
    }

    ctx.fillStyle = "#ffe14d";
    for (const sc of state.scraps || []) {
      const s = worldToScreen(sc.x, sc.y, cam, state.world);
      if (s.x < -20 || s.y < -20 || s.x > w + 20 || s.y > h + 20) continue;
      ctx.fillRect(s.x - 3, s.y - 3, 6, 6);
    }

    const powerColors = { shield: "#5eeaff", rapid: "#ffe14d", multi: "#ff4d8d", repair: "#7dff6b" };
    for (const p of state.powerups) {
      const s = worldToScreen(p.x, p.y, cam, state.world);
      ctx.strokeStyle = powerColors[p.kind] || "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(s.x - 8, s.y - 8, 16, 16);
    }

    for (const b of state.bullets) {
      const s = worldToScreen(b.x, b.y, cam, state.world);
      if (s.x < -30 || s.y < -30 || s.x > w + 30 || s.y > h + 30) continue;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(b.angle || 0);
      ctx.fillStyle = b.kind === "missile" ? "#fff7ed" : b.color;
      ctx.fillRect(b.kind === "missile" ? -10 : -12, -1.5, b.kind === "missile" ? 18 : 20, 3);
      ctx.restore();
    }

    for (const p of state.players) {
      if (p.grapple && p.grapple.on) {
        const a = worldToScreen(p.x, p.y, cam, state.world);
        const b = worldToScreen(p.grapple.tx, p.grapple.ty, cam, state.world);
        drawTether(a.x, a.y, b.x, b.y, p.color);
      }
    }

    for (const p of state.players) {
      if (!p.alive || p.swallowed) continue;
      const s = worldToScreen(p.x, p.y, cam, state.world);
      drawShip(p, s.x, s.y, p.id === meId);
      ctx.textAlign = "center";
      ctx.font = "700 13px Rajdhani, sans-serif";
      ctx.fillStyle = "rgba(8,10,16,0.55)";
      ctx.fillRect(s.x - 34, s.y - 42, 68, 16);
      ctx.fillStyle = "#e8f4ff";
      ctx.fillText(p.riding ? `${p.name} RIDING` : p.name, s.x, s.y - 30);
      const ratio = p.health / (p.maxHealth || 100);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(s.x - 18, s.y + 24, 36, 4);
      ctx.fillStyle = ratio > 0.4 ? p.color : "#fb7185";
      ctx.fillRect(s.x - 18, s.y + 24, 36 * ratio, 4);
    }

    stepParticles(dt, cam, state.world);

    if (me && me.lastHit > 0) {
      ctx.fillStyle = `rgba(255,50,70,${me.lastHit * 0.28})`;
      ctx.fillRect(0, 0, w, h);
    }

    drawOffscreen(state, me, cam, state.world);
    drawMinimap(state, me);
  }

  window.addEventListener("resize", resize);
  resize();

  return { draw, drawMenuStars, addExplosion, addShake, resize, wrapDelta, ingestImpacts };
})();
