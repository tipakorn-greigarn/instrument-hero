// Song library. Every song is written in C major; the arranger transposes it
// to the selected key and octave.
//
// Notation: tokens separated by spaces, bars separated by "|".
//   C4      quarter note (default duration)
//   G4:h    explicit duration: w h q e s, with a trailing "." for dotted
//   r:q     rest
//
// Each song belongs to one collection. Collections are listed in GROUPS, in
// the order they appear in the song menu.

import { parsePitch, type Pitch } from './theory';

export interface SongDef {
  id: string;
  title: string;
  /** Collection the song is listed under; one of GROUPS. */
  group: string;
  /** Time signature as [beats, beat value]. */
  time: [number, number];
  /** Length of one metronome beat in quarter notes (1.5 in 6/8). */
  beatQuarters: number;
  /** Default tempo in metronome beats per minute. */
  bpm: number;
  notation: string;
}

export interface SongNote {
  /** null for a rest. */
  pitch: Pitch | null;
  /** Length in quarter notes. */
  quarters: number;
  /** VexFlow base duration: w h q 8 16. */
  duration: string;
  dots: number;
}

export interface Song extends SongDef {
  measures: SongNote[][];
}

const DURATIONS: Record<string, { quarters: number; vex: string }> = {
  w: { quarters: 4, vex: 'w' },
  h: { quarters: 2, vex: 'h' },
  q: { quarters: 1, vex: 'q' },
  e: { quarters: 0.5, vex: '8' },
  s: { quarters: 0.25, vex: '16' },
};

export function parseNotation(notation: string): SongNote[][] {
  return notation
    .split('|')
    .map((bar) => bar.trim())
    .filter((bar) => bar.length > 0)
    .map((bar) =>
      bar.split(/\s+/).map((token) => {
        const [head, durText = 'q'] = token.split(':');
        const dots = durText.endsWith('.') ? 1 : 0;
        const base = DURATIONS[durText.replace('.', '')];
        if (!base) throw new Error(`Bad duration in token: ${token}`);
        return {
          pitch: head === 'r' ? null : parsePitch(head),
          quarters: base.quarters * (dots ? 1.5 : 1),
          duration: base.vex,
          dots,
        };
      }),
    );
}

export const GROUPS = ['Warm-ups', 'Nursery rhymes', 'Classical and holiday'];

