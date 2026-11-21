export const GRID_SIZE = 6;

export type Dir = 'N' | 'E' | 'S' | 'W';
export type ConduitShape = 'straight' | 'corner' | 'tee';

/** One cell of the 6x6 grid. Conduit `rot` counts clockwise quarter-turns. */
export type Tile =
  | { kind: 'empty' | 'source' | 'core' | 'overload' | 'wall' }
  | { kind: 'conduit'; shape: ConduitShape; rot: number }
  | { kind: 'breaker'; axis: 'V' | 'H'; open: boolean };

export type Board = Tile[];

export interface Puzzle {
  day: number;
  name: string;
  parMoves: number;
  maxMoves: number;
  board: Board;
}

export interface SimResult {
  powered: boolean[];
  cores: number;
  coresOn: number;
  faults: number;
  won: boolean;
}

export type Status = 'playing' | 'won' | 'lost';

export interface SaveData {
  streak: number;
  lastWin: string | null;
  bestMoves: Record<number, number>;
  completed: number[];
}

export const DIRS: Dir[] = ['N', 'E', 'S', 'W'];
export const DELTA: Record<Dir, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
export const OPPOSITE: Record<Dir, Dir> = { N: 'S', E: 'W', S: 'N', W: 'E' };
