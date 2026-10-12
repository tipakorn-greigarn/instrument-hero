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

export const PERFECT_SECONDS = 0.045;
export const GOOD_SECONDS = 0.09;
/** Pitch tolerance in semitones. */
const PITCH_TOLERANCE = 0.5;
/** How long after a note's window closes before it is declared missed. */
const SETTLE_SECONDS = 0.3;
/** Fraction of the written length a note must ring to count as fully held. */
const HOLD_FRACTION = 0.5;
const TIMING_WEIGHT = 0.8;
const TIMING_SCORE: Record<Verdict, number> = { perfect: 1, good: 0.8, ok: 0.5, wrong: 0, miss: 0 };

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

  constructor(readonly targets: Target[]) {
    this.results = targets.map(() => null);
    this.matched = targets.map(() => null);
    // Each note owns the time up to halfway to its neighbors.
    this.tolerance = targets.map((target, i) => {
      const before = i > 0 ? target.time - targets[i - 1].time : Infinity;
      const after = i < targets.length - 1 ? targets[i + 1].time - target.time : Infinity;
      return Math.min(0.25, Math.max(0.06, 0.5 * Math.min(before, after)));
    });
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
        const correct = Math.abs(event.midi - target.midi) <= PITCH_TOLERANCE;
        const current = correct ? hit : other;
        if (!current || Math.abs(dt) < Math.abs(current.t - offset - target.time)) {
          if (correct) hit = event;
          else other = event;
        }
      }

      if (hit) {
        const dt = hit.t - offset - target.time;
        const abs = Math.abs(dt);
        const verdict: Verdict = abs <= PERFECT_SECONDS ? 'perfect' : abs <= GOOD_SECONDS ? 'good' : 'ok';
        this.used.add(hit);
        this.matched[i] = hit;
        this.results[i] = {
          verdict,
          dt,
          cents: (hit.midi! - target.midi) * 100,
          sustain: 1,
          score: TIMING_SCORE[verdict],
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
        r.score = TIMING_WEIGHT * TIMING_SCORE[r.verdict] + (1 - TIMING_WEIGHT) * r.sustain;
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
    const need = HOLD_FRACTION * target.dur;
    const end = target.time + target.dur + 0.1;
    let last = attack;
    let seen = false;
    for (const frame of frames) {
      const t = frame.t - offset;
      if (t < attack) continue;
      if (t > end) break;
      const correct = frame.midi !== null && Math.abs(frame.midi - target.midi) <= PITCH_TOLERANCE;
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
