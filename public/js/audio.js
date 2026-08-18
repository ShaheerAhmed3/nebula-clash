const SFX = (() => {
  let ctx = null;
  let muted = false;

  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function beep(freq, dur, type = "square", gain = 0.05, slide = 0) {
    if (muted) return;
    const c = ac();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), c.currentTime + dur);
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + dur);
  }

  return {
    unlock() { try { ac(); } catch (_) {} },
    laser() { beep(680, 0.08, "square", 0.04, -320); },
    boom() { beep(140, 0.28, "sawtooth", 0.07, -90); },
    pickup() { beep(520, 0.12, "triangle", 0.05, 240); },
    death() { beep(90, 0.45, "sawtooth", 0.08, -50); },
    start() { beep(300, 0.12, "triangle", 0.05, 200); setTimeout(() => beep(420, 0.14, "triangle", 0.05, 240), 90); },
    hook() { beep(210, 0.09, "sawtooth", 0.04, 180); },
    howl() { beep(70, 0.7, "sawtooth", 0.07, -20); setTimeout(() => beep(48, 0.55, "triangle", 0.05, 10), 80); },
    swallow() { beep(110, 0.35, "square", 0.06, -70); },
    launch() { beep(180, 0.2, "sawtooth", 0.06, 420); },
  };
})();
