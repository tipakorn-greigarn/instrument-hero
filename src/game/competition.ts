// Competition mode: fixed settings so runs can be ranked against each other,
// and points that reward harder difficulty and faster tempo. All songs share
// one high-score table each, whatever the instrument, difficulty, or tempo.

import { MAX_BPM, MIN_BPM } from '../storage';

export interface TempoLevel {
  id: string;
  name: string;
  /** Multiplies the song's own tempo. */
  speed: number;
  /** Multiplies the points. */
  points: number;
}

export const TEMPO_LEVELS: TempoLevel[] = [
  { id: 'slow', name: 'Slow', speed: 0.75, points: 0.8 },
  { id: 'medium', name: 'Medium', speed: 1, points: 1 },
  { id: 'fast', name: 'Fast', speed: 1.25, points: 1.25 },
];

/** Points multiplier per difficulty id. */
export const DIFFICULTY_POINTS: Record<string, number> = { easy: 0.8, normal: 1, hard: 1.25 };

/** Every song is written in C major; competition plays it there, at the default octave, with the metronome and no guide. */
export const COMPETITION_KEY = 'C';

export function tempoLevelById(id: string): TempoLevel {
  return TEMPO_LEVELS.find((t) => t.id === id) ?? TEMPO_LEVELS[1];
}

export function competitionBpm(songBpm: number, level: string): number {
  return Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(songBpm * tempoLevelById(level).speed)));
}

/** Points for a run: accuracy (0 to 100) x 10, scaled by difficulty and tempo. A perfect Normal, Medium run is 1000. */
export function points(score: number, difficulty: string, level: string): number {
  return Math.round(score * 10 * (DIFFICULTY_POINTS[difficulty] ?? 1) * tempoLevelById(level).points);
}
