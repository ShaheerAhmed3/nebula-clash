const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Game } = require("../src/game/Game");
const { wrap, wrapDelta, clamp, roomCode, CONSTANTS } = require("../src/game/constants");

test("wrap loops around world edges", () => {
  assert.equal(wrap(-1, 100), 99);
  assert.equal(wrap(100, 100), 0);
  assert.equal(wrap(50, 100), 50);
});

test("wrapDelta picks the short path across the seam", () => {
  assert.ok(Math.abs(wrapDelta(10, 90, 100) + 20) < 1e-9);
  assert.ok(Math.abs(wrapDelta(90, 10, 100) - 20) < 1e-9);
});

test("clamp and room codes", () => {
  assert.equal(clamp(12, 0, 10), 10);
  assert.equal(clamp(-2, 0, 10), 0);
  const code = roomCode();
  assert.equal(code.length, 4);
  assert.match(code, /^[A-Z0-9]+$/);
});

test("players join, names collide, room fills", () => {
  const g = new Game("TEST", "h1");
  assert.equal(g.addPlayer("h1", "Ace").ok, true);
  assert.equal(g.addPlayer("p2", "ace").name, "ace-2");
  assert.equal(g.addPlayer("p3", "Bolt").ok, true);
  for (let i = 4; i <= 8; i++) {
    assert.equal(g.addPlayer(`p${i}`, `P${i}`).ok, true);
  }
  assert.equal(g.addPlayer("p9", "Late").error.includes("full"), true);
});

test("only host can start a round and scores reset", () => {
  const g = new Game("TEST", "h1");
  g.addPlayer("h1", "Ace");
  g.addPlayer("p2", "Bolt");
  assert.equal(g.start("p2").error.includes("host"), true);
  assert.equal(g.start("h1").ok, true);
  assert.equal(g.phase, "playing");
  assert.equal(g.start("h1").error.includes("flight"), true);
  const ace = g.players.get("h1");
  ace.score = 99;
  g.phase = "results";
  assert.equal(g.start("h1").ok, true);
  assert.equal(g.players.get("h1").score, 0);
  assert.ok(g.asteroids.length > 0);
});

test("thrust and wrap keep the ship in-world", () => {
  const g = new Game("TEST", "h1");
  g.addPlayer("h1", "Ace");
  g.start("h1");
  const p = g.players.get("h1");
  p.angle = 0;
  g.setInput("h1", { thrust: true }, 1);
  for (let i = 0; i < 40; i++) g.step(0.05);
  assert.ok(p.x >= 0 && p.x < CONSTANTS.WORLD_W);
  assert.ok(p.y >= 0 && p.y < CONSTANTS.WORLD_H);
  assert.ok(Math.hypot(p.vx, p.vy) > 10);
});

test("bullets damage another ship and award a kill", () => {
  const g = new Game("TEST", "h1");
  g.addPlayer("h1", "Ace");
  g.addPlayer("p2", "Bolt");
  g.start("h1");
  const ace = g.players.get("h1");
  const bolt = g.players.get("p2");
  ace.x = 400;
  ace.y = 400;
  ace.vx = 0;
  ace.vy = 0;
  ace.angle = 0;
  bolt.x = 430;
  bolt.y = 400;
  bolt.vx = 0;
  bolt.vy = 0;
  g.asteroids = [];
  g.fire(ace);
  g.collide();
  assert.ok(bolt.health < CONSTANTS.SHIP_MAX_HEALTH);
  bolt.health = 1;
  g.fire(ace);
  g.collide();
  assert.equal(bolt.alive, false);
  assert.equal(ace.kills, 1);
  assert.ok(ace.score >= CONSTANTS.KILL_SCORE);
});

test("asteroid split and scoring", () => {
  const g = new Game("TEST", "h1");
  g.addPlayer("h1", "Ace");
  g.start("h1");
  g.asteroids = [g.makeAsteroid("large", 100, 100)];
  const before = g.asteroids.length;
  g.splitAsteroid(g.asteroids[0]);
  assert.equal(g.asteroids.length, before + 1);
  assert.ok(g.asteroids.every((a) => a.size === "medium"));
});

test("powerups apply and expire", () => {
  const g = new Game("TEST", "h1");
  g.addPlayer("h1", "Ace");
  g.start("h1");
  const p = g.players.get("h1");
  p.health = 40;
  g.applyPowerup(p, "repair");
  g.applyPowerup(p, "shield");
  g.applyPowerup(p, "rapid");
  g.applyPowerup(p, "multi");
  assert.equal(p.health, 80);
  assert.ok(p.shield > 0 && p.rapid > 0 && p.multi > 0);
  p.x = 200;
  p.y = 200;
  g.powerups = [{ id: "x", kind: "repair", x: 200, y: 200, life: 10 }];
  g.collide();
  assert.equal(g.powerups.length, 0);
});

test("host migrates when the host leaves", () => {
  const g = new Game("TEST", "h1");
  g.addPlayer("h1", "Ace");
  g.addPlayer("p2", "Bolt");
  g.removePlayer("h1");
  assert.equal(g.hostId, "p2");
  assert.equal(g.players.size, 1);
});

test("round ends with a winner from score", () => {
  const g = new Game("TEST", "h1");
  g.addPlayer("h1", "Ace");
  g.addPlayer("p2", "Bolt");
  g.start("h1");
  g.players.get("p2").score = 500;
  g.roundEndsAt = Date.now() - 1;
  g.step(0.05);
  assert.equal(g.phase, "results");
  assert.equal(g.winner.name, "Bolt");
});

