// Matches played note events against the expected notes and scores them.

import type { Frame, NoteEvent } from './tracker';

export interface Target {
  /** Expected attack time in seconds from the start of the song. */
  time: number;
  /** Expected length in seconds. */
  dur: number;
  midi: number;
}

export type Verdict = 'perfect' | 'good' | 'ok' | 'wrong' | 'miss';

export interface NoteResult {
  verdict: Verdict;
  /** Timing error in seconds, positive when late. Set for hits. */
  dt?: number;
  /** Pitch error in cents. Set for hits. */
  cents?: number;
  /** The pitch that was played instead, for wrong notes. */
  playedMidi?: number;
  /** 0-1, how much of the required length the note was held. */
  sustain: number;
  /** 0-1 */
  score: number;
}

export interface Summary {
  /** 0-100 */
  score: number;
  grade: string;
  counts: Record<Verdict, number>;
  /** Mean signed timing error of the hits in milliseconds, null without hits. */
  meanDtMs: number | null;
  /** Mean absolute pitch error of the hits in cents, null without hits. */
  meanAbsCents: number | null;
  results: NoteResult[];
}

/** Scoring rules for one difficulty level. */
export interface Difficulty {
  id: string;
  name: string;
  /** One-line description shown in the UI. */
  summary: string;
  /** Timing error limits in seconds for Perfect and Good. */
  perfect: number;
  good: number;
  /** Longest a note's hit window may reach to either side, in seconds. */
  maxWindow: number;
  /** Pitch tolerance in semitones. */
  pitchTolerance: number;
  /** Accept the right note name in any octave. */
  anyOctave: boolean;
  /** Timing score (0-1) for Good and for Early or Late. Perfect is always 1. */
  goodScore: number;
  okScore: number;
  /** Share of the note score that comes from timing; the rest is sustain. */
  timingWeight: number;
  /** Fraction of the written length a note must ring to count as fully held. */
  holdFraction: number;
}

export const DIFFICULTIES: Difficulty[] = [
  {
    id: 'easy',
    name: 'Easy',
    summary: 'Wide timing windows, any octave counts, note length is not scored.',
    perfect: 0.08,
    good: 0.15,
    maxWindow: 0.35,
    pitchTolerance: 0.5,
    anyOctave: true,
    goodScore: 0.9,
    okScore: 0.7,
    timingWeight: 1,
    holdFraction: 0.5,
  },
  {
    id: 'normal',
    name: 'Normal',
    summary: 'Perfect within 45 ms, exact octave, 20% of the score for holding notes.',
    perfect: 0.045,
    good: 0.09,
    maxWindow: 0.25,
    pitchTolerance: 0.5,
    anyOctave: false,
    goodScore: 0.8,
    okScore: 0.5,
    timingWeight: 0.8,
    holdFraction: 0.5,
  },
  {
    id: 'hard',
    name: 'Hard',
    summary: 'Perfect within 30 ms, pitch within 30 cents, 30% of the score for holding notes for most of their length.',
    perfect: 0.03,
    good: 0.06,
    maxWindow: 0.15,
    pitchTolerance: 0.3,
    anyOctave: false,
    goodScore: 0.7,
    okScore: 0.3,
    timingWeight: 0.7,
    holdFraction: 0.8,
  },
];

export function difficultyById(id: string): Difficulty {
  return DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[1];
}

/** How long after a note's window closes before it is declared missed. */
const SETTLE_SECONDS = 0.3;

