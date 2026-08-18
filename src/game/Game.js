const {
  SHIP_COLORS,
  CONSTANTS: C,
  wrap,
  wrapDelta,
  clamp,
  randRange,
} = require("./constants");

function now() {
  return Date.now();
}

function blankGrapple() {
  return {
    on: false,
    kind: null,
    targetId: null,
    seg: 0,
    life: 0,
    tx: 0,
    ty: 0,
  };
}

function playerDefaults(extra = {}) {
  return {
    vx: 0,
    vy: 0,
    health: C.SHIP_MAX_HEALTH,
    alive: true,
    shield: 0,
    rapid: 0,
    multi: 0,
    cooldown: 0,
    thrust: false,
    respawnAt: 0,
    hookCd: 0,
    hookHeld: false,
    riding: false,
    swallowed: false,
    swallowT: 0,
    grapple: blankGrapple(),
    input: { left: false, right: false, thrust: false, fire: false, grapple: false },
    lastSeq: 0,
    ...extra,
  };
}

class Game {
  constructor(code, hostId) {
    this.code = code;
    this.hostId = hostId;
    this.phase = "lobby";
    this.players = new Map();
    this.bullets = [];
    this.asteroids = [];
    this.powerups = [];
    this.kills = [];
    this.events = [];
    this.roundEndsAt = 0;
    this.startedAt = 0;
    this.powerupTimer = 0;
    this.tick = 0;
    this.winner = null;
    this.colorCursor = 0;
    this.hollow = null;
    this.howlT = 0;
    this.howlCd = C.HOWL_EVERY;
  }

  addPlayer(id, name) {
    if (this.players.size >= C.MAX_PLAYERS) return { error: "Room is full (8 players)." };
    const taken = [...this.players.values()].some(
      (p) => p.name.toLowerCase() === name.toLowerCase()
    );
    if (taken) return { error: "That callsign is already in this room." };

    const color = SHIP_COLORS[this.colorCursor % SHIP_COLORS.length];
    this.colorCursor += 1;
    const spawn = this.safeSpawn();
    this.players.set(id, playerDefaults({
      id,
      name: name.slice(0, 16),
      color,
      x: spawn.x,
      y: spawn.y,
      angle: spawn.angle,
      score: 0,
      kills: 0,
      deaths: 0,
    }));
    if (!this.hostId) this.hostId = id;
    return { ok: true };
  }

  removePlayer(id) {
    this.players.delete(id);
    if (this.hostId === id) {
      this.hostId = this.players.size ? [...this.players.keys()][0] : null;
    }
  }

  setInput(id, input, seq = 0) {
    const p = this.players.get(id);
    if (!p) return;
    if (seq < p.lastSeq) return;
    p.lastSeq = seq;
    p.input = {
      left: !!input.left,
      right: !!input.right,
      thrust: !!input.thrust,
      fire: !!input.fire,
      grapple: !!input.grapple,
    };
  }

  start(byId) {
    if (byId !== this.hostId) return { error: "Only the host can launch." };
    if (this.phase === "playing") return { error: "Already in flight." };
    if (this.players.size < 1) return { error: "Need at least one pilot." };
    this.phase = "playing";
    this.startedAt = now();
    this.roundEndsAt = this.startedAt + C.ROUND_MS;
    this.winner = null;
    this.bullets = [];
    this.powerups = [];
    this.kills = [];
    this.events = [];
    this.tick = 0;
    this.powerupTimer = C.POWERUP_INTERVAL;
    this.howlT = 0;
    this.howlCd = C.HOWL_EVERY;
    for (const p of this.players.values()) {
      const spawn = this.safeSpawn();
      Object.assign(p, playerDefaults({
        id: p.id,
        name: p.name,
        color: p.color,
        x: spawn.x,
        y: spawn.y,
        angle: spawn.angle,
        score: 0,
        kills: 0,
        deaths: 0,
      }));
    }
    this.asteroids = [];
    this.spawnAsteroidField();
    this.spawnHollow();
    this.pushEvent("howl", "THE HOLLOW WAKES");
    return { ok: true };
  }