const DEFS: SongDef[] = [
  {
    id: 'scale',
    title: 'Major Scale (warm-up)',
    group: 'Warm-ups',
    time: [4, 4],
    beatQuarters: 1,
    bpm: 70,
    notation: 'C4 D4 E4 F4 | G4 A4 B4 C5 | C5 B4 A4 G4 | F4 E4 D4 C4',
  },
  {
    id: 'hot-cross-buns',
    title: 'Hot Cross Buns',
    group: 'Nursery rhymes',
    time: [4, 4],
    beatQuarters: 1,
    bpm: 80,
    notation:
      'E4 D4 C4:h | E4 D4 C4:h | C4:e C4:e C4:e C4:e D4:e D4:e D4:e D4:e | E4 D4 C4:h',
  },
  {
    id: 'mary',
    title: 'Mary Had a Little Lamb',
    group: 'Nursery rhymes',
    time: [4, 4],
    beatQuarters: 1,
    bpm: 90,
    notation:
      'E4 D4 C4 D4 | E4 E4 E4:h | D4 D4 D4:h | E4 G4 G4:h | ' +
      'E4 D4 C4 D4 | E4 E4 E4 E4 | D4 D4 E4 D4 | C4:w',
  },
  {
    id: 'twinkle',
    title: 'Twinkle, Twinkle, Little Star',
    group: 'Nursery rhymes',
    time: [4, 4],
    beatQuarters: 1,
    bpm: 90,
    notation:
      'C4 C4 G4 G4 | A4 A4 G4:h | F4 F4 E4 E4 | D4 D4 C4:h | ' +
      'G4 G4 F4 F4 | E4 E4 D4:h | G4 G4 F4 F4 | E4 E4 D4:h | ' +
      'C4 C4 G4 G4 | A4 A4 G4:h | F4 F4 E4 E4 | D4 D4 C4:h',
  },
  {
    id: 'baa-baa',
    title: 'Baa, Baa, Black Sheep',
    group: 'Nursery rhymes',
    time: [4, 4],
    beatQuarters: 1,
    bpm: 85,
    notation: 'C4 C4 G4 G4 | A4:e A4:e A4:e A4:e G4:h | F4 F4 E4 E4 | D4 D4 C4:h',
  },
  {
    id: 'lightly-row',
    title: 'Lightly Row',
    group: 'Nursery rhymes',
    time: [4, 4],
    beatQuarters: 1,
    bpm: 95,
    notation:
      'G4 E4 E4:h | F4 D4 D4:h | C4 D4 E4 F4 | G4 G4 G4:h | ' +
      'G4 E4 E4 E4 | F4 D4 D4 D4 | C4 E4 G4 G4 | C4:w',
  },
  {
    id: 'frere-jacques',
    title: 'Frere Jacques',
    group: 'Nursery rhymes',
    time: [4, 4],
    beatQuarters: 1,
    bpm: 90,
    notation:
      'C4 D4 E4 C4 | C4 D4 E4 C4 | E4 F4 G4:h | E4 F4 G4:h | ' +
      'G4:e A4:e G4:e F4:e E4 C4 | G4:e A4:e G4:e F4:e E4 C4 | ' +
      'C4 G3 C4:h | C4 G3 C4:h',
  },
  {
    id: 'old-macdonald',
    title: 'Old MacDonald Had a Farm',
    group: 'Nursery rhymes',
    time: [4, 4],
    beatQuarters: 1,
    bpm: 95,
    notation:
      'C4 C4 C4 G3 | A3 A3 G3:h | E4 E4 D4 D4 | C4:h. G3 | ' +
      'C4 C4 C4 G3 | A3 A3 G3:h | E4 E4 D4 D4 | C4:w',
  },
  {
    id: 'london-bridge',
    title: 'London Bridge',
    group: 'Nursery rhymes',
    time: [4, 4],
    beatQuarters: 1,
    bpm: 95,
    notation:
      'G4:q. A4:e G4 F4 | E4 F4 G4:h | D4 E4 F4:h | E4 F4 G4:h | ' +
      'G4:q. A4:e G4 F4 | E4 F4 G4:h | D4:h G4:h | E4 C4:h.',
  },
  {
    id: 'ode-to-joy',
    title: 'Ode to Joy',
    group: 'Classical and holiday',
    time: [4, 4],
    beatQuarters: 1,
    bpm: 95,
    notation:
      'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4:q. D4:e D4:h | ' +
      'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:q. C4:e C4:h',
  },
  {
    id: 'jingle-bells',
    title: 'Jingle Bells (chorus)',
    group: 'Classical and holiday',
    time: [4, 4],
    beatQuarters: 1,
    bpm: 100,
    notation:
      'E4 E4 E4:h | E4 E4 E4:h | E4 G4 C4:q. D4:e | E4:w | ' +
      'F4 F4 F4:q. F4:e | F4 E4 E4 E4:e E4:e | E4 D4 D4 E4 | D4:h G4:h',
  },
  {
    id: 'row-row',
    title: 'Row, Row, Row Your Boat',
    group: 'Nursery rhymes',
    time: [6, 8],
    beatQuarters: 1.5,
    bpm: 60,
    notation:
      'C4:q. C4:q. | C4:q D4:e E4:q. | E4:q D4:e E4:q F4:e | G4:h. | ' +
      'C5:e C5:e C5:e G4:e G4:e G4:e | E4:e E4:e E4:e C4:e C4:e C4:e | ' +
      'G4:q F4:e E4:q D4:e | C4:h.',
  },
];

export const SONGS: Song[] = DEFS.map((def) => ({ ...def, measures: parseNotation(def.notation) }));

/** Songs by collection, in menu order. Collections without songs are left out. */
export function songsByGroup(): { group: string; songs: Song[] }[] {
  return GROUPS.map((group) => ({ group, songs: SONGS.filter((s) => s.group === group) })).filter(
    (g) => g.songs.length > 0,
  );
}

export function songById(id: string): Song {
  return SONGS.find((s) => s.id === id) ?? SONGS[0];
}

/** Length of a full bar in quarter notes. */
export function barQuarters(song: SongDef): number {
  return (song.time[0] * 4) / song.time[1];
}
