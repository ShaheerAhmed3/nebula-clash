const Renderer = (() => {
  const starsCanvas = document.getElementById("stars");
  const starsCtx = starsCanvas.getContext("2d");
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const stars = [];
  let w = 0;
  let h = 0;
  let time = 0;
  const shake = { x: 0, y: 0, mag: 0 };
  const explosions = [];

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    for (const c of [starsCanvas, canvas]) {
      c.width = w * devicePixelRatio;
      c.height = h * devicePixelRatio;
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      c.getContext("2d").setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }
    if (!stars.length) seedStars();
  }

  function seedStars() {
    stars.length = 0;
    for (let i = 0; i < 180; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        z: Math.random() * 3 + 0.3,
        a: Math.random(),
      });
    }
  }

  function drawMenuStars(dt) {
    time += dt;
    starsCtx.fillStyle = "#05070f";
    starsCtx.fillRect(0, 0, w, h);
    const g = starsCtx.createRadialGradient(w * 0.5, h * 0.35, 20, w * 0.5, h * 0.4, 480);
    g.addColorStop(0, "rgba(50, 80, 160, 0.18)");
    g.addColorStop(1, "transparent");
    starsCtx.fillStyle = g;
    starsCtx.fillRect(0, 0, w, h);
    for (const s of stars) {
      s.y += s.z * 8 * dt;
      if (s.y > h) s.y = 0;
      starsCtx.fillStyle = `rgba(210,230,255,${0.25 + s.a * 0.6})`;
      starsCtx.fillRect(s.x, s.y, s.z, s.z);
    }
    drawMenuHollow(starsCtx, dt);
  }

  function drawMenuHollow(c, dt) {
    const baseY = h * 0.78;
    const t = time;
    c.save();
    c.globalAlpha = 0.55;
    for (let i = 0; i < 18; i++) {
      const x = ((t * 46 + i * 34) % (w + 160)) - 80;
      const y = baseY + Math.sin(t * 1.4 + i * 0.45) * 18;
      const r = i === 0 ? 16 : Math.max(5, 12 - i * 0.4);
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fillStyle = i === 0 ? "#7b5cff" : `rgba(123,92,255,${0.55 - i * 0.02})`;
      c.shadowColor = "#7b5cff";
      c.shadowBlur = 16;
      c.fill();
    }
    c.restore();
  }

  function addExplosion(x, y, color) {
    explosions.push({ x, y, color, t: 0, life: 0.45 });
    shake.mag = Math.min(12, shake.mag + 5);
  }

  function addShake(n) {
    shake.mag = Math.min(16, shake.mag + n);
  }

  function wrapDelta(a, b, max) {
    let d = b - a;
    if (d > max / 2) d -= max;
    if (d < -max / 2) d += max;
    return d;
  }

  function cameraFor(me, world) {
    if (!me || !world) return { x: 0, y: 0 };
    return { x: me.x - w / 2, y: me.y - h / 2 };
  }

  function worldToScreen(wx, wy, cam, world) {
    let x = wx - cam.x + shake.x;
    let y = wy - cam.y + shake.y;
    if (world) {
      if (x < -200) x += world.w;
      if (x > w + 200) x -= world.w;
      if (y < -200) y += world.h;
      if (y > h + 200) y -= world.h;
    }
    return { x, y };
  }

  function asteroidPath(seed, r) {
    const pts = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const jagged = 0.72 + ((Math.sin(seed * 40 + i * 3.1) + 1) / 2) * 0.4;
      pts.push([Math.cos(a) * r * jagged, Math.sin(a) * r * jagged]);
    }
    return pts;
  }

  function drawShip(x, y, angle, color, thrust, shield, isMe, riding) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    if (riding) {
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(196,181,253,${0.45 + Math.sin(time * 12) * 0.2})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (shield > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(94,234,255,${0.35 + Math.sin(time * 10) * 0.15})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (thrust) {
      ctx.beginPath();
      ctx.moveTo(-10, -5);
      ctx.lineTo(-22 - Math.random() * 8, 0);
      ctx.lineTo(-10, 5);
      ctx.fillStyle = "#ffb347";
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-14, 11);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-14, -11);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = isMe ? 18 : 10;
    ctx.fill();
    ctx.restore();
  }

  function drawMinimap(state, me) {
    const size = 148;
    const pad = 16;
    const x = w - size - pad;
    const y = h - size - pad - 18;
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = "rgba(6,10,22,0.7)";
    ctx.strokeStyle = "rgba(94,234,255,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    roundRect(ctx, x, y, size, size, 12);
    ctx.fill();
    ctx.stroke();
    const sx = size / state.world.w;
    const sy = size / state.world.h;
    for (const a of state.asteroids) {
      ctx.fillStyle = "rgba(180,190,210,0.45)";
      ctx.fillRect(x + a.x * sx, y + a.y * sy, 2, 2);
    }
    if (state.hollow) {
      ctx.strokeStyle = "rgba(167,139,250,0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      state.hollow.segs.forEach((seg, i) => {
        const px = x + seg.x * sx;
        const py = y + seg.y * sy;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }
    for (const p of state.players) {
      if (p.swallowed) continue;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x + p.x * sx, y + p.y * sy, p.id === me?.id ? 3.4 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function roundRect(c, x, y, rw, rh, r) {
    c.moveTo(x + r, y);
    c.arcTo(x + rw, y, x + rw, y + rh, r);
    c.arcTo(x + rw, y + rh, x, y + rh, r);
    c.arcTo(x, y + rh, x, y, r);
    c.arcTo(x, y, x + rw, y, r);
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

  function drawTether(ax, ay, bx, by, color) {
    const mx = (ax + bx) / 2 + Math.sin(time * 8) * 6;
    const my = (ay + by) / 2 + Math.cos(time * 7) * 6;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(mx, my, bx, by);
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function drawHollow(hollow, cam, world) {
    const pts = [];
    let prev = null;
    for (const seg of hollow.segs) {
      const s = nearestScreen(seg.x, seg.y, prev, cam, world);
      pts.push({ ...s, r: seg.r, angle: seg.angle });
      prev = s;
    }
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = hollow.howl > 0 ? "rgba(232,121,249,0.9)" : "rgba(139,92,246,0.85)";
    ctx.shadowColor = "#a78bfa";
    ctx.shadowBlur = hollow.howl > 0 ? 28 : 16;
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      const pulse = 1 + Math.sin(time * 4 + i * 0.4) * 0.08;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * pulse, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? "#1b1033" : `rgba(28, 16, 58, ${0.95 - i * 0.02})`;
      ctx.fill();
      ctx.strokeStyle = i % 3 === 0 ? "#c4b5fd" : "#7c3aed";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      if (i > 0 && i % 2 === 0) {
        ctx.fillStyle = `rgba(94,234,255,${0.35 + Math.sin(time * 6 + i) * 0.2})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const head = pts[0];
    const jaw = hollow.howl > 0 ? 0.55 : 0.28;
    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(hollow.segs[0].angle);
    ctx.fillStyle = "#14081f";
    ctx.beginPath();
    ctx.moveTo(head.r * 0.2, 0);
    ctx.lineTo(head.r * 1.15, head.r * jaw);
    ctx.lineTo(head.r * 0.4, head.r * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(head.r * 0.2, 0);
    ctx.lineTo(head.r * 1.15, -head.r * jaw);
    ctx.lineTo(head.r * 0.4, -head.r * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = hollow.howl > 0 ? "#fb7185" : "#5eeaff";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(6, -10, 4, 0, Math.PI * 2);
    ctx.arc(6, 10, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  function draw(state, meId, dt) {
    time += dt;
    shake.mag *= 0.86;
    shake.x = (Math.random() - 0.5) * shake.mag;
    shake.y = (Math.random() - 0.5) * shake.mag;

    ctx.fillStyle = "#04060d";
    ctx.fillRect(0, 0, w, h);

    if (!state || !state.world) return;
    const me = state.players.find((p) => p.id === meId) || state.players[0];
    const cam = cameraFor(me, state.world);

    for (const s of stars) {
      const px = ((s.x + w - (cam.x * s.z * 0.04) % w) % w);
      const py = ((s.y + h - (cam.y * s.z * 0.04) % h) % h);
      ctx.fillStyle = `rgba(210,230,255,${0.2 + s.a * 0.7})`;
      ctx.fillRect(px, py, s.z, s.z);
    }

    const nebula = ctx.createRadialGradient(w * 0.7, h * 0.25, 10, w * 0.7, h * 0.25, 380);
    nebula.addColorStop(0, state.howl > 0 ? "rgba(160, 40, 180, 0.28)" : "rgba(90, 40, 140, 0.16)");
    nebula.addColorStop(1, "transparent");
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, w, h);

    if (state.howl > 0) {
      addShake(0.45);
      ctx.fillStyle = `rgba(120, 30, 160, ${0.08 + Math.sin(time * 18) * 0.04})`;
      ctx.fillRect(0, 0, w, h);
    }

    if (state.hollow) drawHollow(state.hollow, cam, state.world);

    for (const a of state.asteroids) {
      const s = worldToScreen(a.x, a.y, cam, state.world);
      if (s.x < -80 || s.y < -80 || s.x > w + 80 || s.y > h + 80) continue;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(a.rot);
      ctx.beginPath();
      const pts = asteroidPath(a.seed, a.r);
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts) ctx.lineTo(p[0], p[1]);
      ctx.closePath();
      ctx.fillStyle = "#1b2436";
      ctx.strokeStyle = "#8ea0bf";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    const powerColors = { shield: "#5eeaff", rapid: "#ffe14d", multi: "#ff4d8d", repair: "#7dff6b" };
    for (const p of state.powerups) {
      const s = worldToScreen(p.x, p.y, cam, state.world);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(time * 2);
      ctx.strokeStyle = powerColors[p.kind] || "#fff";
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 12;
      ctx.strokeRect(-8, -8, 16, 16);
      ctx.restore();
    }

    for (const b of state.bullets) {
      const s = worldToScreen(b.x, b.y, cam, state.world);
      ctx.fillStyle = b.color;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
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
      drawShip(s.x, s.y, p.angle, p.color, p.thrust, p.shield, p.id === meId, p.riding);
      ctx.fillStyle = "#d6e6ff";
      ctx.font = "12px Rajdhani, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(p.riding ? `${p.name}  ·  RIDING` : p.name, s.x, s.y - 28);
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(s.x - 16, s.y + 22, 32, 3);
      ctx.fillStyle = p.color;
      ctx.fillRect(s.x - 16, s.y + 22, 32 * (p.health / 100), 3);
    }

    for (let i = explosions.length - 1; i >= 0; i--) {
      const e = explosions[i];
      e.t += dt;
      const s = worldToScreen(e.x, e.y, cam, state.world);
      const k = e.t / e.life;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 8 + k * 40, 0, Math.PI * 2);
      ctx.strokeStyle = e.color;
      ctx.globalAlpha = 1 - k;
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (e.t >= e.life) explosions.splice(i, 1);
    }

    drawMinimap(state, me);
  }

  window.addEventListener("resize", resize);
  resize();

  return { draw, drawMenuStars, addExplosion, addShake, resize, wrapDelta };
})();
