export const GAME_TITLE = 'Stumble Party';

/** Server simulation rate. One input == one tick == one snapshot. */
export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;

export const MAX_PLAYERS = 32;
/** Quick-play matches are topped up with bots to at least this many players. */
export const MIN_MATCH_PLAYERS = 10;

export const DEFAULT_PORT = 2567;
export const ROOM_NAME = 'game';
