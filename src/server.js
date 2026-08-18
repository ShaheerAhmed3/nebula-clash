const os = require("os");
const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const { Game } = require("./game/Game");
const { CONSTANTS, roomCode } = require("./game/constants");

const PORT = Number(process.env.PORT) || 7777;
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, methods: ["GET", "POST"] },
});

app.use(express.static(path.join(__dirname, "../public")));
app.get("/health", (_req, res) => res.json({ ok: true }));

const rooms = new Map();

function findRoomByPlayer(id) {
  for (const room of rooms.values()) {
    if (room.players.has(id)) return room;
  }
  return null;
}

function getRoom(code) {
  return rooms.get(code.toUpperCase()) || null;
}

function pruneEmpty() {
  for (const [code, room] of rooms) {
    if (room.players.size === 0) rooms.delete(code);
  }
}

io.on("connection", (socket) => {
  socket.on("create", ({ name }) => {
    const callsign = sanitizeName(name);
    if (!callsign) return socket.emit("errorMsg", "Enter a callsign.");
    let code = roomCode();
    while (rooms.has(code)) code = roomCode();
    const room = new Game(code, socket.id);
    const result = room.addPlayer(socket.id, callsign);
    if (result.error) return socket.emit("errorMsg", result.error);
    rooms.set(code, room);
    socket.join(code);
    socket.emit("joined", { id: socket.id, code, host: true });
    io.to(code).emit("lobby", room.lobbyState());
  });

  socket.on("join", ({ name, code }) => {
    const callsign = sanitizeName(name);
    const roomCodeIn = String(code || "").trim().toUpperCase();
    if (!callsign) return socket.emit("errorMsg", "Enter a callsign.");
    if (!roomCodeIn) return socket.emit("errorMsg", "Enter a room code.");
    const room = getRoom(roomCodeIn);
    if (!room) return socket.emit("errorMsg", "No room with that code.");
    if (room.phase === "playing") {
      return socket.emit("errorMsg", "That squadron is already in combat. Wait for the next round.");
    }
    const result = room.addPlayer(socket.id, callsign);
    if (result.error) return socket.emit("errorMsg", result.error);
    socket.join(room.code);
    socket.emit("joined", { id: socket.id, code: room.code, host: room.hostId === socket.id });
    io.to(room.code).emit("lobby", room.lobbyState());
  });

  socket.on("start", () => {
    const room = findRoomByPlayer(socket.id);
    if (!room) return;
    const result = room.start(socket.id);
    if (result.error) return socket.emit("errorMsg", result.error);
    io.to(room.code).emit("started", room.publicState());
  });

  socket.on("input", (payload) => {
    const room = findRoomByPlayer(socket.id);
    if (!room || room.phase !== "playing") return;
    room.setInput(socket.id, payload || {}, payload && payload.seq);
  });

  socket.on("again", () => {
    const room = findRoomByPlayer(socket.id);
    if (!room) return;
    if (room.phase !== "results") return;
    const result = room.start(socket.id);
    if (result.error) return socket.emit("errorMsg", result.error);
    io.to(room.code).emit("started", room.publicState());
  });

  socket.on("disconnect", () => {
    const room = findRoomByPlayer(socket.id);
    if (!room) return;
    room.removePlayer(socket.id);
    if (room.players.size === 0) {
      rooms.delete(room.code);
      return;
    }
    io.to(room.code).emit("lobby", room.lobbyState());
    if (room.phase === "playing") io.to(room.code).emit("state", room.publicState());
  });
});

setInterval(() => {
  const dt = CONSTANTS.TICK_MS / 1000;
  for (const room of rooms.values()) {
    if (room.phase !== "playing") continue;
    const state = room.step(dt);
    io.to(room.code).emit("state", state);
    if (room.phase === "results") io.to(room.code).emit("results", room.lobbyState());
  }
  pruneEmpty();
}, CONSTANTS.TICK_MS);

function sanitizeName(name) {
  return String(name || "")
    .replace(/[^\w \-]/g, "")
    .trim()
    .slice(0, 16);
}

function lanAddresses() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const list of Object.values(nets)) {
    for (const net of list || []) {
      if (net.family === "IPv4" && !net.internal) out.push(net.address);
    }
  }
  return out;
}

server.listen(PORT, "0.0.0.0", () => {
  const lans = lanAddresses();
  console.log("");
  console.log("  NEBULA CLASH  —  multiplayer space shooter");
  console.log("  -----------------------------------------");
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const ip of lans) console.log(`  LAN:     http://${ip}:${PORT}`);
  console.log("");
  console.log("  Share a room code with friends on the same Wi-Fi.");
  console.log("  Over the internet: npx cloudflared tunnel --url http://localhost:7777");
  console.log("");
});
