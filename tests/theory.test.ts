import { describe, expect, it } from 'vitest';
import { arrange, defaultOctave, octaveOptions } from '../src/music/arrange';
import { INSTRUMENTS, instrumentById } from '../src/music/instruments';
import { GROUPS, SONGS, barQuarters, homeKey, keyLabel, parseChords, songKeys, parseNotation, songById, songsByGroup, type Song } from '../src/music/songs';
import { KEYS, keyById, parsePitch, pitchName, pitchToMidi, transposeChord, transposeFromC } from '../src/music/theory';

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
        const expected = i === 0 && song.pickup ? song.pickup : barQuarters(song);
        expect(total, `${song.id} bar ${i + 1}`).toBeCloseTo(expected);
      });
    }
  });

  it('ties only notes of the same pitch', () => {
    for (const song of SONGS) {
      const notes = song.measures.flat();
      notes.forEach((n, i) => {
        if (!n.tie) return;
        const next = notes[i + 1];
        expect(next?.pitch, `${song.id} note ${i + 1}`).toEqual(n.pitch);
      });
    }
  });

  it('gives chord symbols for every bar, each with a root', () => {
    for (const song of SONGS) {
      if (!song.chords) continue;
      expect(song.chordBars.length, song.id).toBe(song.measures.length);
      for (const symbol of song.chordBars.flat()) expect(transposeChord(symbol, keyById('Db')), `${song.id} ${symbol}`).not.toBeNull();
    }
  });

  it('transposes chord symbols with correct spelling', () => {
    expect(transposeChord('Bm7b5', keyById('Bb'))).toBe('Am7b5');
    expect(transposeChord('E7', keyById('Bb'))).toBe('D7');
    expect(transposeChord('Fm7', keyById('Db'))).toBe('Gbm7');
    expect(transposeChord('C#m7', keyById('F#'))).toBe('F##m7');
  });

  it('lists only known keys for every song, without repeats', () => {
    for (const song of SONGS) {
      const keys = songKeys(song);
      for (const k of keys) expect(KEYS.map((key) => key.id), song.id).toContain(k);
      expect(new Set(keys).size, song.id).toBe(keys.length);
      expect(homeKey(song)).toBe(keys[0]);
    }
  });

  it('names minor songs by their relative minor', () => {
    expect(keyLabel(songById('arp-autumn-leaves'), 'Bb')).toBe('G minor');
    expect(keyLabel(songById('arp-minor-blues'), 'Ab')).toBe('F minor');
    expect(keyLabel(songById('arp-autumn-leaves'), 'G')).toBe('E minor');
    expect(keyLabel(songById('saints'), 'F')).toBe('F major');
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
  it('fits every song on every instrument in each of its keys', () => {
    for (const song of SONGS) {
      for (const instrument of INSTRUMENTS) {
        for (const key of songKeys(song).map(keyById)) {
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

describe('ties and pickups', () => {
  const song: Song = {
    id: 'test',
    title: 'Test',
    group: 'Warm-ups',
    time: [4, 4],
    beatQuarters: 1,
    bpm: 100,
    pickup: 1,
    notation: 'G4 | C5:w~ | C5:h~ C5 r | E4:e~ E4:e F4 G4:h',
    measures: parseNotation('G4 | C5:w~ | C5:h~ C5 r | E4:e~ E4:e F4 G4:h'),
    chordBars: parseChords('- | C | F G | C'),
  };
  const arrangement = arrange(song, keyById('C'), instrumentById('guitar'), 0);

  it('starts the pickup so the next bar falls on a downbeat', () => {
    expect(arrangement.leadIn).toBe(3);
    expect(arrangement.notes[0].start).toBe(3);
    expect(arrangement.notes[1].start).toBe(4);
    expect(arrangement.totalQuarters).toBe(16);
  });

  it('plays and grades a tied chain as one note', () => {
    expect(arrangement.notes.map((n) => n.held)).toEqual([1, 7, 1, 1, 2]);
    expect(arrangement.measures[2].map((n) => n.tiedFrom)).toEqual([true, true, false]);
    expect(arrangement.measures[2].every((n) => n.noteIndex === -1)).toBe(true);
  });

  it('places chord symbols on the beats of their bar', () => {
    expect(arrangement.chords).toEqual([
      { start: 4, name: 'C' },
      { start: 8, name: 'F' },
      { start: 10, name: 'G' },
      { start: 12, name: 'C' },
    ]);
  });
});

describe('arpeggio exercises', () => {
  const midis = (songId: string, instrumentId: string, keyId: string) => {
    const song = songById(songId);
    const instrument = instrumentById(instrumentId);
    const key = keyById(keyId);
    const arrangement = arrange(song, key, instrument, defaultOctave(octaveOptions(song, key, instrument), instrument));
    return arrangement.measures.map((bar) => bar.map((n) => n.midi));
  };

  it('starts on the lowest root, then takes the nearest root; up, then down in the second bar of a two-bar chord', () => {
    const bars = midis('arp-251-major', 'bass4', 'C');
    expect(bars[0]).toEqual([38, 41, 45, 48]); // Dm7 from D2, the lowest D
    expect(bars[1]).toEqual([43, 47, 50, 53]); // G7 from G2, a fourth up rather than a fifth down
    expect(bars[2]).toEqual([36, 40, 43, 47]); // Cmaj7 from C2: C3 would leave no room for the octave
    expect(bars[3]).toEqual([48, 47, 43, 40]); // and down from C3
    expect(bars[7]).toEqual([36]); // final root, held
  });

  it('moves a half step rather than jumping an octave', () => {
    // Rhythm changes in Bb, bar 6: Ebmaj7 then Edim7.
    const bar = midis('arp-rhythm-changes', 'bass4', 'Bb')[5];
    expect(bar[2]! - bar[0]!).toBe(1);
  });

  it('keeps every arpeggio on the instrument in each of its keys', () => {
    for (const song of SONGS.filter((s) => s.arpeggio)) {
      for (const instrument of INSTRUMENTS) {
        for (const keyId of songKeys(song)) {
          const all = midis(song.id, instrument.id, keyId).flat() as number[];
          expect(Math.min(...all), `${song.id} ${instrument.id} ${keyId}`).toBeGreaterThanOrEqual(instrument.low);
          expect(Math.max(...all), `${song.id} ${instrument.id} ${keyId}`).toBeLessThanOrEqual(instrument.high);
        }
      }
    }
  });

  it('places the roots for the instrument and key', () => {
    expect(midis('arp-251-major', 'guitar', 'C')[0][0]).toBe(50); // D3, the lowest D on guitar
    expect(midis('arp-251-major', 'bass4', 'F')[0][0]).toBe(31); // Gm7 from G1
  });

  it('plays two chords in a bar as root and third of each, in quarters', () => {
    const bar = songById('arp-rhythm-changes').measures[0];
    expect(bar.map((n) => n.quarters)).toEqual([1, 1, 1, 1]);
    expect(bar.map((n) => n.chordTone!.degree)).toEqual([0, 1, 0, 1]);
    expect(bar.map((n) => n.chordTone!.symbol)).toEqual(['Cmaj7', 'Cmaj7', 'A7', 'A7']);
  });

  it('keeps the standards to their 8-bar A sections', () => {
    expect(songById('arp-autumn-leaves').measures).toHaveLength(8);
    expect(songById('arp-rhythm-changes').measures).toHaveLength(8);
  });
});
