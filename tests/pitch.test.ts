import { describe, expect, it } from 'vitest';
import { PitchDetector } from '../src/audio/pitch';
import { NoteTracker } from '../src/game/tracker';
import { INSTRUMENTS } from '../src/music/instruments';
import { freqToMidi, midiToFreq } from '../src/music/theory';
import { renderNotes, runTracker, type SynthNote } from './helpers';

function tone(freq: number, sampleRate: number, size: number, harmonics: number[]): Float32Array {
  const out = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    harmonics.forEach((amp, h) => {
      out[i] += amp * Math.sin((2 * Math.PI * freq * (h + 1) * i) / sampleRate + h);
    });
  }
  return out;
}

describe('PitchDetector', () => {
  it('detects pure and harmonic tones within 5 cents', () => {
    const rate = 12000;
    const size = 1024;
    const detector = new PitchDetector(rate, size, 38, 1400);
    for (let midi = 28; midi <= 84; midi++) {
      for (const harmonics of [[1], [1, 0.6, 0.3], [0.3, 1, 0.5, 0.25]]) {
        const result = detector.detect(tone(midiToFreq(midi), rate, size, harmonics));
        expect(result, `midi ${midi}`).not.toBeNull();
        expect(Math.abs(freqToMidi(result!.freq) - midi) * 100, `midi ${midi} [${harmonics}]`).toBeLessThan(5);
        expect(result!.clarity).toBeGreaterThan(0.9);
      }
    }
  });

  it('returns null for silence', () => {
    const detector = new PitchDetector(12000, 1024, 38, 1400);
    expect(detector.detect(new Float32Array(1024))).toBeNull();
  });
});

describe('NoteTracker', () => {
  for (const sampleRate of [44100, 48000, 96000]) {
    for (const instrument of INSTRUMENTS) {
      it(`finds every note across the ${instrument.name} range at ${sampleRate} Hz`, () => {
        const notes: SynthNote[] = [];
        for (let midi = instrument.low, i = 0; midi <= instrument.high; midi += 3, i++) {
          notes.push({ time: 0.3 + i * 0.5, dur: 0.5, midi });
        }
        const seconds = notes[notes.length - 1].time + 1;
        const tracker = runTracker(renderNotes(notes, sampleRate, seconds), {
          sampleRate,
          lowMidi: instrument.low,
          highMidi: instrument.high,
          legato: false,
          gate: 0.01,
        });
        const pitched = tracker.events.filter((e) => e.midi !== null);
        expect(pitched.length).toBe(notes.length);
        pitched.forEach((event, i) => {
          expect(Math.abs(event.midi! - notes[i].midi), `pitch of note ${i}`).toBeLessThan(0.3);
          expect(Math.abs(event.t - notes[i].time), `timing of note ${i}`).toBeLessThan(0.03);
        });
      });
    }
  }

  it('detects repeated notes of the same pitch', () => {
    const sampleRate = 48000;
    const notes = [0, 1, 2, 3, 4, 5].map((i) => ({ time: 0.2 + i * 0.4, dur: 0.4, midi: 33 }));
    const tracker = runTracker(renderNotes(notes, sampleRate, 3), {
      sampleRate,
      lowMidi: 28,
      highMidi: 55,
      legato: false,
      gate: 0.01,
    });
    expect(tracker.events.filter((e) => e.midi !== null).length).toBe(6);
  });

  it('reports a slurred pitch change only in legato mode', () => {
    const sampleRate = 48000;
    const signal = new Float32Array(sampleRate * 2);
    let phase = 0;
    for (let i = 0; i < signal.length; i++) {
      const t = i / sampleRate;
      phase += (2 * Math.PI * midiToFreq(t < 1 ? 60 : 64)) / sampleRate;
      signal[i] = 0.3 * Math.min(1, t / 0.005) * Math.sin(phase);
    }
    const base = { sampleRate, lowMidi: 48, highMidi: 84, gate: 0.01 };
    const plucked = runTracker(signal, { ...base, legato: false });
    expect(plucked.events.length).toBe(1);
    const legato = runTracker(signal, { ...base, legato: true });
    expect(legato.events.length).toBe(2);
    expect(Math.round(legato.events[1].midi!)).toBe(64);
    expect(Math.abs(legato.events[1].t - 1)).toBeLessThan(0.06);
  });

  it('ignores silence', () => {
    const tracker = new NoteTracker({ sampleRate: 48000, lowMidi: 40, highMidi: 76, legato: false, gate: 0.01 });
    const buffer = new Float32Array(16384);
    for (let i = 1; i < 60; i++) tracker.process(buffer, i / 60);
    expect(tracker.events.length).toBe(0);
    expect(tracker.midi).toBeNull();
  });
});
