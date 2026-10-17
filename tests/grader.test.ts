import { describe, expect, it } from 'vitest';
import { Grader, difficultyById, gradeLetter, type Target } from '../src/game/grader';
import type { Frame, NoteEvent } from '../src/game/tracker';
import { arrange, defaultOctave, octaveOptions } from '../src/music/arrange';
import { instrumentById } from '../src/music/instruments';
import { songById } from '../src/music/songs';
import { keyById } from '../src/music/theory';
import { renderNotes, runTracker } from './helpers';

const targets: Target[] = [
  { time: 0, dur: 0.5, midi: 60 },
  { time: 0.5, dur: 0.5, midi: 62 },
  { time: 1, dur: 0.5, midi: 64 },
  { time: 1.5, dur: 0.5, midi: 65 },
];

function event(t: number, midi: number): NoteEvent {
  return { t, midi, resolved: true };
}

function heldFrames(events: NoteEvent[], seconds: number): Frame[] {
  const frames: Frame[] = [];
  for (let t = 0; t < seconds; t += 1 / 60) {
    const current = [...events].reverse().find((e) => e.t <= t);
    frames.push({ t, midi: current ? current.midi : null, level: 0.1 });
  }
  return frames;
}

describe('Grader', () => {
  it('scores a clean performance at 100', () => {
    const events = targets.map((t) => event(t.time + 0.01, t.midi));
    const grader = new Grader(targets);
    const summary = grader.finalize(events, heldFrames(events, 2.2), 0);
    expect(summary.counts.perfect).toBe(4);
    expect(summary.score).toBeCloseTo(100);
    expect(summary.grade).toBe('S');
    expect(summary.meanDtMs).toBeCloseTo(10);
  });

  it('distinguishes timing grades, wrong notes, and misses', () => {
    const events = [event(0.07, 60), event(0.68, 62), event(1.0, 66)];
    const grader = new Grader(targets);
    const summary = grader.finalize(events, heldFrames(events, 2.2), 0);
    expect(summary.results.map((r) => r.verdict)).toEqual(['good', 'ok', 'wrong', 'miss']);
    expect(summary.results[0].dt).toBeCloseTo(0.07);
    expect(summary.results[2].playedMidi).toBe(66);
    expect(summary.results[2].dt).toBeCloseTo(0);
    expect(summary.results[2].timing).toBe('perfect');
    expect(summary.results[3].timing).toBeUndefined();
  });

  it('does not count the right note in the wrong octave', () => {
    const grader = new Grader(targets);
    const summary = grader.finalize([event(0, 72)], [], 0);
    expect(summary.results[0].verdict).toBe('wrong');
  });

  it('applies the time offset to events', () => {
    const events = targets.map((t) => event(t.time + 10.2, t.midi));
    const summary = new Grader(targets).finalize(events, [], 10.2);
    expect(summary.counts.perfect).toBe(4);
  });

  it('resolves hits immediately and misses only after the window closes', () => {
    const grader = new Grader(targets);
    const events = [event(0.02, 60)];
    expect(grader.update(events, 0, 0.05)).toEqual([0]);
    expect(grader.update(events, 0, 0.6)).toEqual([]);
    expect(grader.update(events, 0, 1.2)).toEqual([1]);
    expect(grader.results[1]!.verdict).toBe('miss');
  });

  it('penalizes notes that are cut short', () => {
    const events = targets.map((t) => event(t.time, t.midi));
    const frames = heldFrames(events, 2.2).map((f) => ({ ...f, midi: f.t % 0.5 < 0.05 ? f.midi : null }));
    const summary = new Grader(targets).finalize(events, frames, 0);
    expect(summary.counts.perfect).toBe(4);
    expect(summary.score).toBeLessThan(90);
    expect(summary.score).toBeGreaterThan(79);
  });

  it('maps scores to letters', () => {
    expect(gradeLetter(100)).toBe('S');
    expect(gradeLetter(90)).toBe('A');
    expect(gradeLetter(80)).toBe('B');
    expect(gradeLetter(40)).toBe('F');
  });
});

