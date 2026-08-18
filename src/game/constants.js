const SHIP_COLORS = [
  "#3de8ff",
  "#ff4d8d",
  "#ffe14d",
  "#7dff6b",
  "#ff8a3d",
  "#c084fc",
  "#67e8f9",
  "#fb7185",
];

const CONSTANTS = {
  WORLD_W: 2800,
  WORLD_H: 2800,
  TICK_MS: 50,
  TICK_RATE: 20,
  MAX_PLAYERS: 8,
  ROUND_MS: 4 * 60 * 1000,
  SHIP_RADIUS: 16,
  SHIP_THRUST: 520,
  SHIP_MAX_SPEED: 380,
  SHIP_ROTATE: 4.4,
  SHIP_DRAG: 0.985,
  SHIP_MAX_HEALTH: 100,
  RESPAWN_MS: 2800,
  BULLET_SPEED: 640,
  BULLET_LIFE: 1.15,
  BULLET_RADIUS: 3.2,
  BULLET_DAMAGE: 22,
  FIRE_COOLDOWN: 0.22,
  RAPID_COOLDOWN: 0.09,
  ASTEROID_SPAWN: 8,
  ASTEROID_MAX: 16,
  POWERUP_INTERVAL: 8,
  POWERUP_LIFE: 22,
  KILL_SCORE: 120,
  ASTEROID_SCORES: { large: 20, medium: 35, small: 50 },
  GRAPPLE_RANGE: 460,
  GRAPPLE_COOLDOWN: 0.55,
  GRAPPLE_MAX: 3.4,
  RIDE_MAX: 14,
  HOOK_SCORE: 8,
  RIDE_SCORE: 14,
  HOLLOW_SEGS: 22,
  HOLLOW_SPACING: 30,
  HOLLOW_HEAD_R: 38,
  HOLLOW_SPEED: 168,
  HOWL_EVERY: 38,
  HOWL_LIFE: 3.6,
  SWALLOW_TIME: 1.25,
  LAUNCH_SPEED: 820,
  ENERGY_MAX: 100,
  ENERGY_REGEN: 28,
  BOOST_DRAIN: 42,
  BOOST_THRUST: 920,
  BOOST_SPEED: 560,
  MISSILE_MAX: 3,
  MISSILE_CD: 1.25,
  MISSILE_SPEED: 460,
  MISSILE_TURN: 5.2,
  MISSILE_DAMAGE: 52,
  MISSILE_LIFE: 2.6,
  MISSILE_RADIUS: 5,
  SCRAP_NEED: 4,
  HOLLOW_NODE_HP: 4,
};

function wrap(value, max) {
  if (value < 0) return value + max;
  if (value >= max) return value - max;
  return value;
}

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function wrapDelta(a, b, max) {
  let d = b - a;
  if (d > max / 2) d -= max;
  if (d < -max / 2) d += max;
  return d;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function roomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

module.exports = {
  SHIP_COLORS,
  CONSTANTS,
  wrap,
  dist2,
  wrapDelta,
  clamp,
  randRange,
  roomCode,
};