  spawnHollow() {
    const hx = randRange(400, C.WORLD_W - 400);
    const hy = randRange(400, C.WORLD_H - 400);
    const heading = Math.random() * Math.PI * 2;
    const segs = [];
    for (let i = 0; i < C.HOLLOW_SEGS; i++) {
      const r = i === 0 ? C.HOLLOW_HEAD_R : Math.max(12, 28 - i * 0.55);
      segs.push({
        x: wrap(hx - Math.cos(heading) * i * C.HOLLOW_SPACING, C.WORLD_W),
        y: wrap(hy - Math.sin(heading) * i * C.HOLLOW_SPACING, C.WORLD_H),
        r,
        angle: heading,
      });
    }
    this.hollow = { segs, heading, turn: 0 };
  }

  safeSpawn() {
    for (let i = 0; i < 24; i++) {
      const x = randRange(180, C.WORLD_W - 180);
      const y = randRange(180, C.WORLD_H - 180);
      let clear = true;
      for (const other of this.players.values()) {
        if (!other.alive) continue;
        if (this.sep2(x, y, other.x, other.y) < 220 * 220) {
          clear = false;
          break;
        }
      }
      if (this.hollow) {
        const head = this.hollow.segs[0];
        if (this.sep2(x, y, head.x, head.y) < 280 * 280) clear = false;
      }
      if (clear) return { x, y, angle: Math.random() * Math.PI * 2 };
    }
    return {
      x: randRange(200, C.WORLD_W - 200),
      y: randRange(200, C.WORLD_H - 200),
      angle: Math.random() * Math.PI * 2,
    };
  }

  sep2(ax, ay, bx, by) {
    const dx = wrapDelta(ax, bx, C.WORLD_W);
    const dy = wrapDelta(ay, by, C.WORLD_H);
    return dx * dx + dy * dy;
  }

  spawnAsteroidField() {
    for (let i = 0; i < C.ASTEROID_SPAWN; i++) {
      this.asteroids.push(this.makeAsteroid("large", randRange(0, C.WORLD_W), randRange(0, C.WORLD_H)));
    }
  }

  makeAsteroid(size, x, y, extraSpeed = 0) {
    const radii = { large: 46, medium: 28, small: 16 };
    const hp = { large: 3, medium: 2, small: 1 };
    const speed = (size === "large" ? randRange(28, 70) : size === "medium" ? randRange(50, 110) : randRange(70, 150)) + extraSpeed;
    const a = Math.random() * Math.PI * 2;
    return {
      id: `a${this.tick}-${Math.random().toString(36).slice(2, 8)}`,
      size,
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      r: radii[size],
      hp: hp[size],
      rot: Math.random() * Math.PI * 2,
      spin: randRange(-1.4, 1.4),
      seed: Math.random(),
    };
  }

  spawnPowerup() {
    const kinds = ["shield", "rapid", "multi", "repair"];
    this.powerups.push({
      id: `p${this.tick}-${Math.random().toString(36).slice(2, 7)}`,
      kind: kinds[Math.floor(Math.random() * kinds.length)],
      x: randRange(160, C.WORLD_W - 160),
      y: randRange(160, C.WORLD_H - 160),
      life: C.POWERUP_LIFE,
    });
  }

  pushEvent(kind, text) {
    this.events.unshift({ id: `${this.tick}-${kind}`, kind, text, at: now() });
    this.events = this.events.slice(0, 10);
  }

  step(dt) {
    if (this.phase !== "playing") return this.publicState();
    this.tick += 1;

    if (now() >= this.roundEndsAt) {
      this.finishRound();
      return this.publicState();
    }

    this.powerupTimer -= dt;
    if (this.powerupTimer <= 0 && this.powerups.length < 5) {
      this.spawnPowerup();
      this.powerupTimer = C.POWERUP_INTERVAL + Math.random() * 4;
    }

    this.stepHollow(dt);
    for (const p of this.players.values()) this.stepPlayer(p, dt);
    this.stepBullets(dt);
    this.stepAsteroids(dt);
    this.stepPowerups(dt);
    this.collide();
    this.maintainAsteroids();

    return this.publicState();
  }

