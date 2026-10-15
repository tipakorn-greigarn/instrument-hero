// Instrument definitions. To add an instrument, append an entry here; the
// arranger, sheet, pitch detector, and grader all read from this table.

export interface Instrument {
  id: string;
  name: string;
  clef: 'treble' | 'bass';
  /** Semitones the instrument sounds below its written pitch (12 for guitar and bass). */
  soundsBelowWritten: number;
  /**
   * Written key relative to concert key, in fifths. 0 for concert-pitch and
   * octave-transposing instruments; +2 for Bb instruments, +3 for Eb, +1 for F.
   */
  writtenKeyFifths: number;
  /** Playable sounding range as MIDI numbers. */
  low: number;
  high: number;
  /** Sounding pitch the default octave placement is centered on. */
  center: number;
  /**
   * Whether a change of pitch without a new attack counts as a new note.
   * Off for plucked strings (ringing strings would cause false notes), on
   * for sustained instruments that slur.
   */
  legato: boolean;
}

export const INSTRUMENTS: Instrument[] = [
  {
    id: 'guitar',
    name: 'Guitar',
    clef: 'treble',
    soundsBelowWritten: 12,
    writtenKeyFifths: 0,
    low: 40, // E2
    high: 76, // E5, 12th fret of the first string
    center: 57,
    legato: false,
  },
  {
    id: 'bass4',
    name: 'Bass (4-string)',
    clef: 'bass',
    soundsBelowWritten: 12,
    writtenKeyFifths: 0,
    low: 28, // E1
    high: 55, // G3, 12th fret of the G string
    center: 38,
    legato: false,
  },
];

export function instrumentById(id: string): Instrument {
  return INSTRUMENTS.find((i) => i.id === id) ?? INSTRUMENTS[0];
}
