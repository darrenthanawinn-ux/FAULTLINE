import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LAUNCH_DATE, PUZZLES } from './puzzles';
import { DELTA, DIRS, GRID_SIZE, OPPOSITE } from './types';
import type { Board, ConduitShape, Dir, Puzzle, SaveData, SimResult, Status, Tile } from './types';

// ===== ENGINE:START =====
const N = GRID_SIZE;
const BASE_PORTS: Record<ConduitShape, Dir[]> = { straight: ['N', 'S'], corner: ['N', 'E'], tee: ['E', 'S', 'W'] };
const turn = (d: Dir, k: number): Dir => DIRS[(DIRS.indexOf(d) + (((k % 4) + 4) % 4)) % 4];

/** Which sides of a tile conduct power right now. */
export function portsOf(t: Tile): Dir[] {
  switch (t.kind) {
    case 'source':
    case 'core':
    case 'overload':
      return DIRS;
    case 'conduit':
      return BASE_PORTS[t.shape].map((d) => turn(d, t.rot));
    case 'breaker':
      return t.open ? [] : t.axis === 'V' ? ['N', 'S'] : ['E', 'W'];
    default:
      return [];
  }
}

/** BFS from every source across matching ports. Cores/overloads are terminals. */
export function simulate(board: Board): SimResult {
  const powered: boolean[] = board.map(() => false);
  const queue: number[] = [];
  board.forEach((t, i) => {
    if (t.kind === 'source') {
      powered[i] = true;
      queue.push(i);
    }
  });
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % N;
    const y = Math.floor(i / N);
    for (const d of portsOf(board[i])) {
      const nx = x + DELTA[d][0];
      const ny = y + DELTA[d][1];
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const j = ny * N + nx;
      if (powered[j] || !portsOf(board[j]).includes(OPPOSITE[d])) continue;
      powered[j] = true;
      if (board[j].kind === 'conduit' || board[j].kind === 'breaker') queue.push(j);
    }
  }
  let cores = 0;
  let coresOn = 0;
  let faults = 0;
  board.forEach((t, i) => {
    if (t.kind === 'core') {
      cores++;
      if (powered[i]) coresOn++;
    } else if (t.kind === 'overload' && powered[i]) faults++;
  });
  return { powered, cores, coresOn, faults, won: cores > 0 && coresOn === cores && faults === 0 };
}

/** One click: rotate a conduit 90deg clockwise or toggle a breaker. Null if not clickable. */
export function applyMove(board: Board, i: number): Board | null {
  const t = board[i];
  if (t.kind !== 'conduit' && t.kind !== 'breaker') return null;
  const next = board.slice();
  next[i] = t.kind === 'conduit' ? { ...t, rot: t.rot + 1 } : { ...t, open: !t.open };
  return next;
}
// ===== ENGINE:END =====

/* ─────────────────────────── persistence & calendar ─────────────────────────── */

