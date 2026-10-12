// Turns a stream of audio into note events: an attack time plus the pitch
// that followed it. Pure logic, no Web Audio dependency, so it can be tested
// with synthetic signals.

import { PitchDetector, decimateTail } from '../audio/pitch';
import { freqToMidi, midiToFreq } from '../music/theory';

export interface NoteEvent {
  /** Estimated attack time, in the same clock as process(). */
  t: number;
  /** Fractional MIDI pitch, null if the attack had no clear pitch. */
  midi: number | null;
  resolved: boolean;
}

export interface Frame {
  t: number;
  midi: number | null;
  level: number;
}

export interface TrackerOptions {
  sampleRate: number;
  /** Lowest and highest sounding MIDI note expected. */
  lowMidi: number;
  highMidi: number;
  /** Treat a pitch change without an attack as a new note. */
  legato: boolean;
  /** RMS level below which the input is treated as silence. */
  gate: number;
}

const BLOCK_SECONDS = 0.005;
const ONSET_RATIO = 1.5;
const REFRACTORY_SECONDS = 0.07;
const LOOKBACK_SECONDS = 0.1;
const MIN_CLARITY = 0.8;
/** Pitch frames within this many semitones count as the same pitch. */
const STABLE_SPREAD = 0.4;
const MAX_FRAMES = 40000;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export class NoteTracker {
  readonly events: NoteEvent[] = [];
  readonly frames: Frame[] = [];
  /** Length of the pitch analysis window in seconds. */
  readonly pitchWindow: number;
  /** Raw samples process() needs in its buffer. */
  readonly minBuffer: number;
  /** Current short-term RMS level. */
  level = 0;
  /** Most recent detected pitch, null when silent or unclear. */
  midi: number | null = null;

  private readonly sr: number;
  private readonly detector: PitchDetector;
  private readonly factor: number;
  private readonly decimated: Float32Array;
  private readonly block: number;
  private readonly envBlocks: number;
  private readonly envWindow: number;
  private readonly lookbackBlocks: number;
  private readonly energies: number[] = [];
  private readonly envelope: number[] = [];
  private lastNow = -1;
  private lastOnset = -Infinity;
  private skip = 0;
  private candidates: number[] = [];
  private run: { midi: number; t: number; count: number } | null = null;
  private currentMidi: number | null = null;

  constructor(private readonly opts: TrackerOptions) {
    this.sr = opts.sampleRate;
    const minFreq = midiToFreq(opts.lowMidi) * 0.94;
    const maxFreq = midiToFreq(opts.highMidi + 12) * 1.06;

    this.factor = Math.max(1, Math.floor(this.sr / 11025));
    const rate = this.sr / this.factor;
    this.pitchWindow = Math.max(0.05, 3.2 / minFreq);
    const size = Math.ceil(this.pitchWindow * rate);
    this.detector = new PitchDetector(rate, size, minFreq, maxFreq);
    this.decimated = new Float32Array(size);
    this.minBuffer = size * this.factor;

    this.block = Math.max(16, Math.round(this.sr * BLOCK_SECONDS));
    this.envWindow = Math.max(0.012, 1.2 / minFreq);
    this.envBlocks = Math.max(2, Math.round((this.envWindow * this.sr) / this.block));
    this.lookbackBlocks = Math.round((LOOKBACK_SECONDS * this.sr) / this.block);
  }

  /**
   * Feed the most recent audio. `buffer` holds the latest samples, its last
   * sample taken at time `now` (seconds). Successive calls may overlap.
   */
  process(buffer: Float32Array, now: number): void {
    const len = buffer.length;
    if (this.lastNow < 0) this.lastNow = now;
    const fresh = Math.min(len, Math.max(0, Math.round((now - this.lastNow) * this.sr)));
    const blocks = Math.floor(fresh / this.block);
    const start = len - fresh;
    for (let b = 0; b < blocks; b++) {
      const i0 = start + b * this.block;
      let energy = 0;
      for (let i = i0; i < i0 + this.block; i++) energy += buffer[i] * buffer[i];
      const tEnd = now - (len - (i0 + this.block)) / this.sr;
      this.pushBlock(energy / this.block, tEnd);
    }
    this.lastNow = now - (fresh - blocks * this.block) / this.sr;

    let midi: number | null = null;
    if (len >= this.minBuffer && this.level > this.opts.gate * 0.7) {
      decimateTail(buffer, this.factor, this.decimated);
      const result = this.detector.detect(this.decimated);
      if (result && result.clarity >= MIN_CLARITY) midi = freqToMidi(result.freq);
    }
    this.midi = midi;
    this.frames.push({ t: now, midi, level: this.level });
    if (this.frames.length > MAX_FRAMES) this.frames.splice(0, MAX_FRAMES / 2);

    this.resolvePending(now, midi);
    if (this.opts.legato) this.trackPitchChange(now, midi);
  }

  private pushBlock(energy: number, tEnd: number): void {
    const n = this.envBlocks;
    this.energies.push(energy);
    if (this.energies.length > n) this.energies.shift();
    let sum = 0;
    for (const e of this.energies) sum += e;
    const env = Math.sqrt(sum / n);
    this.level = env;

    // Reference level: the quietest the envelope has been in the recent past,
    // not counting the window that the current envelope already covers. Using
    // the minimum catches a re-plucked string, which dips before it rises.
    // History restarts after each attack, once the envelope has moved past
    // it, so the silence before a note cannot trigger a second attack.
    const history = this.envelope;
    let reference = Infinity;
    for (let i = 0; i < history.length - n + 1; i++) reference = Math.min(reference, history[i]);
    if (this.skip > 0) {
      this.skip--;
    } else {
      history.push(env);
      if (history.length > n + this.lookbackBlocks) history.shift();
    }

    if (
      env > this.opts.gate &&
      env > ONSET_RATIO * reference &&
      tEnd - this.lastOnset > REFRACTORY_SECONDS
    ) {
      this.lastOnset = tEnd;
      history.length = 0;
      this.skip = n;
      this.forceResolve();
      this.candidates = [];
      this.events.push({ t: tEnd - 0.4 * this.envWindow, midi: null, resolved: false });
    }
  }

  private pending(): NoteEvent | null {
    const last = this.events[this.events.length - 1];
    return last && !last.resolved ? last : null;
  }

  private forceResolve(): void {
    const event = this.pending();
    if (!event) return;
    event.midi = this.candidates.length ? median(this.candidates) : null;
    event.resolved = true;
    if (event.midi !== null) this.currentMidi = event.midi;
  }

  /** Assign a pitch to the latest attack once the analysis window has moved past it. */
  private resolvePending(now: number, midi: number | null): void {
    const event = this.pending();
    if (!event) return;
    if (midi !== null && now >= event.t + 0.7 * this.pitchWindow) this.candidates.push(midi);
    const c = this.candidates;
    if (c.length >= 3) {
      const last = c.slice(-3);
      if (Math.max(...last) - Math.min(...last) <= STABLE_SPREAD) {
        event.midi = median(last);
        event.resolved = true;
        this.currentMidi = event.midi;
        return;
      }
    }
    if (now > event.t + this.pitchWindow + 0.15) this.forceResolve();
  }

  /** Legato instruments: a new stable pitch without an attack is a new note. */
  private trackPitchChange(now: number, midi: number | null): void {
    if (midi === null) {
      this.run = null;
      return;
    }
    if (this.run && Math.abs(midi - this.run.midi) <= STABLE_SPREAD) {
      this.run.count++;
    } else {
      this.run = { midi, t: now, count: 1 };
    }
    if (this.run.count !== 3 || this.pending()) return;
    if (now - this.lastOnset < this.pitchWindow + 0.15) return;
    if (this.currentMidi !== null && Math.abs(this.run.midi - this.currentMidi) < 0.7) return;
    this.currentMidi = this.run.midi;
    this.events.push({ t: this.run.t - 0.5 * this.pitchWindow, midi: this.run.midi, resolved: true });
  }
}
