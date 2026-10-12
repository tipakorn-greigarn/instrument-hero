// Settings and best scores, kept in localStorage.

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
  /** Input device id, or SIMULATED. */
  device: string;
  channel: Channel;
  /** Extra timing compensation in milliseconds, added to what the browser reports. */
  latencyMs: number;
  /** Input level treated as silence, in dBFS. */
  gateDb: number;
}

export interface BestScore {
  score: number;
  grade: string;
  bpm: number;
  key: string;
  date: string;
}

export const SIMULATED = 'simulated';

const SETTINGS_KEY = 'instrument-hero.settings';
const BEST_KEY = 'instrument-hero.best';

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
