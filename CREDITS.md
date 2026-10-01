# Credits

## Art, audio and content

Everything in Stumble Party is original and generated in code. The repository contains no third-party
models, images, textures, sounds, music or fonts, so no asset licences apply.

| What | How it is made |
| --- | --- |
| Characters, hats, patterns and faces | Procedural Three.js geometry and canvas-drawn textures (`client/src/render/characters.ts`, `textures.ts`) |
| Maps and obstacles | Original layouts written as code (`shared/src/maps/`) |
| Textures, normal maps and the sky | Drawn on canvases at startup (`client/src/render/textures.ts`, `environment.ts`) |
| Clouds, islands, balloons and particles | Procedural instanced geometry (`client/src/render/environment.ts`, `decor.ts`, `effects.ts`) |
| Sound effects and music | Synthesised live with the Web Audio API (`client/src/audio/sound.ts`) |
| Names, map names and all text | Original |
| Fonts | None shipped. The interface uses fonts already on the player's device (Nunito if installed, otherwise Arial Rounded MT Bold, Segoe UI, Roboto or the system font) |

The game is inspired by the obstacle-course knockout party genre. It does not use any assets, code,
names, characters or map layouts from Stumble Guys, Fall Guys or any other game.

## Software

Libraries used by the game:

| Library | Used for | Licence |
| --- | --- | --- |
| [three.js](https://github.com/mrdoob/three.js) 0.186 | 3D rendering | MIT |
| [Rapier](https://github.com/dimforge/rapier) (`@dimforge/rapier3d-compat`) 0.21 | Physics (server and client prediction) | Apache-2.0 |
| [Colyseus](https://github.com/colyseus/colyseus) (`@colyseus/core`, `@colyseus/ws-transport`, `@colyseus/schema`, `@colyseus/sdk`) 0.18 | Multiplayer rooms, matchmaking and state sync | MIT |
| [Express](https://github.com/expressjs/express) 5 | Health check and metrics endpoints | MIT |

Development tools:

| Tool | Used for | Licence |
| --- | --- | --- |
| [TypeScript](https://github.com/microsoft/TypeScript) | Language and type checking | Apache-2.0 |
| [Vite](https://github.com/vitejs/vite) | Client dev server and build | MIT |
| [esbuild](https://github.com/evanw/esbuild) | Server build | MIT |
| [tsx](https://github.com/privatenumber/tsx) | Running TypeScript in development and the load test | MIT |
| [Vitest](https://github.com/vitest-dev/vitest) | Unit tests | MIT |
| [Playwright](https://github.com/microsoft/playwright) | Browser smoke test | Apache-2.0 |

Their full licence texts ship with each package in `node_modules/`.
