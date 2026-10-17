// Places a song in a key and octave for an instrument, producing written
// pitches for the staff and sounding pitches for the grader.

import type { Instrument } from './instruments';
import { barQuarters, type Song } from './songs';
import { chordTone, keyByFifths, parseChord, pitchToMidi, transposeChord, transposeFromC, type KeyDef, type Pitch } from './theory';

export interface ArrangedNote {
  measure: number;
  /** Written pitch, null for a rest. */
  pitch: Pitch | null;
  /** Sounding MIDI number, null for a rest. */
  midi: number | null;
  /** Start position in quarter notes from the beginning of the song. */
  start: number;
  quarters: number;
  /** How long the note sounds, including the notes tied to it; 0 for a rest or a tied continuation. */
  held: number;
  /** Continues the previous note through a tie; not played or graded on its own. */
  tiedFrom: boolean;
  /** Tied to the next note. */
  tie: boolean;
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
  /** Silent beats before the pickup, so bar 2 starts on a downbeat; 0 without a pickup. */
  leadIn: number;
  /** Chord symbols in the written key, with their positions in quarter notes. */
  chords: { start: number; name: string }[];
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
  if (song.arpeggio) {
    // Arpeggios are placed from each chord's lowest root, so there is one placement.
    const midis = arrange(song, concertKey, instrument, 0).notes.map((n) => n.midi!);
    const low = Math.min(...midis);
    const high = Math.max(...midis);
    return [{ shift: 0, low, high, fits: low >= instrument.low && high <= instrument.high }];
  }
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

/**
 * Written root for a chord of an arpeggio exercise. The first chord takes the
 * lowest root the instrument has; each later one takes the octave closest to
 * the previous root (the lower on a tie), so Eb to E is a half step up rather
 * than nearly an octave down. Roots stay an octave below the top of the
 * instrument, so the arpeggio and its octave always fit.
 */
function arpeggioRoot(symbol: string, writtenKey: KeyDef, instrument: Instrument, previous: number | null): Pitch {
  const root = transposeFromC(parseChord(symbol)!.root, writtenKey, 0);
  const sounding = (octave: number) => pitchToMidi({ ...root, octave }) - instrument.soundsBelowWritten;
  let best: number | null = null;
  for (let octave = -1; octave <= 9; octave++) {
    const midi = sounding(octave);
    if (midi < instrument.low || midi + 12 > instrument.high) continue;
    const better = best === null || (previous !== null && Math.abs(midi - previous) < Math.abs(sounding(best) - previous));
    if (better) best = octave;
  }
  return { ...root, octave: best! };
}

export function arrange(song: Song, concertKey: KeyDef, instrument: Instrument, octaveShift: number): Arrangement {
  const writtenKey = writtenKeyFor(concertKey, instrument);
  const measures: ArrangedNote[][] = [];
  const notes: ArrangedNote[] = [];
  const chords: Arrangement['chords'] = [];
  // A pickup starts part way through a bar, so the metronome and the bar
  // accents line up with the bars that follow.
  const leadIn = song.pickup ? barQuarters(song) - song.pickup : 0;
  let position = leadIn;
  /** The note a tie is holding over, if the previous note was tied. */
  let holding: ArrangedNote | null = null;
  /** Arpeggio exercises: the chord being played and its root, carried from note to note. */
  let chord: { symbol: string; root: Pitch } | null = null;
  song.measures.forEach((measure, m) => {
    const out: ArrangedNote[] = [];
    const length = measure.reduce((sum, n) => sum + n.quarters, 0);
    const barChords = song.chordBars[m] ?? [];
    barChords.forEach((symbol, i) => {
      const name = transposeChord(symbol, writtenKey);
      if (name) chords.push({ start: position + (i * length) / barChords.length, name });
    });
    for (const note of measure) {
      if (note.chordTone && note.chordTone.symbol !== chord?.symbol) {
        const previous = chord ? pitchToMidi(chord.root) - instrument.soundsBelowWritten : null;
        chord = { symbol: note.chordTone.symbol, root: arpeggioRoot(note.chordTone.symbol, writtenKey, instrument, previous) };
      }
      const pitch = note.chordTone
        ? chordTone(chord!.root, parseChord(note.chordTone.symbol)!.quality, note.chordTone.degree)
        : note.pitch
          ? transposeFromC(note.pitch, writtenKey, octaveShift)
          : null;
      const tiedFrom = holding !== null && pitch !== null;
      const arranged: ArrangedNote = {
        measure: m,
        pitch,
        midi: pitch ? pitchToMidi(pitch) - instrument.soundsBelowWritten : null,
        start: position,
        quarters: note.quarters,
        held: pitch && !tiedFrom ? note.quarters : 0,
        tiedFrom,
        tie: note.tie && pitch !== null,
        duration: note.duration,
        dots: note.dots,
        noteIndex: pitch && !tiedFrom ? notes.length : -1,
      };
      if (tiedFrom) holding!.held += note.quarters;
      else if (pitch) notes.push(arranged);
      holding = arranged.tie ? (holding ?? arranged) : null;
      out.push(arranged);
      position += note.quarters;
    }
    measures.push(out);
  });
  return { song, instrument, concertKey, writtenKey, octaveShift, measures, notes, totalQuarters: position, leadIn, chords };
}