const SAVE_KEY = 'faultline:v1';
const EMPTY_SAVE: SaveData = { streak: 0, lastWin: null, bestMoves: {}, completed: [] };

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00`) - Date.parse(`${a}T00:00:00`)) / 86_400_000);

function loadSave(): SaveData {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (raw && typeof raw.streak === 'number') return { ...EMPTY_SAVE, ...raw };
  } catch {
    /* corrupt or blocked storage: start fresh */
  }
  return EMPTY_SAVE;
}

function persist(s: SaveData) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: the session still works */
  }
}

/** A streak only counts while the last win was today or yesterday. */
function liveStreak(s: SaveData, today: string): number {
  if (!s.lastWin) return 0;
  const gap = dayDiff(s.lastWin, today);
  return gap >= 0 && gap <= 1 ? s.streak : 0;
}

function recordWin(s: SaveData, day: number, moves: number, today: string): SaveData {
  return {
    streak: s.lastWin === today ? s.streak : liveStreak(s, today) + 1,
    lastWin: today,
    bestMoves: { ...s.bestMoves, [day]: Math.min(moves, s.bestMoves[day] ?? moves) },
    completed: [...new Set([...s.completed, day])].sort(),
  };
}

function calendar() {
  const now = new Date();
  const puzzleNo = Math.max(1, dayDiff(LAUNCH_DATE, dateKey(now)) + 1);
  const label = now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  return { puzzleNo, todayDay: ((puzzleNo - 1) % PUZZLES.length) + 1, label: label.replace(/,/g, '').toUpperCase() };
}

/* ─────────────────────────── palette & result glyphs ─────────────────────────── */

const PAL = {
  bg: '#0B0E14', panel: '#10151E', cell: '#0F141D', line: '#222B3A', frame: '#2F3B50',
  casing: '#1B2433', idle: '#46566E', live: '#7DD3FC',
  source: '#3B82F6', sourceBg: '#0B1B38',
  core: '#FACC15', coreDim: '#8A6D12', coreBg: '#1F1A08',
  over: '#EF4444', overDim: '#7F1D1D', overBg: '#1A0E12',
  brkOn: '#22D3EE', brkOff: '#F59E0B', wall: '#161D29', wallLine: '#2A3548',
};

/** One cell of the result grid: emoji for the Reddit post, colour for the on-screen card. */
function glyph(t: Tile, on: boolean): { e: string; c: string } {
  switch (t.kind) {
    case 'source': return { e: '🔵', c: PAL.source };
    case 'core': return on ? { e: '🟨', c: PAL.core } : { e: '🟫', c: PAL.coreDim };
    case 'overload': return on ? { e: '💥', c: PAL.over } : { e: '🟥', c: PAL.overDim };
    case 'conduit':
    case 'breaker': return on ? { e: '🟦', c: PAL.live } : { e: '⬜', c: '#2B374B' };
    default: return { e: '⬛', c: '#131A25' };
  }
}

/** Reddit-flavoured markdown. The grid is spoilered row by row because it shows the solved layout. */
function buildShare(p: Puzzle, board: Board, sim: SimResult, moves: number, won: boolean, puzzleNo: number, streak: number): string {
  const rows = Array.from({ length: GRID_SIZE }, (_, y) =>
    Array.from({ length: GRID_SIZE }, (_, x) => glyph(board[y * GRID_SIZE + x], sim.powered[y * GRID_SIZE + x]).e).join(''),
  );
  return [
    `**FAULTLINE #${puzzleNo}** · Day ${p.day} · ${won ? '⚡ GRID STABILIZED' : '🔌 GRID LOCKOUT'}`,
    `**${moves}** moves · par ${p.parMoves} · limit ${p.maxMoves}${won && moves === p.parMoves ? ' · 🎯 PERFECT' : ''}`,
    `🔥 Streak: ${streak}`,
    '',
    ...rows.map((r) => `>!${r}!<`),
  ].join('  \n');
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* fall back to a hidden textarea */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/* ─────────────────────────── board rendering (SVG) ─────────────────────────── */

const CELL = 60;
const ARM: Record<Dir, [number, number]> = { N: [30, 0], E: [60, 30], S: [30, 60], W: [0, 30] };

/** Pipe arms from the tile centre to the given edges. */
function Arms({ dirs, live }: { dirs: Dir[]; live: boolean }) {
  return (
    <>
      {dirs.map((d) => <line key={`c${d}`} x1={30} y1={30} x2={ARM[d][0]} y2={ARM[d][1]} stroke={PAL.casing} strokeWidth={12} />)}
      {dirs.map((d) => <line key={`i${d}`} x1={30} y1={30} x2={ARM[d][0]} y2={ARM[d][1]} stroke={live ? PAL.live : PAL.idle} strokeWidth={4} />)}
    </>
  );
}

