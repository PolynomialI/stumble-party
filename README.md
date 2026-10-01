# Stumble Party

An original 3D multiplayer obstacle-course knockout party game for the browser. Up to 32 bouncy, wobbly
players race, dodge and shove their way through rounds of races, survival arenas and a final showdown
until one champion is left. It is built to run smoothly on low-end Chromebooks, with touch controls for
touchscreens.

Everything you see and hear (characters, maps, textures, sound effects and music) is original and made
procedurally in code. See [CREDITS.md](CREDITS.md).

## Playing

From the title screen:

- **Play**: quick play. Joins an open lobby (or starts one). The match begins 25 seconds after the first
  player arrives, or 3 seconds after the lobby fills (32 players). Bots fill any quiet lobby up to 10 players.
- **Private room**: create a room and share its 5-character code, or join a friend's code. The host chooses
  whether bots fill empty spots, and starts the match.
- **Practice**: play a course on your own, offline.
- **Customize**: suit and accent colours, patterns and hats, with a live close-up of your character.
- **Settings**: graphics quality, camera speed, invert Y, sound effect and music volume, FPS counter.
  During a match, the cog button in the top-left corner opens the same settings, minus graphics quality.

A match is 3 rounds, or 4 rounds with 12 or more players. The first rounds are races and survival
arenas, each with a qualification cut-off. The last round is a final where the last player standing wins.
If you are eliminated, you keep watching: switch between players with **Q** / **E** or the arrow buttons.

| Map | Type | What happens |
| --- | --- | --- |
| Tumbletop Trail | Race | Sweepers, swinging hammers, pushers, conveyors and bounce pads |
| Bouncy Boulevard | Race | Gaps to leap, belts to choose and spinning floors to ride |
| Windmill Heights | Race | Windmill blades, crumbling steps and bounce pads up to the summit |
| Spin Cycle | Survival | A sweeper arm that keeps speeding up on a round island |
| Tile Tumble | Survival | Tiles that drop soon after you touch them, over two floors |
| Last Stand | Final | Rings of the stage crumble from the outside in |
| Checker Clash | Final | Squares drop in waves while wrecking balls roll by |

### Controls

| | Keyboard and mouse | Touchscreen |
| --- | --- | --- |
| Move | WASD or arrow keys | Joystick: touch anywhere on the left side |
| Camera | Click the game to capture the mouse, then move it (Esc releases). Or drag with the left button | Drag on the right side |
| Jump | Space | Green button |
| Dive | Shift, E, or click while the mouse is captured | Orange button |
| Emotes | 1–4 | Purple button, then pick one |
| Zoom | Mouse wheel | |

## Running it locally

You need Node.js 24 (22 or newer works) and npm.

```sh
npm install
npm run dev
```

This starts the game server on http://localhost:2567 and the client on http://localhost:5173. Open the
client in a few browser windows to play against yourself. Other devices on your network can join with
`http://<your-computer's-IP>:5173`.

Handy URL options: `?quality=low|medium|high` forces a graphics preset, and `?map=<id>` opens practice on
that map (`tumbletop`, `bouncy`, `windmill`, `spincycle`, `tiletumble`, `laststand`, `checker`).

`npm run build` builds both packages: the client into `client/dist`, and the server into
`server/dist/index.js` (start it with `node server/dist/index.js`; it listens on `$PORT`, default 2567).
Set `VITE_SERVER_URL` when building the client to point it at a server elsewhere.

## Testing

| Command | What it checks |
| --- | --- |
| `npm run typecheck` | TypeScript across shared, server, client and tools |
| `npm test` | 84 unit tests (Vitest): match rules and qualification cut-offs, the character physics, every map's layout, bots finishing every race course, the network protocol, the server simulation, client prediction under 40/150/300 ms of simulated lag, and a whole match played by bots from lobby to podium |
| `npm run test:e2e` | Playwright smoke test: two browsers join the same room and each sees the other move. It starts the server and client itself. The first time, run `npx playwright install chromium` |
| `npm run loadtest` | Load test (needs a running server): 32 headless clients join one private match and play all of it with the bot AI, sending real inputs at 30 Hz. Reports the server's tick time and the bandwidth per client. Options: `--url`, `--clients`, `--seconds` |

Load test results on a desktop PC, with 32 clients playing a full four-round match:

