import type { Vec3 } from '../math';

export type MapType = 'lobby' | 'race' | 'survival' | 'points' | 'tag' | 'final';
export type Surface = 'normal' | 'bounce' | 'conveyor' | 'ice' | 'bumper';
export type ShapeKind = 'box' | 'cyl' | 'ball' | 'wedge';
export type Axis = 'x' | 'y' | 'z';

/** Visual material slots. Each map theme maps these to colours; the client turns them into glossy materials. */
export type MatKey =
  | 'floor' | 'floorAlt' | 'path' | 'wall' | 'trim' | 'accent' | 'accentAlt'
  | 'hazard' | 'bounce' | 'conveyor' | 'finish' | 'ice' | 'grass' | 'rock'
  | 'metal' | 'bumper' | 'tile' | 'tileAlt' | 'white' | 'dark'
  | 'wood' | 'leaf' | 'lava' | 'water' | 'snow' | 'gold';

/** Surface detail painted by the client on top of the material colour. */
export type Tex =
  | 'none' | 'grid' | 'stripes' | 'dots' | 'checker' | 'chevron' | 'planks'
  | 'wood' | 'rock' | 'grass' | 'ice' | 'metal' | 'soft' | 'lava' | 'waves';

export interface Piece {
  shape: ShapeKind;
  /** Full extents. box/wedge: [width, height, depth]; cyl: [diameter, height, diameter]; ball: [d, d, d].
   *  A wedge is a ramp that rises from 0 at local -Z to full height at local +Z. */
  size: Vec3;
  /** Centre of the shape's bounding box (world space for map pieces, pivot-local for obstacle parts). */
  pos: Vec3;
  /** Euler XYZ rotation in radians. */
  rot?: Vec3;
  /** Bevel radius (box/cyl). Rounded edges are what make the plastic look catch highlights. */
  round?: number;
  mat: MatKey;
  tex?: Tex;
  surface?: Surface;
  /** bounce: launch speed (m/s). conveyor: belt speed (m/s). bumper: knock strength. */
  power?: number;
  /** conveyor: belt direction in the piece's local frame. bounce: extra horizontal push direction (local). */
  dir?: Vec3;
  /** Decorative pieces are not collidable. */
  solid?: boolean;
  /** Invisible collision (e.g. guard rails you should not see). */
  visible?: boolean;
}

export type Motion =
  | { kind: 'spin'; axis: Axis; speed: number; phase?: number; accel?: number; maxSpeed?: number }
  | { kind: 'swing'; axis: Axis; amplitude: number; period: number; phase?: number }
  | { kind: 'slide'; offset: Vec3; period: number; phase?: number; ease?: 'sine' | 'piston' };

export interface ObstacleDef {
  /** Pivot position (world). Parts are placed relative to it. */
  pos: Vec3;
  /** Base orientation (Euler XYZ). Motion is applied in this local frame. */
  rot?: Vec3;
  motion: Motion;
  parts: Piece[];
  /** Knockback strength when a moving part strikes a player. 0/undefined = solid but harmless (platforms). */
  hit?: number;
}

export interface TileDef {
  piece: Piece;
  /** Seconds between being stepped on and dropping away. */
  shake?: number;
  /** Seconds until a dropped tile comes back. Omit for tiles that never return. */
  respawn?: number;
  /** Scheduled drop (round seconds); such tiles ignore players. */
  fallAt?: number;
}

export interface Zone {
  min: Vec3;
  max: Vec3;
}

export interface Checkpoint extends Zone {
  spawn: Vec3;
  yaw: number;
}

export interface SpawnDef {
  /** Centre of the spawn grid (feet height). */
  pos: Vec3;
  yaw: number;
  cols: number;
  spacing: number;
}

export interface BotNode {
  p: Vec3;
  /** Arrival radius. */
  r?: number;
  jump?: boolean;
  dive?: boolean;
  /** Lateral spread bots may use around this node. */
  spread?: number;
  /** Minimum lateral offset (keeps bots off hubs and posts in the middle of the lane). */
  avoid?: number;
  /** Discrete lateral offsets to choose from instead of a spread (e.g. one per bounce pad). */
  lanes?: number[];
}

export interface Theme {
  skyTop: number;
  skyHorizon: number;
  skyBottom: number;
  fog: number;
  sunColor: number;
  sunDir: Vec3;
  cloudTint: number;
  palette: Record<MatKey, number>;
}

export interface MapDef {
  id: string;
  name: string;
  type: MapType;
  /** One-line hint shown on the round intro card. */
  blurb: string;
  timeLimit: number;
  killY: number;
  theme: Theme;
  spawn: SpawnDef;
  pieces: Piece[];
  obstacles: ObstacleDef[];
  tiles: TileDef[];
  checkpoints: Checkpoint[];
  finish?: Zone;
  /** Race: waypoints from start to finish. Survival/final: arena centre + radius bots wander within. */
  bot: { path?: BotNode[]; arena?: { center: Vec3; radius: number } };
  /** Rising lava: the kill height climbs from `killY` once `delay` seconds have passed, up to `yMax`. */
  lava?: { delay: number; speed: number; yMax: number };
  /** A sea below the course (water, or lava that rises with `lava`): its height and what it is made of. */
  sea?: { y: number; mat: 'water' | 'lava' };
  /** Points rounds without a zone: you score while holding a crown, and others steal it by touching you. */
  keep?: boolean;
  /** Points rounds: a scoring zone of radius `r` that moves to the next spot every `hold` seconds. */
  hill?: { r: number; hold: number; spots: Vec3[] };
}
