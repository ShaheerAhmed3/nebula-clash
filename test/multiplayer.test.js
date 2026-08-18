const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { io } = require("socket.io-client");
const { spawn } = require("node:child_process");
const path = require("node:path");
const http = require("node:http");

const PORT = 3099;
const URL = `http://127.0.0.1:${PORT}`;
let child;

function waitHealth(ms = 8000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const ping = () => {
      http
        .get(`${URL}/health`, (res) => {
          if (res.statusCode === 200) return resolve();
          retry();
        })
        .on("error", retry);
    };
    const retry = () => {
      if (Date.now() - start > ms) return reject(new Error("server did not start"));
      setTimeout(ping, 80);
    };
    ping();
  });
}

function client() {
  return io(URL, { transports: ["websocket"], forceNew: true });
}

function once(socket, event, ms = 2000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    socket.once(event, (data) => {
      clearTimeout(t);
      resolve(data);
    });
  });
}

before(async () => {
  child = spawn(process.execPath, [path.join(__dirname, "../src/server.js")], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: "pipe",
  });
  await waitHealth();
});

after(() => {
  if (child) child.kill("SIGTERM");
});

test("health endpoint is up", async () => {
  const body = await new Promise((resolve, reject) => {
    http.get(`${URL}/health`, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
  assert.equal(JSON.parse(body).ok, true);
});

test("two pilots can share a room and launch", async () => {
  const a = client();
  const b = client();
  a.emit("create", { name: "Ace" });
  const joined = await once(a, "joined");
  assert.equal(joined.code.length, 4);
  b.emit("join", { name: "Bolt", code: joined.code });
  const bJoin = await once(b, "joined");
  assert.equal(bJoin.code, joined.code);
  a.emit("start");
  const state = await once(a, "started");
  assert.equal(state.phase, "playing");
  assert.equal(state.players.length, 2);
  assert.ok(state.hollow.segs.length > 8);
  a.close();
  b.close();
});
