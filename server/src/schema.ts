import { schema, t, type SchemaType } from '@colyseus/schema';

/** Player status within the current match. */
export const ST_LOBBY = 0;
export const ST_PLAYING = 1;
export const ST_QUALIFIED = 2;
export const ST_ELIMINATED = 3;
export const ST_SPECTATING = 4;

/** Slow-changing per-player info. Positions travel in the binary snapshots, not here. */
export const PlayerState = schema({
  slot: t.uint8(),
  name: t.string(),
  body: t.uint8(),
  accent: t.uint8(),
  pattern: t.uint8(),
  hat: t.uint8(),
  status: t.uint8(),
  /** Finish order this round (race), 0 = none. */
  place: t.uint8(),
  bot: t.boolean(),
  connected: t.boolean().default(true),
  /** Rounds survived this match. */
  score: t.uint8(),
}, 'PlayerState');
export type PlayerState = SchemaType<typeof PlayerState>;

export const GameState = schema({
  /** lobby | intro | countdown | playing | results | podium */
  phase: t.string().default('lobby'),
  /** Server tick when the current phase ends (0 = open-ended). */
  phaseEnd: t.uint32(),
  /** Server tick at which the current map's clock reads zero. */
  roundStart: t.uint32(),
  round: t.uint8(),
  rounds: t.uint8(),
  mapId: t.string().default('lobby'),
  /** Players needed to qualify this round (race / survival target). */
  qualify: t.uint8(),
  qualified: t.uint8(),
  code: t.string(),
  host: t.string(),
  isPrivate: t.boolean(),
  fillBots: t.boolean().default(true),
  winner: t.string(),
  players: t.map(PlayerState),
}, 'GameState');
export type GameState = SchemaType<typeof GameState>;