export function gradeLetter(score: number): string {
  if (score >= 95) return 'S';
  if (score >= 88) return 'A';
  if (score >= 78) return 'B';
  if (score >= 65) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

export class Grader {
  readonly results: (NoteResult | null)[];
  private readonly tolerance: number[];
  private readonly matched: (NoteEvent | null)[];
  private readonly used = new Set<NoteEvent>();

  constructor(
    readonly targets: Target[],
    private readonly rules: Difficulty = difficultyById('normal'),
  ) {
    this.results = targets.map(() => null);
    this.matched = targets.map(() => null);
    // Each note owns the time up to halfway to its neighbors.
    this.tolerance = targets.map((target, i) => {
      const before = i > 0 ? target.time - targets[i - 1].time : Infinity;
      const after = i < targets.length - 1 ? targets[i + 1].time - target.time : Infinity;
      return Math.min(rules.maxWindow, Math.max(0.06, 0.5 * Math.min(before, after)));
    });
  }

  /** Pitch error in semitones; folded into one octave when any octave is accepted. */
  private pitchError(played: number, expected: number): number {
    const diff = played - expected;
    return this.rules.anyOctave ? diff - 12 * Math.round(diff / 12) : diff;
  }

  private timingScore(verdict: Verdict): number {
    if (verdict === 'perfect') return 1;
    if (verdict === 'good') return this.rules.goodScore;
    return verdict === 'ok' ? this.rules.okScore : 0;
  }

  /**
   * Resolve whatever can be resolved at song time `now`. `offset` is
   * subtracted from event times to convert them to song time. Returns the
   * indices of notes resolved by this call.
   */
  update(events: NoteEvent[], offset: number, now: number): number[] {
    const resolved: number[] = [];
    for (let i = 0; i < this.targets.length; i++) {
      if (this.results[i]) continue;
      const target = this.targets[i];
      const tol = this.tolerance[i];
      if (now < target.time - tol) break;

      let hit: NoteEvent | null = null;
      let other: NoteEvent | null = null;
      for (const event of events) {
        if (!event.resolved || event.midi === null || this.used.has(event)) continue;
        const dt = event.t - offset - target.time;
        if (Math.abs(dt) > tol) continue;
        const correct = Math.abs(this.pitchError(event.midi, target.midi)) <= this.rules.pitchTolerance;
        const current = correct ? hit : other;
        if (!current || Math.abs(dt) < Math.abs(current.t - offset - target.time)) {
          if (correct) hit = event;
          else other = event;
        }
      }

      if (hit) {
        const dt = hit.t - offset - target.time;
        const abs = Math.abs(dt);
        const verdict: Verdict = abs <= this.rules.perfect ? 'perfect' : abs <= this.rules.good ? 'good' : 'ok';
        this.used.add(hit);
        this.matched[i] = hit;
        this.results[i] = {
          verdict,
          dt,
          cents: this.pitchError(hit.midi!, target.midi) * 100,
          sustain: 1,
          score: this.timingScore(verdict),
        };
        resolved.push(i);
      } else if (now > target.time + tol + SETTLE_SECONDS) {
        if (other) {
          this.used.add(other);
          this.results[i] = { verdict: 'wrong', playedMidi: other.midi!, sustain: 0, score: 0 };
        } else {
          this.results[i] = { verdict: 'miss', sustain: 0, score: 0 };
        }
        resolved.push(i);
      }
    }
    return resolved;
  }

  /** Close out every remaining note, measure how long hits were held, and total the score. */
  finalize(events: NoteEvent[], frames: Frame[], offset: number): Summary {
    this.update(events, offset, Infinity);
    const counts: Record<Verdict, number> = { perfect: 0, good: 0, ok: 0, wrong: 0, miss: 0 };
    let total = 0;
    let dtSum = 0;
    let centsSum = 0;
    let hits = 0;
    const results = this.results.map((result, i) => {
      const r = result!;
      const event = this.matched[i];
      if (event) {
        r.sustain = this.sustain(this.targets[i], event.t - offset, frames, offset);
        const weight = this.rules.timingWeight;
        r.score = weight * this.timingScore(r.verdict) + (1 - weight) * r.sustain;
        dtSum += r.dt!;
        centsSum += Math.abs(r.cents!);
        hits++;
      }
      counts[r.verdict]++;
      total += r.score;
      return r;
    });
    const score = results.length ? (100 * total) / results.length : 0;
    return {
      score,
      grade: gradeLetter(score),
      counts,
      meanDtMs: hits ? (1000 * dtSum) / hits : null,
      meanAbsCents: hits ? centsSum / hits : null,
      results,
    };
  }

  /** How long the right pitch kept sounding after the attack, relative to the required hold. */
  private sustain(target: Target, attack: number, frames: Frame[], offset: number): number {
    const need = this.rules.holdFraction * target.dur;
    const end = target.time + target.dur + 0.1;
    let last = attack;
    let seen = false;
    for (const frame of frames) {
      const t = frame.t - offset;
      if (t < attack) continue;
      if (t > end) break;
      const correct =
        frame.midi !== null && Math.abs(this.pitchError(frame.midi, target.midi)) <= this.rules.pitchTolerance;
      if (correct) {
        last = t;
        seen = true;
      } else if (seen && t - last > 0.12) {
        break;
      }
    }
    return Math.max(0, Math.min(1, (last - attack) / need));
  }
}
