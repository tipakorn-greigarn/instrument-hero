import { describe, expect, it } from 'vitest';
import { arrange, defaultOctave, octaveOptions } from '../src/music/arrange';
import { INSTRUMENTS, instrumentById } from '../src/music/instruments';
import { GROUPS, SONGS, barQuarters, songById, songsByGroup } from '../src/music/songs';
import { KEYS, keyById, parsePitch, pitchName, pitchToMidi, transposeFromC } from '../src/music/theory';

describe('theory', () => {
  it('converts pitches to MIDI', () => {
    expect(pitchToMidi(parsePitch('C4'))).toBe(60);
    expect(pitchToMidi(parsePitch('A4'))).toBe(69);
    expect(pitchToMidi(parsePitch('E1'))).toBe(28);
    expect(pitchToMidi(parsePitch('Bb3'))).toBe(58);
  });

  it('spells transposed notes according to the key', () => {
    const name = (pitch: string, key: string) => pitchName(transposeFromC(parsePitch(pitch), keyById(key), 0));
    expect(name('E4', 'D')).toBe('F#4');
    expect(name('B4', 'F')).toBe('E5');
    expect(name('F4', 'F')).toBe('Bb4');
    expect(name('B4', 'F#')).toBe('E#5');
    expect(name('F4', 'Db')).toBe('Gb4');
    expect(name('C4', 'B')).toBe('B4');
  });

  it('keeps every scale degree diatonic in every key', () => {
    const major = [0, 2, 4, 5, 7, 9, 11];
    for (const key of KEYS) {
      const tonic = pitchToMidi(transposeFromC(parsePitch('C4'), key, 0));
      ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'].forEach((p, degree) => {
        const moved = transposeFromC(parsePitch(p), key, 0);
        expect(pitchToMidi(moved) - tonic).toBe(major[degree]);
        expect(Math.abs(moved.alter)).toBeLessThanOrEqual(1);
      });
    }
  });
});

describe('songs', () => {
  it('fills every bar exactly', () => {
    for (const song of SONGS) {
      song.measures.forEach((measure, i) => {
        const total = measure.reduce((sum, n) => sum + n.quarters, 0);
        expect(total, `${song.id} bar ${i + 1}`).toBeCloseTo(barQuarters(song));
      });
    }
  });

  it('puts every song in exactly one known collection', () => {
    for (const song of SONGS) expect(GROUPS, song.id).toContain(song.group);
    const listed = songsByGroup().flatMap((g) => g.songs.map((s) => s.id));
    expect(listed.sort()).toEqual(SONGS.map((s) => s.id).sort());
  });

  it('has unique ids', () => {
    expect(new Set(SONGS.map((s) => s.id)).size).toBe(SONGS.length);
  });
});

describe('arrange', () => {
  it('fits every song on every instrument in every key', () => {
    for (const song of SONGS) {
      for (const instrument of INSTRUMENTS) {
        for (const key of KEYS) {
          const options = octaveOptions(song, key, instrument);
          expect(options.length, `${song.id} ${instrument.id} ${key.id}`).toBeGreaterThan(0);
          expect(options.every((o) => o.fits), `${song.id} ${instrument.id} ${key.id}`).toBe(true);
          const arrangement = arrange(song, key, instrument, defaultOctave(options, instrument));
          for (const note of arrangement.notes) {
            expect(note.midi!).toBeGreaterThanOrEqual(instrument.low);
            expect(note.midi!).toBeLessThanOrEqual(instrument.high);
          }
        }
      }
    }
  });

  it('writes guitar and bass an octave above where they sound', () => {
    const song = songById('twinkle');
    for (const id of ['guitar', 'bass4']) {
      const instrument = instrumentById(id);
      const options = octaveOptions(song, keyById('C'), instrument);
      const arrangement = arrange(song, keyById('C'), instrument, defaultOctave(options, instrument));
      const first = arrangement.notes[0];
      expect(pitchToMidi(first.pitch!) - first.midi!).toBe(12);
    }
  });

  it('places Twinkle in C on bass starting on C2', () => {
    const instrument = instrumentById('bass4');
    const song = songById('twinkle');
    const options = octaveOptions(song, keyById('C'), instrument);
    const arrangement = arrange(song, keyById('C'), instrument, defaultOctave(options, instrument));
    expect(arrangement.notes[0].midi).toBe(36);
    expect(arrangement.totalQuarters).toBe(48);
  });
});
