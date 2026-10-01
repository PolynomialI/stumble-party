# Stumble Party

An original 3D multiplayer obstacle-course knockout party game for the browser. Up to 32 bouncy, wobbly
players race, dodge and shove their way through rounds of races, survival arenas and a final showdown
until one champion is left. It is built to run smoothly on low-end Chromebooks, with touch controls for
touchscreens.

Everything you see and hear (characters, maps, textures, sound effects and music) is original and made
procedurally in code. See [CREDITS.md](CREDITS.md).

**Play it: https://stumble-party.onrender.com** (hosted on Render; share this link with friends).

## Playing

From the title screen:

- **Play**: quick play. Joins an open lobby (or starts one). The match begins 25 seconds after the first
  player arrives, or 3 seconds after the lobby fills (32 players). Bots fill any quiet lobby up to 10 players.
- **Private room**: create a room and share its 5-character code, or join a friend's code. The host picks the
  number of rounds (Auto, or 3 to 8) and whether bots fill empty spots, then starts the match.
- **Practice**: play a course on your own, offline.
- **Customize**: suit and accent colours, 12 patterns and 16 hats, with a live close-up of your character.
- **Settings**: graphics quality, camera speed, invert Y, sound effect and music volume, FPS counter.
  During a match, the cog button in the top-left corner opens the same settings, minus graphics quality.

A match is 3 to 6 rounds depending on the size of the lobby (private-room hosts can choose up to 8). It opens
with a race, mixes round types in the middle and ends with a final. If you are eliminated, you keep watching:
switch between players with **Q** / **E** or the arrow buttons.

| Round type | How you get through |
| --- | --- |
| Race | Be among the first across the line. Falling puts you back at the last checkpoint |
| Survival | Stay alive: fall and you are out. Includes rising lava, rolling logs and dropping tiles |
| Zone | Score by standing in the glowing zone, which keeps moving. Top scorers qualify |
| Crown Thief | Score while you hold a crown. Touch a holder to steal it. Top scorers qualify |
| Bomb Tag | Some players start with a bomb. Touch someone to pass it on. Holders at zero are out |
| Final | Last one standing wins, or first to the crown in Crown Rush |

| Map | Type | What happens |
| --- | --- | --- |
| Tumbletop Trail | Race | Sweepers, hammers, a belt climb, crumbling tiles, a turntable, boulders, pistons |
| Bouncy Boulevard | Race | Gaps, belts, spinning discs over the void, swinging logs, stepping stones |
| Windmill Heights | Race | A climb past windmill blades, crumbling tiles and pistons |
| Timber Tumble | Race | Forest: stepping stones, narrow beams and logs that roll under your feet |
| Frostbite Falls | Race | Ice sheets with sliding blocks and two long slides down the mountain |
| Splashdown Slides | Race | Water park: three big slides, belts and meshing discs |
| Gearworks Gauntlet | Race | Factory: turning gears to cross, pistons, hammers and windmills |
| Lava Leap | Race | Volcano: boulders, crumbling bridges and beams over the lava |
| Switchback Sprint | Race | A zigzag path over the void, a slide, hammers and rolling logs |
| Starlight Steps | Race | A climb through windmills, stepping stones, a zigzag and beams |
| Sugar Dash | Race | Gears, a zigzag, crumbling tiles, a slide and swinging logs |
| Spin Cycle | Survival | A sweeper arm that keeps speeding up on a round island |
| Tile Tumble | Survival | Five floors of tiles that drop soon after you touch them |
| Log Jam | Survival | Three giant logs turning in the river, faster and faster |
| Magma Mountain | Survival | The lava is rising: climb to the summit, then outlast the sweeper |
| Hilltop Hustle | Zone | A scoring zone that moves around an arena, with a sweeper on the hill |
| Crown Thief | Crown Thief | Decks, ramps and bounce pads to keep the crown away from the pack |
| Hot Potato Plaza | Bomb Tag | Pillars, walls and bounce pads to dodge around |
| Last Stand | Final | Rings of the stage crumble from the outside in |
| Checker Clash | Final | Squares drop in waves while wrecking balls roll by |
| Crown Rush | Final | A short gauntlet: first to reach the crown wins the match |