/** Short edge-to-node leads on all four sides (sources, cores, overloads). */
function Stubs({ r, color }: { r: number; color: string }) {
  return (
    <>
      {DIRS.map((d) => (
        <line key={d} x1={ARM[d][0]} y1={ARM[d][1]} x2={30 + (ARM[d][0] - 30) * (r / 30)} y2={30 + (ARM[d][1] - 30) * (r / 30)} stroke={color} strokeWidth={4} />
      ))}
    </>
  );
}

function tileBody(t: Tile, live: boolean): React.ReactNode {
  switch (t.kind) {
    case 'conduit':
      return (
        <g className="fl-rot" style={{ transform: `rotate(${t.rot * 90}deg)` }}>
          <rect width={CELL} height={CELL} fill="none" />
          <Arms dirs={BASE_PORTS[t.shape]} live={live} />
          <rect x={24} y={24} width={12} height={12} fill={PAL.casing} />
          <rect x={26} y={26} width={8} height={8} fill={live ? PAL.live : PAL.idle} />
        </g>
      );
    case 'breaker': {
      const col = t.open ? PAL.brkOff : PAL.brkOn;
      const lead = live ? PAL.live : PAL.idle;
      return (
        <g transform={t.axis === 'H' ? 'rotate(90 30 30)' : undefined}>
          <line x1={30} y1={0} x2={30} y2={18} stroke={PAL.casing} strokeWidth={12} />
          <line x1={30} y1={42} x2={30} y2={60} stroke={PAL.casing} strokeWidth={12} />
          <line x1={30} y1={0} x2={30} y2={18} stroke={lead} strokeWidth={4} />
          <line x1={30} y1={42} x2={30} y2={60} stroke={lead} strokeWidth={4} />
          <rect x={19} y={16} width={22} height={28} fill={PAL.panel} stroke={col} vectorEffect="non-scaling-stroke" />
          <circle cx={30} cy={23} r={2.5} fill={col} />
          <circle cx={30} cy={37} r={2.5} fill={col} />
          {t.open
            ? <line x1={30} y1={37} x2={37} y2={25} stroke={col} strokeWidth={3} strokeLinecap="round" />
            : <line x1={30} y1={23} x2={30} y2={37} stroke={live ? PAL.live : col} strokeWidth={3} />}
        </g>
      );
    }
    case 'source':
      return (
        <g style={{ filter: `drop-shadow(0 0 3px ${PAL.source})` }}>
          <Stubs r={22} color={PAL.live} />
          <rect x={8} y={8} width={44} height={44} rx={3} fill={PAL.sourceBg} stroke={PAL.source} strokeWidth={1.5} />
          <polygon points="33,16 22,33 29,33 27,45 38,27 31,27" fill={PAL.live} />
        </g>
      );
    case 'core':
      return (
        <g style={live ? { filter: `drop-shadow(0 0 4px ${PAL.core})` } : undefined}>
          <Stubs r={21} color={live ? PAL.core : PAL.coreDim} />
          <polygon points="30,9 51,30 30,51 9,30" fill={live ? PAL.core : PAL.coreBg} stroke={live ? PAL.core : PAL.coreDim} strokeWidth={1.5} />
          <polygon points="30,19 41,30 30,41 19,30" fill={live ? PAL.bg : 'none'} stroke={live ? PAL.bg : PAL.coreDim} strokeWidth={1.5} />
        </g>
      );
    case 'overload':
      return (
        <g className={live ? 'fl-pulse' : undefined} style={live ? { filter: `drop-shadow(0 0 5px ${PAL.over})` } : undefined}>
          <Stubs r={19.4} color={live ? PAL.over : PAL.overDim} />
          <polygon points="49.4,22 38,10.6 22,10.6 10.6,22 10.6,38 22,49.4 38,49.4 49.4,38" fill={live ? PAL.over : PAL.overBg} stroke={live ? PAL.over : PAL.overDim} strokeWidth={1.5} />
          <rect x={28.5} y={20} width={3} height={12} fill={live ? PAL.bg : PAL.overDim} />
          <rect x={28.5} y={35} width={3} height={3.5} fill={live ? PAL.bg : PAL.overDim} />
        </g>
      );
    case 'empty':
      return <circle cx={30} cy={30} r={1} fill={PAL.casing} />;
    default:
      return null;
  }
}