describe('timing and pitch breakdown', () => {
  it('reports pitch and timing separately', () => {
    // Right notes, but two early and one late; then one wrong note played on time.
    const events = [event(-0.07, 60), event(0.43, 62), event(1.12, 64), event(1.5, 70)];
    const summary = new Grader(targets).finalize(events, heldFrames(events, 2.2), 0);
    expect(summary.pitchPct).toBeCloseTo(75);
    expect(summary.timingPct).toBeCloseTo((100 * (0.8 + 0.8 + 0.5)) / 3);
    expect(summary.early).toBe(2);
    expect(summary.late).toBe(1);
  });

  it('gives full marks to both for a clean run and none without notes', () => {
    const events = targets.map((t) => event(t.time, t.midi));
    const clean = new Grader(targets).finalize(events, heldFrames(events, 2.2), 0);
    expect(clean.pitchPct).toBe(100);
    expect(clean.timingPct).toBe(100);
    const silent = new Grader(targets).finalize([], [], 0);
    expect(silent.pitchPct).toBe(0);
    expect(silent.timingPct).toBeNull();
  });
});

describe('difficulty', () => {
  const play = (level: string, events: NoteEvent[], frames: Frame[] = heldFrames(events, 2.2)) =>
    new Grader(targets, difficultyById(level)).finalize(events, frames, 0);

  it('grades the same timing more strictly at higher levels', () => {
    const events = targets.map((t) => event(t.time + 0.07, t.midi));
    expect(play('easy', events).counts.perfect).toBe(4);
    expect(play('normal', events).counts.good).toBe(4);
    expect(play('hard', events).counts.ok).toBe(4);
    const scores = ['easy', 'normal', 'hard'].map((level) => play(level, events).score);
    expect(scores[0]).toBeGreaterThan(scores[1]);
    expect(scores[1]).toBeGreaterThan(scores[2]);
  });

  it('accepts any octave only on easy', () => {
    const events = targets.map((t) => event(t.time, t.midi - 12));
    expect(play('easy', events).counts.perfect).toBe(4);
    expect(play('normal', events).counts.wrong).toBe(4);
  });

  it('requires tighter intonation on hard', () => {
    const events = targets.map((t) => event(t.time, t.midi + 0.4));
    expect(play('normal', events).counts.perfect).toBe(4);
    expect(play('hard', events).counts.wrong).toBe(4);
  });

  it('ignores note length on easy and weighs it most on hard', () => {
    const events = targets.map((t) => event(t.time, t.midi));
    expect(play('easy', events, []).score).toBeCloseTo(100);
    expect(play('normal', events, []).score).toBeCloseTo(80);
    expect(play('hard', events, []).score).toBeCloseTo(70);
  });

  it('narrows the hit window on hard', () => {
    const events = [event(0.2, 60)];
    expect(play('normal', events).results[0].verdict).toBe('ok');
    expect(play('hard', events).results[0].verdict).toBe('miss');
  });

  it('falls back to normal for an unknown level', () => {
    expect(difficultyById('nope').id).toBe('normal');
  });
});

describe('end to end', () => {
  for (const [instrumentId, songId, bpm] of [
    ['bass4', 'twinkle', 100],
    ['guitar', 'frere-jacques', 110],
    ['bass4', 'row-row', 70],
    ['guitar', 'hot-cross-buns', 120],
    ['bass4', 'jazz-blues', 120],
    ['bass4', 'saints', 100],
    ['guitar', 'closer-walk', 70],
  ] as const) {
    it(`grades a synthesized ${songId} on ${instrumentId} as near perfect`, () => {
      const sampleRate = 48000;
      const instrument = instrumentById(instrumentId);
      const song = songById(songId);
      const key = keyById('G');
      const arrangement = arrange(song, key, instrument, defaultOctave(octaveOptions(song, key, instrument), instrument));
      const secPerQuarter = 60 / bpm / song.beatQuarters;
      const lead = 0.5;
      const expected: Target[] = arrangement.notes.map((n) => ({
        time: n.start * secPerQuarter,
        dur: n.held * secPerQuarter,
        midi: n.midi!,
      }));
      const signal = renderNotes(
        expected.map((t) => ({ ...t, time: t.time + lead })),
        sampleRate,
        lead + arrangement.totalQuarters * secPerQuarter + 0.5,
      );
      const tracker = runTracker(signal, {
        sampleRate,
        lowMidi: instrument.low,
        highMidi: instrument.high,
        legato: instrument.legato,
        gate: 0.01,
      });
      const summary = new Grader(expected).finalize(tracker.events, tracker.frames, lead);
      expect(summary.counts.wrong + summary.counts.miss).toBe(0);
      expect(summary.counts.ok).toBe(0);
      expect(summary.score).toBeGreaterThan(92);
    });
  }
});