  stepHollow(dt) {
    if (!this.hollow) this.spawnHollow();
    const h = this.hollow;
    this.howlCd -= dt;
    if (this.howlT > 0) this.howlT = Math.max(0, this.howlT - dt);
    if (this.howlCd <= 0) {
      this.howlT = C.HOWL_LIFE;
      this.howlCd = C.HOWL_EVERY + randRange(-4, 6);
      this.pushEvent("howl", "THE HOLLOW HOWLS");
    }

    h.turn += dt * (this.howlT > 0 ? 2.4 : 1.1);
    h.heading += Math.sin(h.turn * 0.7) * 1.6 * dt + Math.sin(h.turn * 2.1) * 0.5 * dt;
    const speed = this.howlT > 0 ? C.HOLLOW_SPEED * 1.35 : C.HOLLOW_SPEED;
    const head = h.segs[0];
    head.x = wrap(head.x + Math.cos(h.heading) * speed * dt, C.WORLD_W);
    head.y = wrap(head.y + Math.sin(h.heading) * speed * dt, C.WORLD_H);
    head.angle = h.heading;

    for (let i = 1; i < h.segs.length; i++) {
      const prev = h.segs[i - 1];
      const seg = h.segs[i];
      const dx = wrapDelta(seg.x, prev.x, C.WORLD_W);
      const dy = wrapDelta(seg.y, prev.y, C.WORLD_H);
      const dist = Math.hypot(dx, dy) || 0.001;
      const spacing = C.HOLLOW_SPACING;
      if (dist > spacing) {
        seg.x = wrap(prev.x - (dx / dist) * spacing, C.WORLD_W);
        seg.y = wrap(prev.y - (dy / dist) * spacing, C.WORLD_H);
      }
      seg.angle = Math.atan2(dy, dx);
    }

    if (this.howlT > 0) this.applyHowl(dt);

    this.asteroids = this.asteroids.filter((a) => {
      if (this.sep2(a.x, a.y, head.x, head.y) < (head.r + a.r * 0.6) ** 2) return false;
      return true;
    });
  }

  applyHowl(dt) {
    const head = this.hollow.segs[0];
    const pull = 420;
    const tug = (obj) => {
      const dx = wrapDelta(obj.x, head.x, C.WORLD_W);
      const dy = wrapDelta(obj.y, head.y, C.WORLD_H);
      const d = Math.hypot(dx, dy) || 1;
      obj.vx += (dx / d) * pull * dt;
      obj.vy += (dy / d) * pull * dt;
    };
    for (const p of this.players.values()) {
      if (p.alive && !p.swallowed && !p.riding) tug(p);
    }
    for (const a of this.asteroids) tug(a);
    for (const b of this.bullets) tug(b);
  }

  stepPlayer(p, dt) {
    if (!p.alive) {
      this.releaseHook(p);
      if (p.respawnAt && now() >= p.respawnAt) this.respawn(p);
      return;
    }

    if (p.swallowed) {
      this.stepSwallowed(p, dt);
      return;
    }

    p.shield = Math.max(0, p.shield - dt);
    p.rapid = Math.max(0, p.rapid - dt);
    p.multi = Math.max(0, p.multi - dt);
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.hookCd = Math.max(0, p.hookCd - dt);

    const pressed = p.input.grapple && !p.hookHeld;
    p.hookHeld = !!p.input.grapple;
    if (pressed) {
      if (p.grapple.on) this.releaseHook(p);
      else this.fireHook(p);
    }

    if (p.grapple.on) this.stepGrapple(p, dt);

    if (p.input.left) p.angle -= C.SHIP_ROTATE * dt;
    if (p.input.right) p.angle += C.SHIP_ROTATE * dt;
    p.thrust = !!p.input.thrust;

    if (!p.riding && p.thrust) {
      p.vx += Math.cos(p.angle) * C.SHIP_THRUST * dt;
      p.vy += Math.sin(p.angle) * C.SHIP_THRUST * dt;
    }

    const cap = p.grapple.on || p.riding ? C.SHIP_MAX_SPEED * 1.55 : C.SHIP_MAX_SPEED;
    const spd = Math.hypot(p.vx, p.vy);
    if (spd > cap) {
      p.vx = (p.vx / spd) * cap;
      p.vy = (p.vy / spd) * cap;
    }

    if (!p.riding) {
      const drag = Math.pow(C.SHIP_DRAG, dt * 60);
      p.vx *= drag;
      p.vy *= drag;
      p.x = wrap(p.x + p.vx * dt, C.WORLD_W);
      p.y = wrap(p.y + p.vy * dt, C.WORLD_H);
    }

    if (p.input.fire && p.cooldown <= 0) {
      this.fire(p);
      p.cooldown = p.rapid > 0 ? C.RAPID_COOLDOWN : C.FIRE_COOLDOWN;
    }

    this.trySwallow(p);
  }