function BoardView({ board, sim, locked, onTile }: { board: Board; sim: SimResult; locked: boolean; onTile: (i: number) => void }) {
  return (
    <svg viewBox="0 0 360 360" className="absolute inset-0 h-full w-full" role="group" aria-label="Power grid">
      <defs>
        <pattern id="fl-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill={PAL.wall} />
          <line x1="0" y1="0" x2="0" y2="8" stroke={PAL.wallLine} strokeWidth="3" />
        </pattern>
      </defs>
      {board.map((t, i) => {
        const x = i % GRID_SIZE;
        const y = Math.floor(i / GRID_SIZE);
        const clickable = !locked && (t.kind === 'conduit' || t.kind === 'breaker');
        const label = t.kind === 'breaker' ? `${t.open ? 'Close' : 'Open'} breaker` : t.kind === 'conduit' ? `Rotate ${t.shape} conduit` : '';
        return (
          <g
            key={i}
            transform={`translate(${x * CELL} ${y * CELL})`}
            className={clickable ? 'fl-tile fl-click' : 'fl-tile'}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            aria-label={clickable ? `${label}, row ${y + 1} column ${x + 1}` : undefined}
            onClick={clickable ? () => onTile(i) : undefined}
            onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTile(i); } } : undefined}
          >
            <rect x={0.5} y={0.5} width={59} height={59} fill={t.kind === 'wall' ? 'url(#fl-hatch)' : PAL.cell} stroke={PAL.line} vectorEffect="non-scaling-stroke" />
            {tileBody(t, sim.powered[i])}
            {clickable && <rect className="fl-hit" x={1} y={1} width={58} height={58} />}
          </g>
        );
      })}
      <rect x={0} y={0} width={360} height={360} fill="none" stroke={PAL.frame} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ─────────────────────────── UI pieces ─────────────────────────── */

interface Game { day: number; board: Board; history: Board[]; status: Status }
const fresh = (day: number): Game => ({ day, board: PUZZLES[day - 1].board, history: [], status: 'playing' });

