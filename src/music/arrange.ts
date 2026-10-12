// Places a song in a key and octave for an instrument, producing written
// pitches for the staff and sounding pitches for the grader.

import type { Instrument } from './instruments';
import type { Song } from './songs';
import { keyByFifths, pitchToMidi, transposeFromC, type KeyDef, type Pitch } from './theory';

export interface ArrangedNote {
  measure: number;
  /** Written pitch, null for a rest. */
  pitch: Pitch | null;
  /** Sounding MIDI number, null for a rest. */
  midi: number | null;
  /** Start position in quarter notes from the beginning of the song. */
  start: number;
  quarters: number;
  duration: string;
  dots: number;
  /** Index among the non-rest notes, -1 for a rest. */
  noteIndex: number;
}

export interface Arrangement {
  song: Song;
  instrument: Instrument;
  concertKey: KeyDef;
  writtenKey: KeyDef;
  octaveShift: number;
  measures: ArrangedNote[][];
  /** Non-rest notes in playing order. */
  notes: ArrangedNote[];
  totalQuarters: number;
}

export interface OctaveOption {
  shift: number;
  /** Sounding range of the song at this placement. */
  low: number;
  high: number;
  fits: boolean;
}

function writtenKeyFor(concertKey: KeyDef, instrument: Instrument): KeyDef {
  return keyByFifths(concertKey.fifths + instrument.writtenKeyFifths);
}

function soundingRange(song: Song, key: KeyDef, instrument: Instrument, shift: number): [number, number] {
  let low = Infinity;
  let high = -Infinity;
  for (const measure of song.measures) {
    for (const note of measure) {
      if (!note.pitch) continue;
      const midi = pitchToMidi(transposeFromC(note.pitch, key, shift)) - instrument.soundsBelowWritten;
      low = Math.min(low, midi);
      high = Math.max(high, midi);
    }
  }
  return [low, high];
}

/**
 * Octave placements of the song that fit the instrument. If none fit, the
 * single closest placement is returned with fits=false.
 */
export function octaveOptions(song: Song, concertKey: KeyDef, instrument: Instrument): OctaveOption[] {
  const key = writtenKeyFor(concertKey, instrument);
  const all: OctaveOption[] = [];
  for (let shift = -5; shift <= 4; shift++) {
    const [low, high] = soundingRange(song, key, instrument, shift);
    all.push({ shift, low, high, fits: low >= instrument.low && high <= instrument.high });
  }
  const fitting = all.filter((o) => o.fits);
  if (fitting.length > 0) return fitting;
  return [closestTo(all, instrument.center)];
}

function closestTo(options: OctaveOption[], center: number): OctaveOption {
  const distance = (o: OctaveOption) => Math.abs((o.low + o.high) / 2 - center);
  return options.reduce((best, o) => (distance(o) < distance(best) ? o : best));
}

/** The placement whose range is centered closest to the instrument's home register. */
export function defaultOctave(options: OctaveOption[], instrument: Instrument): number {
  return closestTo(options, instrument.center).shift;
}

export function arrange(song: Song, concertKey: KeyDef, instrument: Instrument, octaveShift: number): Arrangement {
  const writtenKey = writtenKeyFor(concertKey, instrument);
  const measures: ArrangedNote[][] = [];
  const notes: ArrangedNote[] = [];
  let position = 0;
  song.measures.forEach((measure, m) => {
    const out: ArrangedNote[] = [];
    for (const note of measure) {
      const pitch = note.pitch ? transposeFromC(note.pitch, writtenKey, octaveShift) : null;
      const arranged: ArrangedNote = {
        measure: m,
        pitch,
        midi: pitch ? pitchToMidi(pitch) - instrument.soundsBelowWritten : null,
        start: position,
        quarters: note.quarters,
        duration: note.duration,
        dots: note.dots,
        noteIndex: pitch ? notes.length : -1,
      };
      if (pitch) notes.push(arranged);
      out.push(arranged);
      position += note.quarters;
    }
    measures.push(out);
  });
  return { song, instrument, concertKey, writtenKey, octaveShift, measures, notes, totalQuarters: position };
}
