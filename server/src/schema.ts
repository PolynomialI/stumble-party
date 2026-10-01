import { schema, t, type SchemaType } from '@colyseus/schema';
import { STATUS } from '@sp/shared';

export const ST_LOBBY = STATUS.lobby;
export const ST_PLAYING = STATUS.playing;
export const ST_QUALIFIED = STATUS.qualified;
export const ST_ELIMINATED = STATUS.eliminated;

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
  /** Points this round (zone rounds): ten per second in the zone. */
  points: t.uint16(),
  /** Holding a bomb (tag rounds). */
  it: t.boolean(),
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
  /** Rounds the host asked for (0 = automatic). */
  roundsWanted: t.uint8(),
  winner: t.string(),
  players: t.map(PlayerState),
}, 'GameState');
export type GameState = SchemaType<typeof GameState>;