function DayPill({ day, done, onPick }: { day: number; done: number[]; onPick: (d: number) => void }) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Puzzle day">
      <span className="text-[10px] tracking-[0.25em] text-[#6B778A]">DAY</span>
      <div className="inline-flex overflow-hidden rounded-full border border-[#2F3B50] bg-[#0F141D]">
        {PUZZLES.map((p) => (
          <button
            key={p.day}
            aria-pressed={p.day === day}
            onClick={() => onPick(p.day)}
            className={`cursor-pointer px-3 py-1.5 text-[11px] font-bold tracking-widest ${p.day === day ? 'bg-[#7DD3FC] text-[#0B0E14]' : 'text-[#8A97AB] hover:text-white'}`}
          >
            {p.day}{done.includes(p.day) ? '✓' : ''}
          </button>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="min-w-0 border border-[#232C3B] bg-[#0F141D] px-3 py-2">
      <div className="text-[9px] tracking-[0.25em] text-[#6B778A]">{label}</div>
      <div className="text-lg font-bold leading-tight text-white">{value}</div>
      {children}
    </div>
  );
}

function Meter({ used, max, par }: { used: number; max: number; par: number }) {
  const left = max - used;
  const on = left === 0 ? PAL.over : left <= 2 ? PAL.brkOff : PAL.live;
  return (
    <div className="mt-1 flex gap-[2px]" aria-hidden="true">
      {Array.from({ length: max }, (_, k) => (
        <span key={k} className="h-1.5 flex-1" style={{ background: k < used ? on : PAL.casing, boxShadow: k === par - 1 ? `0 2px 0 ${PAL.core}` : undefined }} />
      ))}
    </div>
  );
}

function FaultGlyph() {
  return (
    <svg width="220" height="36" viewBox="0 0 220 36" fill="none" aria-hidden="true">
      <path d="M8 18H84L94 5L106 31L114 18" stroke={PAL.live} strokeWidth="2.5" />
      <path d="M130 18H212" stroke={PAL.idle} strokeWidth="2.5" strokeDasharray="5 5" />
      <rect x="2" y="13" width="10" height="10" fill={PAL.source} />
      <rect x="208" y="13" width="10" height="10" fill={PAL.coreDim} />
    </svg>
  );
}

function StartScreen(p: { label: string; puzzleNo: number; streak: number; cleared: number; day: number; done: number[]; onPick: (d: number) => void; onDeploy: () => void }) {
  return (
    <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
      <FaultGlyph />
      <div>
        <h1 className="pl-[0.28em] text-[clamp(2.25rem,10vw,4rem)] font-bold leading-none tracking-[0.28em] text-white">FAULTLINE</h1>
        <p className="mt-3 text-xs tracking-wider text-[#8A97AB]">Reroute the power before the grid locks out.</p>
      </div>
      <div className="text-[11px] tracking-[0.25em] text-[#6B778A]">{p.label}</div>
      <div className="grid w-full max-w-[320px] grid-cols-3 gap-px border border-[#232C3B] bg-[#232C3B]">
        {[['PUZZLE', `#${p.puzzleNo}`], ['STREAK', String(p.streak)], ['CLEARED', `${p.cleared}/${PUZZLES.length}`]].map(([k, v]) => (
          <div key={k} className="bg-[#0F141D] px-2 py-2.5">
            <div className="text-[9px] tracking-[0.25em] text-[#6B778A]">{k}</div>
            <div className="text-xl font-bold text-white">{v}</div>
          </div>
        ))}
      </div>
      <DayPill day={p.day} done={p.done} onPick={p.onPick} />
      <button
        onClick={p.onDeploy}
        className="cursor-pointer border border-[#7DD3FC] bg-[#7DD3FC]/10 px-10 py-3 text-sm font-bold tracking-[0.3em] text-[#7DD3FC] hover:bg-[#7DD3FC] hover:text-[#0B0E14]"
      >
        [ DEPLOY ]
      </button>
    </main>
  );
}

function EndCard(p: { puzzle: Puzzle; game: Game; sim: SimResult; puzzleNo: number; streak: number; best: number | undefined; onRetry: () => void; onNext: () => void; onMenu: () => void }) {
  const { puzzle, game, sim } = p;
  const won = game.status === 'won';
  const moves = game.history.length;
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    const ok = await copyText(buildShare(puzzle, game.board, sim, moves, won, p.puzzleNo, p.streak));
    setCopied(ok ? 'ok' : 'fail');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied('idle'), 1800);
  };

  const verdict = won
    ? moves === puzzle.parMoves ? 'PERFECT · OPTIMAL ROUTE' : `+${moves - puzzle.parMoves} OVER PAR`
    : `MOVE LIMIT ${puzzle.maxMoves} REACHED · CORES ${sim.coresOn}/${sim.cores}`;
  const ghost = 'cursor-pointer border border-[#2F3B50] py-2 text-[11px] tracking-[0.2em] text-[#C8D1DE] hover:border-[#7DD3FC] hover:text-white';

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-[#0B0E14]/85 p-4">
      <div role="dialog" aria-modal="true" aria-label={won ? 'Grid stabilized' : 'Grid lockout'} className="max-h-full w-full max-w-[360px] [@media(max-height:520px)]:max-w-[680px] overflow-y-auto border border-[#2F3B50] bg-[#10151E] p-5 [@media(max-height:520px)]:p-4">
        <div className="[@media(max-height:520px)]:flex [@media(max-height:520px)]:gap-5">
        <div className="[@media(max-height:520px)]:flex-1">
        <p className={`text-[10px] tracking-[0.3em] ${won ? 'text-[#34D399]' : 'text-[#EF4444]'}`}>{won ? '● STATUS: STABLE' : '● STATUS: FAULT'}</p>
        <h2 className="mt-1 text-2xl font-bold tracking-[0.1em] text-white">{won ? 'GRID STABILIZED' : 'GRID LOCKOUT'}</h2>
        <p className="mt-1 text-[11px] tracking-wider text-[#6B778A]">#{p.puzzleNo} · DAY {puzzle.day} · {puzzle.name}</p>

        <div className="mt-4 grid grid-cols-3 gap-px border border-[#232C3B] bg-[#232C3B] text-center">
          {[['MOVES', moves], ['PAR', puzzle.parMoves], ['STREAK', p.streak]].map(([k, v]) => (
            <div key={k} className="bg-[#0F141D] py-2">
              <div className="text-[9px] tracking-[0.25em] text-[#6B778A]">{k}</div>
              <div className="text-xl font-bold text-white">{v}</div>
            </div>
          ))}
        </div>
        <p className={`mt-2 text-center text-[11px] tracking-[0.15em] ${won ? 'text-[#34D399]' : 'text-[#FCA5A5]'}`}>
          {verdict}{p.best !== undefined ? ` · BEST ${p.best}` : ''}
        </p>

        </div>
        <div className="[@media(max-height:520px)]:flex-1">
        <div className="mx-auto mt-4 [@media(max-height:520px)]:mt-0 grid w-fit gap-[3px]" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, clamp(1rem, 5.5dvh, 1.5rem))` }} aria-label="Final grid">
          {game.board.map((t, i) => (
            <div key={i} className={`aspect-square ${t.kind === 'source' ? 'rounded-full' : ''}`} style={{ background: glyph(t, sim.powered[i]).c }} />
          ))}
        </div>

        <button onClick={copy} className="mt-4 w-full cursor-pointer border border-[#7DD3FC] bg-[#7DD3FC] py-2.5 text-sm font-bold tracking-[0.25em] text-[#0B0E14] hover:bg-white">
          {copied === 'ok' ? '[ COPIED ✓ ]' : copied === 'fail' ? '[ COPY FAILED ]' : '[ COPY RESULT ]'}
        </button>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <button onClick={p.onRetry} className={ghost}>[ RETRY ]</button>
          <button onClick={p.onNext} className={ghost}>[ NEXT ▸ ]</button>
          <button onClick={p.onMenu} className={ghost}>[ MENU ]</button>
        </div>
        </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── app ─────────────────────────── */

export default function App() {
  const cal = useMemo(calendar, []);
  const [save, setSave] = useState<SaveData>(loadSave);
  const [screen, setScreen] = useState<'start' | 'play'>('start');
  const [game, setGame] = useState<Game>(() => fresh(cal.todayDay));

  const puzzle = PUZZLES[game.day - 1];
  const sim = useMemo(() => simulate(game.board), [game.board]);
  const moves = game.history.length;
  const streak = liveStreak(save, dateKey(new Date()));
  const playing = game.status === 'playing';

  const pickDay = (day: number) => setGame(fresh(day));
  const deploy = () => { setGame(fresh(game.day)); setScreen('play'); };

  const onTile = (i: number) => {
    if (!playing) return;
    const next = applyMove(game.board, i);
    if (!next) return;
    const used = moves + 1;
    const result = simulate(next);
    const status: Status = result.won ? 'won' : used >= puzzle.maxMoves ? 'lost' : 'playing';
    setGame({ ...game, board: next, history: [...game.history, game.board], status });
    if (status === 'won') {
      const updated = recordWin(save, game.day, used, dateKey(new Date()));
      setSave(updated);
      persist(updated);
    }
  };

  const undo = () => {
    if (!playing || !moves) return;
    setGame({ ...game, board: game.history[moves - 1], history: game.history.slice(0, -1) });
  };

  const fault = sim.faults > 0;
  const btn = 'flex-1 cursor-pointer border border-[#2F3B50] bg-[#0F141D] py-2.5 text-xs tracking-[0.25em] text-[#C8D1DE] hover:border-[#7DD3FC] hover:text-white disabled:cursor-not-allowed disabled:opacity-35';

  return (
    <div className="flex h-full select-none flex-col overflow-hidden bg-[#0B0E14] font-mono text-[#C8D1DE]">
      {screen === 'start' ? (
        <StartScreen label={cal.label} puzzleNo={cal.puzzleNo} streak={streak} cleared={save.completed.length} day={game.day} done={save.completed} onPick={pickDay} onDeploy={deploy} />
      ) : (
        <React.Fragment>
          <header className="flex shrink-0 items-center justify-between gap-2 px-3 pt-3">
            <button onClick={() => setScreen('start')} className="cursor-pointer text-sm font-bold tracking-[0.25em] text-white" aria-label="Back to menu">
              FAULTLINE <span className="text-[#6B778A]">#{cal.puzzleNo}</span>
            </button>
            <DayPill day={game.day} done={save.completed} onPick={pickDay} />
          </header>

          <section className="mx-auto grid w-full max-w-[680px] shrink-0 grid-cols-3 gap-2 px-3 pt-3">
            <Stat label="MOVES" value={`${String(moves).padStart(2, '0')}/${puzzle.maxMoves}`}>
              <Meter used={moves} max={puzzle.maxMoves} par={puzzle.parMoves} />
            </Stat>
            <Stat label="PAR" value={String(puzzle.parMoves).padStart(2, '0')} />
            <Stat label="BEST" value={save.bestMoves[game.day] !== undefined ? String(save.bestMoves[game.day]).padStart(2, '0') : '--'} />
          </section>

          <div className="mx-auto w-full max-w-[680px] shrink-0 px-3 pt-2">
            <div
              role="status"
              className={`truncate border px-3 py-1.5 text-[11px] tracking-[0.18em] ${fault ? 'fl-pulse border-[#7F1D1D] bg-[#2A1115] text-[#FCA5A5]' : 'border-[#232C3B] bg-[#0F141D] text-[#8A97AB]'}`}
            >
              {fault ? `⚠ OVERLOAD LIVE ×${sim.faults} · LOCKOUT RISK` : `CORES ${sim.coresOn}/${sim.cores} ENERGIZED · ${puzzle.name}`}
            </div>
          </div>

          <main className="mx-auto min-h-0 w-full max-w-[680px] flex-1 px-3 py-2">
            <div className="relative h-full w-full">
              <BoardView board={game.board} sim={sim} locked={!playing} onTile={onTile} />
            </div>
          </main>

          <footer className="mx-auto w-full max-w-[680px] shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="flex gap-2">
              <button onClick={undo} disabled={!playing || !moves} className={btn}>[ UNDO ]</button>
              <button onClick={() => setGame(fresh(game.day))} disabled={!moves && playing} className={btn}>[ RESET ]</button>
            </div>
            <p className="mt-2 text-center text-[10px] tracking-[0.15em] text-[#6B778A]">
              <span style={{ color: PAL.live }}>●</span> SOURCE <span style={{ color: PAL.core }}>◆</span> CORE <span style={{ color: PAL.over }}>⬢</span> OVERLOAD{' '}
              <span style={{ color: PAL.brkOn }}>▮</span><span style={{ color: PAL.brkOff }}>▯</span> BREAKER · TAP TO ROTATE / SWITCH
            </p>
          </footer>

          {!playing && (
            <EndCard
              puzzle={puzzle}
              game={game}
              sim={sim}
              puzzleNo={cal.puzzleNo}
              streak={streak}
              best={save.bestMoves[game.day]}
              onRetry={() => setGame(fresh(game.day))}
              onNext={() => pickDay((game.day % PUZZLES.length) + 1)}
              onMenu={() => setScreen('start')}
            />
          )}
        </React.Fragment>
      )}
    </div>
  );
}

const mount = document.getElementById('root');
if (mount) createRoot(mount).render(<App />);