| | |
| --- | --- |
| Server tick time | 1.1 ms on average; worst 95th percentile 3.4 ms (10% of the 33 ms budget) |
| Download per client | 12.2 KB/s with all 32 players on the course; 5.5 KB/s averaged over the match |
| Upload per client | 0.6 KB/s while playing |
| Server memory | about 130 MB |

Three such matches running at once on the same server each still took about 1 ms per tick.

## Deploying to Render

`render.yaml` is a [Render Blueprint](https://render.com/docs/blueprint-spec) that creates two services:

- **stumble-party-server**: a Node web service running the game server (WebSockets), with a `/health`
  check.
- **stumble-party**: a static site for the client, served from Render's CDN. Its build gets the server's
  public URL automatically: `VITE_SERVER_URL` is copied from the server's `RENDER_EXTERNAL_URL`.

To deploy:

1. Push this repository to GitHub (or GitLab / Bitbucket).
2. In the [Render Dashboard](https://dashboard.render.com), choose **New → Blueprint** and connect the
   repository. For a private repository, give Render access to it when asked.
3. Render reads `render.yaml` and lists both services. Apply it, then wait for both builds to finish
   (a few minutes the first time).
4. Open the static site's address (shown on its page in the dashboard, for example
   `https://stumble-party.onrender.com`). That is the link to share with players.

Every push to the repository's default branch redeploys both services.

To deploy somewhere else: the server runs on any Node host that supports WebSockets
(`npm ci && npm run build -w server`, then `node server/dist/index.js`). The client is plain static files
from `npm run build -w client`, built with `VITE_SERVER_URL=https://your-server`.

### The free tier's cold start

The server uses Render's free instance type. Render puts free web services to sleep after 15 minutes without
traffic, and waking one takes about a minute. So the first player to arrive after a quiet spell waits up to
a minute: the game shows "Waking up the game server…" with a timer and connects by itself once the server
is up. The static site never sleeps, so the title screen and practice mode always load instantly.

Other free-tier limits worth knowing:

- Free instances get a small share of a CPU (0.1). The load test above uses about 1 ms of CPU per tick
  for a full 32-player match on a desktop, so a free instance should manage about one full match at a time.
- 750 free instance hours per month per workspace, which is enough for one always-on service.
- Render may restart free services at any time, which ends any match in progress.

For a server that never sleeps and runs several matches at once, change `plan: free` in `render.yaml` to a
paid instance type such as `0.5c-512mb`. Also set `region` to the one closest to your players: `oregon`
(the default), `ohio`, `virginia`, `frankfurt` or `singapore`. The static site is served from a CDN,
so only the server's region matters.

## How it works

The repository is an npm workspace with three packages:

- **`shared/`**: everything both sides must agree on. The deterministic simulation: a Rapier physics world
  and a custom character controller (run, jump, dive, getting knocked down and back up). Also the
  moving obstacles, the maps, the bot AI, the match rules, the binary network protocol and client-side
  prediction.
- **`server/`**: a [Colyseus](https://colyseus.io) game room. It steps every player, bot and obstacle at
  30 Hz, runs the match (lobby, intro, countdown, rounds, results, podium) and sends snapshots.
- **`client/`**: the [Three.js](https://threejs.org) game: rendering, input (keyboard, mouse and touch), the
  network client, the menus and synthesised audio.

Netcode:

- The server is authoritative.
- Your own character is predicted with the same simulation code the server runs. When a snapshot
  disagrees, the client rewinds to it and replays the inputs still in flight. Small corrections are
  smoothed out.
- Everyone else is drawn about 3.5 ticks in the past and blended between snapshots. Players riding moving
  platforms stay on them.
- Dive tackles are lag-compensated: the server checks them against where the diver saw the other players.
- Snapshots are compact binary messages: about 400 bytes per tick for a full 32-player room.

Rendering targets 60 fps on low-end Chromebooks:

- Characters are instanced: about 20 draw calls for all 32 players.
- Static scenery is merged into a few meshes, and textures are drawn procedurally at startup.
- A dynamic-resolution governor lowers the render resolution as soon as frames start taking too long.
- Three graphics presets: **Low** uses cheaper materials, no shadows and a lower resolution. **Medium**
  and **High** add reflections, shadows and normal maps. The first visit picks Low on smaller devices.

Other folders: `tools/` holds the load test and a few screenshot helpers used during development, and `e2e/`
holds the Playwright smoke test.
