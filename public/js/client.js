(() => {
  const socket = io({ transports: ["websocket", "polling"] });
  const els = {
    menu: document.getElementById("menu"),
    lobby: document.getElementById("lobby"),
    hud: document.getElementById("hud"),
    results: document.getElementById("results"),
    name: document.getElementById("name"),
    code: document.getElementById("code"),
    create: document.getElementById("create"),
    join: document.getElementById("join"),
    start: document.getElementById("start"),
    copy: document.getElementById("copy"),
    again: document.getElementById("again"),
    leave: document.getElementById("leave"),
    roomCode: document.getElementById("room-code"),
    hudCode: document.getElementById("hud-code"),
    hudTime: document.getElementById("hud-time"),
    hudScore: document.getElementById("hud-score"),
    hpBar: document.getElementById("hp-bar"),
    buffs: document.getElementById("buffs"),
    board: document.getElementById("board"),
    feed: document.getElementById("feed"),
    banner: document.getElementById("banner"),
    pilots: document.getElementById("pilot-list"),
    waiting: document.getElementById("waiting"),
    menuError: document.getElementById("menu-error"),
    lobbyError: document.getElementById("lobby-error"),
    winner: document.getElementById("winner-line"),
    final: document.getElementById("final-board"),
    resultsHint: document.getElementById("results-hint"),
  };

  const keys = { left: false, right: false, thrust: false, fire: false, grapple: false };
  let myId = null;
  let isHost = false;
  let room = "";
  let state = null;
  let prevState = null;
  let lastStateAt = 0;
  let seq = 0;
  let lastFeed = "";
  const seenKills = new Set();
  const seenEvents = new Set();

  const saved = localStorage.getItem("nc-name");
  if (saved) els.name.value = saved;
  else els.name.value = `ACE-${Math.floor(10 + Math.random() * 89)}`;

  function show(id) {
    for (const key of ["menu", "lobby", "hud", "results"]) {
      els[key].classList.toggle("hidden", key !== id);
    }
  }

  function err(target, msg) {
    target.hidden = !msg;
    target.textContent = msg || "";
  }

  function flash(text, ms = 1400) {
    els.banner.textContent = text;
    els.banner.classList.remove("hidden");
    clearTimeout(flash.t);
    flash.t = setTimeout(() => els.banner.classList.add("hidden"), ms);
  }

  els.create.onclick = () => {
    SFX.unlock();
    localStorage.setItem("nc-name", els.name.value.trim());
    socket.emit("create", { name: els.name.value });
  };
  els.join.onclick = () => {
    SFX.unlock();
    localStorage.setItem("nc-name", els.name.value.trim());
    socket.emit("join", { name: els.name.value, code: els.code.value });
  };
  els.start.onclick = () => socket.emit("start");
  els.again.onclick = () => socket.emit("again");
  els.leave.onclick = () => location.reload();
  els.copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(room);
      els.copy.textContent = "Copied";
      setTimeout(() => (els.copy.textContent = "Copy code"), 1200);
    } catch (_) {
      els.copy.textContent = room;
    }
  };
  els.code.addEventListener("keydown", (e) => {
    if (e.key === "Enter") els.join.click();
  });
  els.name.addEventListener("keydown", (e) => {
    if (e.key === "Enter") els.create.click();
  });

  socket.on("joined", (payload) => {
    myId = payload.id;
    room = payload.code;
    isHost = payload.host;
    els.roomCode.textContent = room;
    els.hudCode.textContent = room;
    els.start.classList.toggle("hidden", !isHost);
    els.waiting.classList.toggle("hidden", isHost);
    err(els.menuError, "");
    show("lobby");
  });

  socket.on("lobby", renderLobby);
  socket.on("started", (s) => {
    state = s;
    prevState = s;
    lastStateAt = performance.now();
    SFX.start();
    show("hud");
    flash("WEAPONS FREE");
  });
  socket.on("state", (s) => {
    if (state) {
      for (const p of state.players) {
        const n = s.players.find((x) => x.id === p.id);
        if (p.alive && n && !n.alive) {
          Renderer.addExplosion(p.x, p.y, p.color);
          if (p.id === myId) SFX.death();
          else SFX.boom();
        }
      }
      if (state.powerups.length > s.powerups.length) SFX.pickup();
      if ((s.howl || 0) > 0 && (state.howl || 0) <= 0) {
        SFX.howl();
        Renderer.addShake(8);
      }
    }
    prevState = state;
    state = s;
    lastStateAt = performance.now();
    updateHud(s);
    for (const k of s.kills || []) {
      const id = `${k.at}-${k.victim}`;
      if (!seenKills.has(id)) {
        seenKills.add(id);
        lastFeed = `${k.killer}  ×  ${k.victim}`;
      }
    }
    for (const ev of s.events || []) {
      if (seenEvents.has(ev.id)) continue;
      seenEvents.add(ev.id);
      lastFeed = ev.text;
      if (ev.kind === "howl") flash(ev.text, 2200);
      if (ev.kind === "swallow") {
        SFX.swallow();
        flash(ev.text, 1800);
      }
      if (ev.kind === "launch") {
        SFX.launch();
        flash(ev.text, 1600);
      }
      if (ev.kind === "ride") {
        SFX.hook();
        flash(ev.text, 1400);
      }
      if (ev.kind === "yoink") {
        SFX.hook();
        lastFeed = ev.text;
      }
    }
  });
  socket.on("results", (lobby) => {
    show("results");
    const ranked = [...lobby.players].sort((a, b) => b.score - a.score || b.kills - a.kills);
    els.winner.textContent = lobby.winner ? `${lobby.winner.name} takes the sector` : "Draw";
    els.final.innerHTML = ranked
      .map(
        (p, i) =>
          `<li><span>${i + 1}</span><span>${escapeHtml(p.name)}</span><span>${p.kills} K</span><span>${p.score}</span></li>`
      )
      .join("");
    els.again.classList.toggle("hidden", lobby.hostId !== myId);
    els.resultsHint.textContent = lobby.hostId === myId ? "Launch a rematch when the squadron is ready." : "Waiting for host rematch…";
  });
  socket.on("errorMsg", (msg) => {
    const onMenu = !els.menu.classList.contains("hidden");
    err(onMenu ? els.menuError : els.lobbyError, msg);
  });

  function renderLobby(lobby) {
    isHost = lobby.hostId === myId;
    els.start.classList.toggle("hidden", !isHost);
    els.waiting.classList.toggle("hidden", isHost);
    els.pilots.innerHTML = lobby.players
      .map((p) => {
        const host = p.id === lobby.hostId ? '<span class="host-badge">host</span>' : "";
        return `<li><span><i class="dot" style="background:${p.color};color:${p.color}"></i>${escapeHtml(p.name)}</span>${host}</li>`;
      })
      .join("");
    if (lobby.phase === "results") socket.emit && null;
  }

  function updateHud(s) {
    const me = s.players.find((p) => p.id === myId);
    if (!me) return;
    els.hudScore.textContent = String(me.score);
    els.hpBar.style.width = `${Math.max(0, me.health)}%`;
    const t = Math.ceil(s.remaining / 1000);
    const m = Math.floor(t / 60);
    const sec = String(t % 60).padStart(2, "0");
    els.hudTime.textContent = `${m}:${sec}`;
    const buffs = [];
    if (me.shield > 0) buffs.push(`Shield ${me.shield.toFixed(0)}s`);
    if (me.rapid > 0) buffs.push(`Rapid ${me.rapid.toFixed(0)}s`);
    if (me.multi > 0) buffs.push(`Tri-shot ${me.multi.toFixed(0)}s`);
    if (me.riding) buffs.push("Riding The Hollow");
    if (me.grapple && me.grapple.on && !me.riding) buffs.push("Void hook");
    if (me.swallowed) buffs.push("Swallowed");
    els.buffs.innerHTML = buffs.map((b) => `<span class="buff">${b}</span>`).join("");
    const ranked = [...s.players].sort((a, b) => b.score - a.score);
    els.board.innerHTML = ranked
      .slice(0, 6)
      .map((p) => `<li class="${p.id === myId ? "you" : ""}"><span>${escapeHtml(p.name)}</span><span>${p.score}</span></li>`)
      .join("");
    els.feed.textContent = lastFeed;
    if (me.swallowed) flash("INSIDE THE HOLLOW", 900);
    else if (!me.alive) flash(`DOWN  ·  ${Math.ceil(me.respawnIn / 1000)}`, 900);
  }

  function bind(code, field, down) {
    if (["ArrowLeft", "KeyA"].includes(code)) keys.left = down;
    if (["ArrowRight", "KeyD"].includes(code)) keys.right = down;
    if (["ArrowUp", "KeyW"].includes(code)) keys.thrust = down;
    if (["Space"].includes(code)) keys.fire = down;
    if (["ShiftLeft", "ShiftRight", "KeyF"].includes(code)) keys.grapple = down;
  }

  window.addEventListener("keydown", (e) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    bind(e.code, null, true);
    if (e.code === "Space") SFX.laser();
    if (["ShiftLeft", "ShiftRight", "KeyF"].includes(e.code)) SFX.hook();
  });
  window.addEventListener("keyup", (e) => bind(e.code, null, false));
  window.addEventListener("mousedown", (e) => {
    SFX.unlock();
    if (e.button === 2) {
      keys.grapple = true;
      SFX.hook();
      return;
    }
    keys.fire = true;
    SFX.laser();
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button === 2) keys.grapple = false;
    else keys.fire = false;
  });
  window.addEventListener("contextmenu", (e) => e.preventDefault());

  let lastSent = 0;
  setInterval(() => {
    if (!state || els.hud.classList.contains("hidden")) return;
    socket.emit("input", { ...keys, seq: ++seq });
    if (keys.fire && performance.now() - lastSent > 180) {
      lastSent = performance.now();
    }
  }, 50);

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (els.menu.classList.contains("hidden") === false || els.lobby.classList.contains("hidden") === false || els.results.classList.contains("hidden") === false) {
      Renderer.drawMenuStars(dt);
    }
    if (!els.hud.classList.contains("hidden") && state) {
      const interp = interpolateState(prevState, state, (now - lastStateAt) / 50);
      Renderer.draw(interp, myId, dt);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function interpolateState(a, b, t) {
    if (!a || !b) return b;
    const k = Math.max(0, Math.min(1, t));
    const players = b.players.map((p) => {
      const o = a.players.find((x) => x.id === p.id);
      if (!o) return p;
      const grapple = p.grapple && o.grapple && p.grapple.on && o.grapple.on
        ? {
            ...p.grapple,
            tx: o.grapple.tx + Renderer.wrapDelta(o.grapple.tx, p.grapple.tx, b.world.w) * k,
            ty: o.grapple.ty + Renderer.wrapDelta(o.grapple.ty, p.grapple.ty, b.world.h) * k,
          }
        : p.grapple;
      return {
        ...p,
        x: o.x + Renderer.wrapDelta(o.x, p.x, b.world.w) * k,
        y: o.y + Renderer.wrapDelta(o.y, p.y, b.world.h) * k,
        angle: o.angle + shortAngle(o.angle, p.angle) * k,
        grapple,
      };
    });
    const hollow = b.hollow && a.hollow
      ? {
          ...b.hollow,
          segs: b.hollow.segs.map((seg, i) => {
            const o = a.hollow.segs[i];
            if (!o) return seg;
            return {
              ...seg,
              x: o.x + Renderer.wrapDelta(o.x, seg.x, b.world.w) * k,
              y: o.y + Renderer.wrapDelta(o.y, seg.y, b.world.h) * k,
            };
          }),
        }
      : b.hollow;
    return { ...b, players, hollow };
  }

  function shortAngle(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }
})();
