import { GRID_SIZE } from './types';
import type { Board, ConduitShape, Puzzle, Tile } from './types';

/** Puzzle #1 went live on this date; the daily board is (puzzle number - 1) % 3 + 1. */
export const LAUNCH_DATE = '2026-11-21';

/**
 * Board notation: six rows of six two-character tiles.
 *   ..  empty     ##  wall      SS  source    CC  core      XX  overload
 *   I0-I3 straight   L0-L3 corner   T0-T3 tee   (digit = clockwise quarter-turns already applied)
 *   Vc Vo Hc Ho   breaker: V(ertical)/H(orizontal) axis + c(losed)/o(pen)
 */
const SHAPES: Record<string, ConduitShape> = { I: 'straight', L: 'corner', T: 'tee' };

function tile(tok: string): Tile {
  switch (tok) {
    case '..': return { kind: 'empty' };
    case '##': return { kind: 'wall' };
    case 'SS': return { kind: 'source' };
    case 'CC': return { kind: 'core' };
    case 'XX': return { kind: 'overload' };
  }
  const [a, b] = tok;
  if (SHAPES[a] && b >= '0' && b <= '3') return { kind: 'conduit', shape: SHAPES[a], rot: Number(b) };
  if ((a === 'V' || a === 'H') && (b === 'c' || b === 'o')) return { kind: 'breaker', axis: a, open: b === 'o' };
  throw new Error(`FAULTLINE: bad tile token "${tok}"`);
}

function puzzle(day: number, name: string, parMoves: number, maxMoves: number, rows: string[]): Puzzle {
  const board: Board = rows.flatMap((r) => r.trim().split(/\s+/).map(tile));
  if (rows.length !== GRID_SIZE || board.length !== GRID_SIZE * GRID_SIZE) throw new Error(`FAULTLINE: day ${day} is not ${GRID_SIZE}x${GRID_SIZE}`);
  return { day, name, parMoves, maxMoves, board };
}

/**
 * parMoves is the proven optimum: an exhaustive BFS over every reachable click-state
 * (using the game's own power engine) found no winning sequence shorter than it.
 * maxMoves = par + 5 before GRID LOCKOUT.
 */
export const PUZZLES: Puzzle[] = [
  puzzle(1, 'SUBSTATION 07', 5, 10, [
    '.. .. .. .. .. ..',
    '.. .. .. I1 L1 CC',
    '.. .. ## ## Vc XX',
    '.. .. ## L1 L0 I2',
    '## .. .. I0 .. ..',
    '.. .. SS T1 I2 CC',
  ]),
  puzzle(2, 'RING MAIN', 9, 14, [
    '.. .. .. .. ## ##',
    '.. .. .. .. CC ..',
    '.. ## ## Hc Vo XX',
    'XX I3 .. CC T3 ..',
    'L3 Hc I3 I0 T2 L2',
    'CC .. .. ## SS ..',
  ]),
  puzzle(3, 'CASCADE FAULT', 12, 17, [
    '## .. L2 SS ## ..',
    '.. ## XX L2 T1 CC',
    '## .. .. .. Vc XX',
    '.. SS .. Vc L2 CC',
    'L3 L0 .. .. .. ..',
    'CC XX I2 .. .. ##',
  ]),
];