test("The Hollow wakes when a match starts", () => {
  const g = new Game("TEST", "h1");
  g.addPlayer("h1", "Ace");
  g.start("h1");
  assert.ok(g.hollow);
  assert.equal(g.hollow.segs.length, CONSTANTS.HOLLOW_SEGS);
  const state = g.publicState();
  assert.ok(state.hollow.segs.length > 10);
  assert.ok(state.events.some((e) => e.kind === "howl"));
});

test("void hook latches an asteroid and pulls the ship", () => {
  const g = new Game("TEST", "h1");
  g.addPlayer("h1", "Ace");
  g.start("h1");
  const ace = g.players.get("h1");
  ace.x = 400;
  ace.y = 400;
  ace.vx = 0;
  ace.vy = 0;
  ace.angle = 0;
  g.asteroids = [g.makeAsteroid("medium", 520, 400)];
  g.hollow.segs.forEach((s) => { s.x = 2400; s.y = 2400; });
  g.fireHook(ace);
  assert.equal(ace.grapple.on, true);
  assert.equal(ace.grapple.kind, "asteroid");
  const before = ace.vx;
  g.stepGrapple(ace, 0.05);
  assert.ok(ace.vx > before);
});

test("yoink hook tugs another pilot", () => {
  const g = new Game("TEST", "h1");
  g.addPlayer("h1", "Ace");
  g.addPlayer("p2", "Bolt");
  g.start("h1");
  const ace = g.players.get("h1");
  const bolt = g.players.get("p2");
  ace.x = 500;
  ace.y = 500;
  ace.angle = 0;
  ace.vx = 0;
  ace.vy = 0;
  bolt.x = 620;
  bolt.y = 500;
  bolt.vx = 0;
  bolt.vy = 0;
  g.asteroids = [];
  g.hollow.segs.forEach((s) => { s.x = 2400; s.y = 2400; });
  g.fireHook(ace);
  assert.equal(ace.grapple.kind, "player");
  g.stepGrapple(ace, 0.05);
  assert.ok(bolt.vx < 0);
});

test("The Hollow swallows a pilot and launches them from the tail", () => {
  const g = new Game("TEST", "h1");
  g.addPlayer("h1", "Ace");
  g.start("h1");
  const ace = g.players.get("h1");
  const head = g.hollow.segs[0];
  ace.x = wrap(head.x + Math.cos(head.angle) * 20, CONSTANTS.WORLD_W);
  ace.y = wrap(head.y + Math.sin(head.angle) * 20, CONSTANTS.WORLD_H);
  g.trySwallow(ace);
  assert.equal(ace.swallowed, true);
  ace.swallowT = 0;
  g.stepSwallowed(ace, 0.05);
  assert.equal(ace.swallowed, false);
  assert.ok(Math.hypot(ace.vx, ace.vy) > 400);
});

test("howl pulls ships toward the maw", () => {
  const g = new Game("TEST", "h1");
  g.addPlayer("h1", "Ace");
  g.start("h1");
  const ace = g.players.get("h1");
  const head = g.hollow.segs[0];
  ace.x = wrap(head.x + 400, CONSTANTS.WORLD_W);
  ace.y = head.y;
  ace.vx = 0;
  ace.vy = 0;
  ace.riding = false;
  ace.swallowed = false;
  g.howlT = 2;
  g.applyHowl(0.05);
  assert.ok(Math.abs(ace.vx) + Math.abs(ace.vy) > 0);
});

test("afterburner drains core energy", () => {
  const g = new Game("TEST", "h1");
  g.addPlayer("h1", "Ace");
  g.start("h1");
  const ace = g.players.get("h1");
  ace.energy = 100;
  g.setInput("h1", { thrust: true, boost: true }, 2);
  g.stepPlayer(ace, 0.2);
  assert.ok(ace.boosting);
  assert.ok(ace.energy < 100);
});

test("homing missile locks and spends ammo", () => {
  const g = new Game("TEST", "h1");
  g.addPlayer("h1", "Ace");
  g.addPlayer("p2", "Bolt");
  g.start("h1");
  const ace = g.players.get("h1");
  ace.missiles = 3;
  g.fireMissile(ace);
  assert.equal(ace.missiles, 2);
  const m = g.bullets.find((b) => b.kind === "missile");
  assert.ok(m);
  assert.equal(m.targetId, "p2");
});

test("scrap grants an upgrade after four pickups", () => {
  const g = new Game("TEST", "h1");
  g.addPlayer("h1", "Ace");
  g.start("h1");
  const ace = g.players.get("h1");
  const beforeHp = ace.maxHealth;
  const beforeDmg = ace.dmgMul;
  ace.scrap = 4;
  g.grantUpgrade(ace);
  assert.equal(ace.scrap, 0);
  assert.ok(ace.maxHealth > beforeHp || ace.dmgMul > beforeDmg || ace.missiles === CONSTANTS.MISSILE_MAX);
});

test("wormhole flings a ship to its twin", () => {
  const g = new Game("TEST", "h1");
  g.addPlayer("h1", "Ace");
  g.start("h1");
  const ace = g.players.get("h1");
  ace.x = g.gates[0].x;
  ace.y = g.gates[0].y;
  ace.gateCd = 0;
  g.tryGates(ace, 0.05);
  assert.ok(g.sep2(ace.x, ace.y, g.gates[1].x, g.gates[1].y) < 80 * 80);
});