Race courses are built from reusable sections (`shared/src/maps/kit.ts`), so a new course is a short list of
sections in `shared/src/maps/races.ts`.

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
that map (the ids are in `shared/src/maps/`, for example `timber`, `frostbite`, `magma` or `hilltop`).

`npm run build` builds both packages: the client into `client/dist`, and the server into
`server/dist/index.js` (start it with `node server/dist/index.js`; it listens on `$PORT`, default 2567).
Set `VITE_SERVER_URL` when building the client to point it at a server elsewhere.

### One-file version

`npm run build:html` writes **`play/stumble-party.html`**: the whole game client in a single file that opens
straight from disk with a double-click, no web server needed. Online play uses the game server deployed on
Render (its address is in `client/.env.single`), so nobody has to host anything. To build a copy that uses a
server on your own computer instead (started with `npm run dev`):

```sh
VITE_SERVER_URL=http://localhost:2567 npm run build:html     # macOS / Linux
$env:VITE_SERVER_URL="http://localhost:2567"; npm run build:html   # Windows PowerShell
```

## Testing

| Command | What it checks |
| --- | --- |
| `npm run typecheck` | TypeScript across shared, server, client and tools |
| `npm test` | 151 unit tests (Vitest): match rules and round planning, the character physics, every map's layout, bots finishing every race course, each game mode played out by bots (zone, crown thief, bomb tag, rising lava, log jam, crown final), the network protocol, the server simulation, client prediction under 40/150/300 ms of simulated lag, and a whole match from lobby to podium |
| `npm run test:e2e` | Playwright smoke test: one browser creates a private room, a second joins by code, and each sees the other move. It starts the server and client itself. The first time, run `npx playwright install chromium` |
| `npm run loadtest` | Load test (needs a running server): 32 headless clients join one private match and play all of it with the bot AI, sending real inputs at 30 Hz. Reports the server's tick time and the bandwidth per client. Options: `--url`, `--clients`, `--seconds` |

Load test results on a desktop PC, with 32 clients playing a full six-round match:

| | |
| --- | --- |
| Server tick time | 1.2 ms on average; worst 95th percentile 3.2 ms (10% of the 33 ms budget) |
| Download per client | 12.3 KB/s with all 32 players on the course; 6.7 KB/s averaged over the match |
| Upload per client | 0.6 KB/s while playing |
| Server memory | about 130 MB |

Three such matches running at once on the same server each took 1.2 to 1.4 ms per tick.

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

A push to the default branch redeploys a service only when its own code changed (`buildFilter` in
`render.yaml`): the server for `server/` and `shared/`, the site for `client/` and `shared/`. Redeploying the
server restarts it, which ends any match in progress.

To deploy somewhere else: the server runs on any Node host that supports WebSockets
(`npm ci && npm run build -w server`, then `node server/dist/index.js`). The client is plain static files
from `npm run build -w client`, built with `VITE_SERVER_URL=https://your-server`.

### The free tier's cold start

The server uses Render's free instance type. Render puts free web services to sleep after 15 minutes without
traffic, and waking one takes about a minute, sometimes two or more. So the first player to arrive after a
quiet spell waits that long:
the game shows "Waking up the game server…" with a timer (it keeps trying for five minutes) and connects by itself once the server
is up. The static site never sleeps, so the title screen and practice mode always load instantly.

Other free-tier limits worth knowing:

- Free instances get a small share of a CPU (0.1). The load test above uses a little over 1 ms of CPU per tick
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

- Characters are instanced, and only the players present and the hats actually worn are drawn.
- Static scenery is merged into a few meshes, and textures are drawn procedurally at startup.
- A dynamic-resolution governor lowers the render resolution as soon as frames start taking too long.
- Three graphics presets: **Low** uses cheaper materials, no shadows and a lower resolution. **Medium**
  and **High** add reflections, shadows and normal maps. The first visit picks Low on smaller devices.

Other folders: `tools/` holds the load test and a few screenshot helpers used during development, and `e2e/`
holds the Playwright smoke test.
