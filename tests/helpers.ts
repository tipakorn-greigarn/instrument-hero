import { NoteTracker, type TrackerOptions } from '../src/game/tracker';
import { midiToFreq } from '../src/music/theory';

export interface SynthNote {
  time: number;
  dur: number;
  midi: number;
}

/** Render plucked-string-like notes: a few harmonics with a fast attack and a slow decay. */
export function renderNotes(notes: SynthNote[], sampleRate: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.ceil(seconds * sampleRate));
  for (const note of notes) {
    const freq = midiToFreq(note.midi);
    const start = Math.round(note.time * sampleRate);
    const length = Math.round(note.dur * sampleRate);
    for (let i = 0; i < length && start + i < out.length; i++) {
      const t = i / sampleRate;
      const attack = Math.min(1, t / 0.004);
      const release = Math.min(1, (note.dur - t) / 0.02);
      const env = attack * release * Math.exp(-1.5 * t);
      const phase = 2 * Math.PI * freq * t;
      out[start + i] +=
        0.3 * env * (Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase));
    }
  }
  return out;
}

/** Feed a rendered signal to a tracker the way the app does: overlapping tails at ~60 Hz. */
export function runTracker(signal: Float32Array, opts: TrackerOptions, bufferSize = 16384): NoteTracker {
  const tracker = new NoteTracker(opts);
  const hop = Math.round(opts.sampleRate / 60);
  const buffer = new Float32Array(bufferSize);
  for (let end = hop; end <= signal.length; end += hop) {
    buffer.fill(0);
    const from = Math.max(0, end - bufferSize);
    buffer.set(signal.subarray(from, end), bufferSize - (end - from));
    tracker.process(buffer, end / opts.sampleRate);
  }
  return tracker;
}
