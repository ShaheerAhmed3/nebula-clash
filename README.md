# Nebula Clash

A real-time multiplayer space shooter you can play in the browser. Create a room, share a 4-character code, and dogfight around **The Hollow** — a living star-serpent that howls, swallows ships, and can be ridden.

## Play tonight

**Live (auto-deploys from `main`):** after the first Render connect, every push ships here. First-time setup:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/ShaheerAhmed3/nebula-clash)

Sign in with GitHub, apply the blueprint, and Render gives you a public URL. Share that link (and a room code) with friends. Free instances sleep after idle time — the first load can take ~30s.

On the host machine:

```bash
npm install
npm start
```

Then open the **LAN** URL printed in the terminal (same Wi-Fi) or `http://localhost:7777` on that computer.

**Friends on another network (no Render):** keep the server running and in a second terminal run:

```bash
npx cloudflared tunnel --url http://localhost:7777
```

Send everyone the `https://*.trycloudflare.com` link plus your room code.

## Controls

| Action | Keys |
| --- | --- |
| Rotate | `A` / `D` or ← → |
| Thrust | `W` or ↑ |
| Cannons | `Space` or mouse click |
| Homing missile | `E` |
| Afterburner | `Shift` |
| Void hook | `F` or right-click |

## How a match works

- Up to 8 pilots per room
- 4-minute free-for-all
- Shoot ships and asteroids to score
- Pick up **Shield**, **Rapid fire**, **Tri-shot**, and **Repair** crates
- Ships respawn after a short delay
- Host can launch a rematch from the debrief screen

## The Hollow

This is the thing you’ll yell about.

- Fire a **void hook** into asteroids to slingshot, into friends to yoink them, or into The Hollow to **ride the serpent** and shoot from its back.
- Get too close to the jaws and you get **swallowed**, then **launched out the tail** as a living cannonball.
- Every so often The Hollow **howls** — gravity rips everything toward its mouth. Perfect time to hook a friend and donate them to the void.
- **Afterburner** burns core energy for a sprint. **Homing missiles** lock the nearest pilot.
- Smash rocks for **scrap**; four crystals buy a random hull / cannon / bay upgrade.
- **Wormholes** dump you across the map. Hollow **nodes** can be cracked for score.

## Scripts

```bash
npm start    # production server on port 7777
npm test     # game-logic tests
npm run dev  # restart on file changes (Node 18+)
```

The server listens on **7777** by default (`http://localhost:7777`). Override with `PORT=8080 npm start`.