  fireHook(p) {
    if (p.hookCd > 0 || p.swallowed) return;
    const hit = this.rayGrapple(p.id, p.x, p.y, p.angle, C.GRAPPLE_RANGE);
    if (!hit) {
      p.hookCd = 0.22;
      return;
    }
    p.grapple = {
      on: true,
      kind: hit.kind,
      targetId: hit.id,
      seg: hit.seg || 0,
      life: hit.kind === "hollow" ? C.RIDE_MAX : C.GRAPPLE_MAX,
      tx: hit.x,
      ty: hit.y,
    };
    p.riding = hit.kind === "hollow";
    if (hit.kind === "player") {
      const prey = this.players.get(hit.id);
      if (prey) {
        prey.score = Math.max(0, prey.score);
        this.pushEvent("yoink", `${p.name} hooked ${prey.name}`);
        p.score += C.HOOK_SCORE;
      }
    } else if (hit.kind === "hollow") {
      this.pushEvent("ride", `${p.name} mounted The Hollow`);
      p.score += C.RIDE_SCORE;
    }
  }

  rayGrapple(ownerId, px, py, angle, range) {
    const steps = 20;
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * range;
      const x = wrap(px + Math.cos(angle) * t, C.WORLD_W);
      const y = wrap(py + Math.sin(angle) * t, C.WORLD_H);
      for (const other of this.players.values()) {
        if (other.id === ownerId || !other.alive || other.swallowed) continue;
        if (this.sep2(x, y, other.x, other.y) <= (C.SHIP_RADIUS + 14) ** 2) {
          return { kind: "player", id: other.id, x: other.x, y: other.y };
        }
      }
      for (const a of this.asteroids) {
        if (this.sep2(x, y, a.x, a.y) <= (a.r + 8) ** 2) {
          return { kind: "asteroid", id: a.id, x: a.x, y: a.y };
        }
      }
      if (this.hollow) {
        for (let s = 0; s < this.hollow.segs.length; s++) {
          const seg = this.hollow.segs[s];
          if (this.sep2(x, y, seg.x, seg.y) <= (seg.r + 10) ** 2) {
            return { kind: "hollow", id: "hollow", seg: s, x: seg.x, y: seg.y };
          }
        }
      }
    }
    return null;
  }

  stepGrapple(p, dt) {
    p.grapple.life -= dt;
    const target = this.grappleTarget(p);
    if (!target || p.grapple.life <= 0) {
      this.releaseHook(p);
      return;
    }
    p.grapple.tx = target.x;
    p.grapple.ty = target.y;

    if (p.grapple.kind === "hollow") {
      const seg = this.hollow.segs[p.grapple.seg] || this.hollow.segs[0];
      const offset = seg.r + 18;
      const side = p.grapple.seg % 2 === 0 ? 1 : -1;
      const nx = -Math.sin(seg.angle) * side;
      const ny = Math.cos(seg.angle) * side;
      p.x = wrap(seg.x + nx * offset, C.WORLD_W);
      p.y = wrap(seg.y + ny * offset, C.WORLD_H);
      p.vx = Math.cos(seg.angle) * C.HOLLOW_SPEED;
      p.vy = Math.sin(seg.angle) * C.HOLLOW_SPEED;
      p.riding = true;
      return;
    }

    const dx = wrapDelta(p.x, target.x, C.WORLD_W);
    const dy = wrapDelta(p.y, target.y, C.WORLD_H);
    const dist = Math.hypot(dx, dy) || 1;
    const rest = p.grapple.kind === "asteroid" ? 70 : 90;
    const pull = (dist - rest) * 9.5;
    p.vx += (dx / dist) * pull * dt;
    p.vy += (dy / dist) * pull * dt;

    if (p.grapple.kind === "player") {
      const prey = this.players.get(p.grapple.targetId);
      if (prey && prey.alive && !prey.swallowed && !prey.riding) {
        prey.vx -= (dx / dist) * pull * 1.15 * dt;
        prey.vy -= (dy / dist) * pull * 1.15 * dt;
      }
    } else if (p.grapple.kind === "asteroid") {
      const a = this.asteroids.find((x) => x.id === p.grapple.targetId);
      if (a) {
        a.vx -= (dx / dist) * pull * 0.18 * dt;
        a.vy -= (dy / dist) * pull * 0.18 * dt;
      }
    }
  }

  grappleTarget(p) {
    if (p.grapple.kind === "player") {
      const o = this.players.get(p.grapple.targetId);
      if (!o || !o.alive) return null;
      return o;
    }
    if (p.grapple.kind === "asteroid") {
      return this.asteroids.find((a) => a.id === p.grapple.targetId) || null;
    }
    if (p.grapple.kind === "hollow" && this.hollow) {
      return this.hollow.segs[p.grapple.seg] || this.hollow.segs[0];
    }
    return null;
  }

  releaseHook(p) {
    if (p.riding && this.hollow) {
      const seg = this.hollow.segs[p.grapple.seg] || this.hollow.segs[0];
      p.vx += Math.cos(seg.angle) * 220;
      p.vy += Math.sin(seg.angle) * 220;
    }
    p.riding = false;
    p.grapple = blankGrapple();
    p.hookCd = C.GRAPPLE_COOLDOWN;
  }

  trySwallow(p) {
    if (!this.hollow || p.riding || p.swallowed) return;
    const head = this.hollow.segs[0];
    const dx = wrapDelta(head.x, p.x, C.WORLD_W);
    const dy = wrapDelta(head.y, p.y, C.WORLD_H);
    const dist = Math.hypot(dx, dy);
    const facing = Math.cos(head.angle) * (dx / (dist || 1)) + Math.sin(head.angle) * (dy / (dist || 1));
    const hungry = this.howlT > 0 ? 1.25 : 1;
    if (dist < head.r * 1.15 * hungry && facing > 0.15) {
      p.swallowed = true;
      p.swallowT = C.SWALLOW_TIME;
      p.alive = true;
      this.releaseHook(p);
      this.pushEvent("swallow", `The Hollow swallowed ${p.name}`);
    }
  }

  stepSwallowed(p, dt) {
    p.swallowT -= dt;
    const head = this.hollow.segs[0];
    p.x = head.x;
    p.y = head.y;
    p.vx = 0;
    p.vy = 0;
    if (p.swallowT > 0) return;
    const tail = this.hollow.segs[this.hollow.segs.length - 1];
    const ang = tail.angle + Math.PI;
    p.swallowed = false;
    p.x = wrap(tail.x + Math.cos(ang) * 40, C.WORLD_W);
    p.y = wrap(tail.y + Math.sin(ang) * 40, C.WORLD_H);
    p.vx = Math.cos(ang) * C.LAUNCH_SPEED;
    p.vy = Math.sin(ang) * C.LAUNCH_SPEED;
    p.angle = ang;
    p.shield = Math.max(p.shield, 1.6);
    p.score += 25;
    this.pushEvent("launch", `${p.name} was fired from the tail`);
  }

  fire(p) {
    const shots = p.multi > 0 ? [-0.18, 0, 0.18] : [0];
    for (const offset of shots) {
      const ang = p.angle + offset;
      const nose = C.SHIP_RADIUS + 6;
      this.bullets.push({
        id: `b${this.tick}-${Math.random().toString(36).slice(2, 8)}`,
        ownerId: p.id,
        x: p.x + Math.cos(ang) * nose,
        y: p.y + Math.sin(ang) * nose,
        vx: Math.cos(ang) * C.BULLET_SPEED + p.vx * 0.25,
        vy: Math.sin(ang) * C.BULLET_SPEED + p.vy * 0.25,
        life: C.BULLET_LIFE,
        color: p.color,
      });
    }
  }

  stepBullets(dt) {
    const next = [];
    for (const b of this.bullets) {
      b.life -= dt;
      if (b.life <= 0) continue;
      b.x = wrap(b.x + b.vx * dt, C.WORLD_W);
      b.y = wrap(b.y + b.vy * dt, C.WORLD_H);
      next.push(b);
    }
    this.bullets = next;
  }

  stepAsteroids(dt) {
    for (const a of this.asteroids) {
      a.x = wrap(a.x + a.vx * dt, C.WORLD_W);
      a.y = wrap(a.y + a.vy * dt, C.WORLD_H);
      a.rot += a.spin * dt;
    }
  }

  stepPowerups(dt) {
    this.powerups = this.powerups.filter((p) => {
      p.life -= dt;
      return p.life > 0;
    });
  }

  collide() {
    const hitBullets = new Set();

    for (const b of this.bullets) {
      if (hitBullets.has(b.id)) continue;
      for (const a of this.asteroids) {
        if (this.sep2(b.x, b.y, a.x, a.y) <= (a.r + C.BULLET_RADIUS) ** 2) {
          hitBullets.add(b.id);
          a.hp -= 1;
          const owner = this.players.get(b.ownerId);
          if (a.hp <= 0) {
            if (owner && owner.alive) owner.score += C.ASTEROID_SCORES[a.size];
            this.splitAsteroid(a);
          }
          break;
        }
      }
    }

    for (const b of this.bullets) {
      if (hitBullets.has(b.id)) continue;
      for (const p of this.players.values()) {
        if (!p.alive || p.id === b.ownerId || p.swallowed) continue;
        if (this.sep2(b.x, b.y, p.x, p.y) <= (C.SHIP_RADIUS + C.BULLET_RADIUS) ** 2) {
          hitBullets.add(b.id);
          this.damagePlayer(p, C.BULLET_DAMAGE, b.ownerId);
          break;
        }
      }
    }

    this.bullets = this.bullets.filter((b) => !hitBullets.has(b.id));

    for (const p of this.players.values()) {
      if (!p.alive || p.swallowed || p.riding) continue;
      for (const a of this.asteroids) {
        if (this.sep2(p.x, p.y, a.x, a.y) <= (C.SHIP_RADIUS + a.r * 0.85) ** 2) {
          this.damagePlayer(p, a.size === "large" ? 34 : a.size === "medium" ? 22 : 14, null);
          const dx = wrapDelta(p.x, a.x, C.WORLD_W);
          const dy = wrapDelta(p.y, a.y, C.WORLD_H);
          const len = Math.hypot(dx, dy) || 1;
          p.vx -= (dx / len) * 180;
          p.vy -= (dy / len) * 180;
        }
      }
    }

    for (const p of this.players.values()) {
      if (!p.alive || p.swallowed) continue;
      this.powerups = this.powerups.filter((up) => {
        if (this.sep2(p.x, p.y, up.x, up.y) <= (C.SHIP_RADIUS + 16) ** 2) {
          this.applyPowerup(p, up.kind);
          return false;
        }
        return true;
      });
    }
  }

  applyPowerup(p, kind) {
    if (kind === "shield") p.shield = Math.max(p.shield, 8);
    if (kind === "rapid") p.rapid = Math.max(p.rapid, 8);
    if (kind === "multi") p.multi = Math.max(p.multi, 8);
    if (kind === "repair") p.health = clamp(p.health + 40, 0, C.SHIP_MAX_HEALTH);
  }

  splitAsteroid(a) {
    const idx = this.asteroids.indexOf(a);
    if (idx >= 0) this.asteroids.splice(idx, 1);
    if (a.size === "large") {
      this.asteroids.push(this.makeAsteroid("medium", a.x, a.y, 20));
      this.asteroids.push(this.makeAsteroid("medium", a.x, a.y, 20));
    } else if (a.size === "medium") {
      this.asteroids.push(this.makeAsteroid("small", a.x, a.y, 30));
      this.asteroids.push(this.makeAsteroid("small", a.x, a.y, 30));
    }
  }

  maintainAsteroids() {
    const large = this.asteroids.filter((a) => a.size === "large").length;
    if (large < 6 && this.asteroids.length < 28) {
      const edge = Math.floor(Math.random() * 4);
      const x = edge < 2 ? (edge === 0 ? 0 : C.WORLD_W) : randRange(0, C.WORLD_W);
      const y = edge >= 2 ? (edge === 2 ? 0 : C.WORLD_H) : randRange(0, C.WORLD_H);
      this.asteroids.push(this.makeAsteroid("large", x, y));
    }
  }

  damagePlayer(p, amount, attackerId) {
    if (!p.alive || p.swallowed) return;
    if (p.riding) amount *= 0.55;
    if (p.shield > 0) {
      p.shield = Math.max(0, p.shield - 1.4);
      amount *= 0.35;
    }
    p.health -= amount;
    if (p.health <= 0) {
      p.health = 0;
      p.alive = false;
      p.deaths += 1;
      p.respawnAt = now() + C.RESPAWN_MS;
      p.vx = 0;
      p.vy = 0;
      this.releaseHook(p);
      const killer = attackerId ? this.players.get(attackerId) : null;
      if (killer && killer.id !== p.id) {
        killer.kills += 1;
        killer.score += C.KILL_SCORE;
      }
      this.kills.unshift({
        killer: killer ? killer.name : "Asteroid",
        victim: p.name,
        at: now(),
      });
      this.kills = this.kills.slice(0, 8);
    }
  }

  respawn(p) {
    const spawn = this.safeSpawn();
    Object.assign(p, playerDefaults({
      id: p.id,
      name: p.name,
      color: p.color,
      x: spawn.x,
      y: spawn.y,
      angle: spawn.angle,
      score: p.score,
      kills: p.kills,
      deaths: p.deaths,
      shield: 2.2,
    }));
  }

  finishRound() {
    this.phase = "results";
    const ranked = [...this.players.values()].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.kills - a.kills;
    });
    this.winner = ranked[0] ? { id: ranked[0].id, name: ranked[0].name, score: ranked[0].score } : null;
  }

  lobbyState() {
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        score: p.score,
        kills: p.kills,
        deaths: p.deaths,
      })),
      winner: this.winner,
      maxPlayers: C.MAX_PLAYERS,
    };
  }

  publicState() {
    return {
      ...this.lobbyState(),
      tick: this.tick,
      world: { w: C.WORLD_W, h: C.WORLD_H },
      remaining: this.phase === "playing" ? Math.max(0, this.roundEndsAt - now()) : 0,
      howl: this.howlT,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        angle: p.angle,
        health: p.health,
        score: p.score,
        kills: p.kills,
        deaths: p.deaths,
        alive: p.alive,
        shield: p.shield,
        rapid: p.rapid,
        multi: p.multi,
        thrust: p.thrust,
        riding: p.riding,
        swallowed: p.swallowed,
        grapple: p.grapple.on
          ? { on: true, tx: p.grapple.tx, ty: p.grapple.ty, kind: p.grapple.kind }
          : { on: false },
        respawnIn: p.alive ? 0 : Math.max(0, (p.respawnAt || 0) - now()),
      })),
      bullets: this.bullets.map((b) => ({
        id: b.id,
        x: b.x,
        y: b.y,
        color: b.color,
      })),
      asteroids: this.asteroids.map((a) => ({
        id: a.id,
        x: a.x,
        y: a.y,
        r: a.r,
        rot: a.rot,
        size: a.size,
        seed: a.seed,
      })),
      powerups: this.powerups.map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        kind: p.kind,
      })),
      hollow: this.hollow
        ? {
            segs: this.hollow.segs.map((s) => ({ x: s.x, y: s.y, r: s.r, angle: s.angle })),
            howl: this.howlT,
          }
        : null,
      kills: this.kills,
      events: this.events,
    };
  }
}

module.exports = { Game, CONSTANTS: C };
