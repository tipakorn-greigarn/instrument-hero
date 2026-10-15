// Settings, free-play best scores, and competition high scores, kept in localStorage.

import type { Channel } from './audio/engine';

export interface Settings {
  song: string;
  instrument: string;
  key: string;
  /** Octave shift, null to use the default placement. */
  octave: number | null;
  bpm: number;
  difficulty: string;
  metronome: boolean;
  guide: boolean;
  /** Input device id, or one of the SIMULATED values. */
  device: string;
  channel: Channel;
  /** Extra timing compensation in milliseconds, added to what the browser reports. */
  latencyMs: number;
  /** Input level treated as silence, in dBFS. */
  gateDb: number;
  mode: Mode;
  /** Competition tempo level: slow, medium, or fast. */
  tempo: string;
  /** Name last entered for a high score, offered again next time. */
  playerName: string;
}

export type Mode = 'free' | 'competition';

export interface BestScore {
  score: number;
  grade: string;
  bpm: number;
  key: string;
  date: string;
}

/** One row of a song's competition table. */
export interface HighScore {
  name: string;
  points: number;
  /** Accuracy, 0 to 100. */
  score: number;
  grade: string;
  instrument: string;
  difficulty: string;
  tempo: string;
  date: string;
}

/** Rows kept per song. */
export const HIGH_SCORE_LIMIT = 10;
export const MAX_NAME_LENGTH = 20;

export const MIN_BPM = 30;
export const MAX_BPM = 240;

export const SIMULATED = 'simulated';
/** A simulated player that makes deliberate mistakes, to show what feedback looks like. */
export const SIMULATED_SLOPPY = 'simulated-sloppy';

const SETTINGS_KEY = 'instrument-hero.settings';
const BEST_KEY = 'instrument-hero.best';
const HIGH_KEY = 'instrument-hero.highscores';

export const DEFAULT_SETTINGS: Settings = {
  song: 'hot-cross-buns',
  instrument: 'bass4',
  key: 'C',
  octave: null,
  bpm: 80,
  difficulty: 'normal',
  metronome: true,
  guide: false,
  device: '',
  channel: 'mix',
  latencyMs: 0,
  gateDb: -45,
  mode: 'free',
  tempo: 'medium',
  playerName: '',
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private window); the app works without it.
  }
}

export function loadSettings(): Settings {
  return read(SETTINGS_KEY, { ...DEFAULT_SETTINGS });
}

export function saveSettings(settings: Settings): void {
  write(SETTINGS_KEY, settings);
}

/** Best scores are kept per difficulty. Normal keeps the original, shorter key. */
function bestId(song: string, instrument: string, difficulty: string): string {
  return difficulty === 'normal' ? `${song}|${instrument}` : `${song}|${instrument}|${difficulty}`;
}

export function loadBest(song: string, instrument: string, difficulty: string): BestScore | null {
  return read<Record<string, BestScore>>(BEST_KEY, {})[bestId(song, instrument, difficulty)] ?? null;
}

/** Records the score if it beats the stored best. Returns true for a new best. */
export function saveBest(song: string, instrument: string, difficulty: string, best: BestScore): boolean {
  const all = read<Record<string, BestScore>>(BEST_KEY, {});
  const id = bestId(song, instrument, difficulty);
  const previous = all[id];
  if (previous && previous.score >= best.score) return false;
  all[id] = best;
  write(BEST_KEY, all);
  return true;
}

/**
 * Where a run with these points would land in a table (0 is the top), or null
 * if it does not make the cut. A tie ranks below the rows already there.
 */
export function rankFor(table: HighScore[], points: number): number | null {
  const rank = table.filter((row) => row.points >= points).length;
  return rank < HIGH_SCORE_LIMIT ? rank : null;
}

/** The table with the row inserted at its rank and trimmed to the limit. */
export function insertScore(table: HighScore[], row: HighScore): { table: HighScore[]; rank: number | null } {
  const rank = rankFor(table, row.points);
  if (rank === null) return { table, rank };
  return { table: [...table.slice(0, rank), row, ...table.slice(rank)].slice(0, HIGH_SCORE_LIMIT), rank };
}

export function loadHighScores(song: string): HighScore[] {
  return read<Record<string, HighScore[]>>(HIGH_KEY, {})[song] ?? [];
}

/** Adds the row if it makes the song's table. Returns its rank, or null. */
export function saveHighScore(song: string, row: HighScore): number | null {
  const all = read<Record<string, HighScore[]>>(HIGH_KEY, {});
  const { table, rank } = insertScore(all[song] ?? [], row);
  if (rank === null) return null;
  all[song] = table;
  write(HIGH_KEY, all);
  return rank;
}
