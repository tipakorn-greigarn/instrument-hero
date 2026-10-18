// Song library. Every song is written in C major; the arranger transposes it
// to the selected key and octave. A song's `keys` are the few keys it is
// usually played in; the first is loaded when the song is chosen, and only
// these are offered. `minor` songs are named by their relative minor.
//
// Notation: tokens separated by spaces, bars separated by "|".
//   C4      quarter note (default duration)
//   G4:h    explicit duration: w h q e s, with a trailing "." for dotted
//   r:q     rest
//   G4:w~   tied to the next note, which must be the same pitch
//
// A song with a pickup (anacrusis) has `pickup` set to its length in quarter
// notes, and its first bar holds only the pickup notes.
//
// An arpeggio exercise (`arpeggio: true`) has no notation: its notes are
// built from `chords`, starting each chord on its lowest root on the
// instrument (see arpeggioMeasures and the arranger).
//
// `chords`, if given, has the chord symbols in C, bars separated by "|" like
// the notation, one bar per notation bar. A bar's chords share it equally
// (two chords in 4/4 fall on beats 1 and 3); "-" is a bar with no symbol.
// A chord can also give its position: "G7@3" starts 3 quarter notes into the
// bar (imported songs use this).
//
// Songs imported from MusicXML are kept in the browser and listed under
// MY_SONGS; see setUserSongs and src/music/musicxml.ts.
//
// Each song belongs to one collection. Collections are listed in GROUPS, in
// the order they appear in the song menu.

import { chordTone, keyById, parseChord, parsePitch, pitchClassName, transpose, type Pitch } from './theory';

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
  /** Keys the song is usually played in, the usual one first; DEFAULT_KEYS when not given. */
  keys?: string[];
  /** In a minor key: keys are named by their relative minor (Bb as G minor). */
  minor?: boolean;
  /** Length of the pickup bar in quarter notes, if the song starts with one. */
  pickup?: number;
  /** Chord symbols in C, one bar per notation bar. */
  chords?: string;
  /** Notes are arpeggios built from the chords; `notation` is left empty. */
  arpeggio?: boolean;
  /** Imported from a file: offered in every key, starting in its own octave. */
  imported?: boolean;
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
  /** Tied to the next note. */
  tie: boolean;
  /** In an arpeggio exercise: which tone of which chord this is. The arranger
   * places it above the chord's lowest root on the instrument; `pitch` is
   * only a stand-in. */
  chordTone?: { symbol: string; degree: number };
}

export interface Song extends SongDef {
  measures: SongNote[][];
  /** Chord symbols per bar; empty when the song has none. */
  chordBars: string[][];
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
        const tie = token.endsWith('~');
        const [head, durText = 'q'] = token.replace(/~$/, '').split(':');
        const dots = durText.endsWith('.') ? 1 : 0;
        const base = DURATIONS[durText.replace('.', '')];
        if (!base) throw new Error(`Bad duration in token: ${token}`);
        return {
          pitch: head === 'r' ? null : parsePitch(head),
          quarters: base.quarters * (dots ? 1.5 : 1),
          duration: base.vex,
          dots,
          tie,
        };
      }),
    );
}

export const GROUPS = ['Warm-ups', 'Nursery rhymes', 'Classical and holiday', 'Jazz', 'Arpeggios'];

const DEFS: SongDef[] = [
  {
    id: 'scale',
    title: 'Major Scale (warm-up)',
    group: 'Warm-ups',
    time: [4, 4],
    beatQuarters: 1,
    bpm: 70,
    keys: ['C', 'G', 'D', 'F', 'Bb'],
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
  {
    // 12-bar jazz blues, walking quarter notes:
    // C7 | F7 | C7 | Gm7 C7 | F7 | Fm7 Bb7 | C7 | A7 | Dm7 | G7 | C7 A7 | Dm7 G7 | C
    // Chord tones on the beat, a step or half step into the next bar's root on
    // beat 4. Chromatic notes are flats where possible, since sharps written in
    // C turn into double sharps in the sharp keys.
    id: 'jazz-blues',
    title: 'Jazz Blues Walking Bass',
    group: 'Jazz',
    time: [4, 4],
    beatQuarters: 1,
    bpm: 100,
    keys: ['F', 'Bb', 'C'],
    notation:
      'C3 E3 G3 E3 | F3 A3 Eb3 D3 | C3 E3 G3 A3 | G3 D3 C3 E3 | ' +
      'F3 A3 C3 E3 | F3 Ab3 Bb2 D3 | C3 E3 G3 Bb3 | A3 G3 E3 Eb3 | ' +
      'D3 E3 F3 A3 | G3 F3 D3 B2 | C3 E3 A2 Eb3 | D3 F3 G3 B2 | C3:w',
    chords: 'C7 | F7 | C7 | Gm7 C7 | F7 | Fm7 Bb7 | C7 | A7 | Dm7 | G7 | C7 A7 | Dm7 G7 | C7',
  },
  // Traditional tunes, public domain. Melodies from public-domain sources
  // (Wikipedia ABC, free-notes.net, hymnary.org), cross-checked against a
  // second source, with syncopations straightened onto the beat. Keys are the
  // ones trad jazz bands usually play them in.
  {
    id: 'saints',
    title: 'When the Saints Go Marching In',
    group: 'Jazz',
    time: [4, 4],
    beatQuarters: 1,
    bpm: 100,
    keys: ['F', 'Bb', 'C'],
    pickup: 3,
    notation:
      'C4 E4 F4 | G4:w | r:q C4 E4 F4 | G4:w | r:q C4 E4 F4 | G4:h E4:h | C4:h E4:h | D4:w | ' +
      'r:q E4 E4 D4 | C4:w | E4:h G4:h | G4 F4:h. | r:h E4 F4 | G4:h E4:h | C4:h D4:h | C4:w',
  },
  {
    // Verse, then the chorus once with its final ending.
    id: 'riverside',
    title: 'Down by the Riverside',
    group: 'Jazz',
    time: [4, 4],
    beatQuarters: 1,
    bpm: 100,
    keys: ['F', 'Bb', 'C'],
    pickup: 3,
    notation:
      'E4 E4 D#4 | E4 G3:h A3 | C4 C4 D4:h | r:q E4 E4 D#4 | E4 D4 C4:h | r:q D4 D4 C#4 | D4 C4 B3:h | ' +
      'r:q E4 E4 D#4 | E4:e D4:e C4 E4:e E4:e D#4 | E4 G3:h A3 | C4 C4 D4:h | r:q E4 E4 D#4 | E4 D4 C4 C4 | ' +
      'D4 D4:e D4:e D4 F4 | E4:h D4:h | C4:w | r:q C4 D4 E4:e E4:e | F4 F4 F4 F4 | F4 F4 C4 D4:e D4:e | ' +
      'E4 E4 E4 D4 | C4:h. C4 | D4:h D4 D4 | D4 F4 E4 D4 | C4:w',
  },
  {
    id: 'careless-love',
    title: 'Careless Love',
    group: 'Jazz',
    time: [4, 4],
    beatQuarters: 1,
    bpm: 80,
    keys: ['F', 'Bb', 'C'],
    notation:
      'E4:h. C4 | B3 G3 B3 D4 | C4:w | r:w | E4:h. F4 | G4 G4 A4 G4 | D4:w | r:h E4 F4 | ' +
      'E4:h. F4 | G4:h. Ab4 | A4:h F4:h | C4:h D4 Eb4 | E4:h. C4 | B3 G3 B3 D4 | C4:w',
  },
  {
    // The verse and the refrain share this melody. Treated as anonymous and
    // public domain by hymnary.org; only later arrangements were copyrighted.
    id: 'closer-walk',
    title: 'Just a Closer Walk with Thee',
    group: 'Jazz',
    time: [4, 4],
    beatQuarters: 1,
    bpm: 70,
    keys: ['Bb', 'C', 'F'],
    notation:
      'G4:q. G#4:e A4:e E4:e G4:e F#4:e | F4:w | D5:q. C5:e B4:e G4:e A4:e C5:e | A4:h G4:h | ' +
      'E5:q. E5:e E5:e C5:e D5:e E5:e | D5:e C5:e~ C5:h C5:e A4:e | G4 G4:e G4:e G4 A4:e B4:e | C5:w',
  },
  // Seventh-chord arpeggios through the chord progressions that standards are
  // built on. The first chord starts on the lowest root on the instrument and
  // each later chord on the root closest to the one before; then up
  // 1-3-5-7 for a chord that lasts a bar, then down 8-7-5-3 in the second bar
  // of a two-bar chord; two chords in a bar get root and third each.
  {
    id: 'arp-251-major',
    title: 'ii-V-I in major',
    group: 'Arpeggios',
    time: [4, 4],
    beatQuarters: 1,
    bpm: 80,
    keys: ['C', 'F', 'Bb', 'Eb'],
    arpeggio: true,
    notation: '',
    chords:
      'Dm7 | G7 | Cmaj7 | Cmaj7 | Dm7 | G7 | Cmaj7 | Cmaj7',
  },
  {
    // In the relative minor, so it is written in C as A minor; Bb shows it as G minor.
    id: 'arp-251-minor',
    title: 'ii-V-i in minor',
    group: 'Arpeggios',
    time: [4, 4],
    beatQuarters: 1,
    bpm: 80,
    keys: ['Bb', 'F', 'Eb', 'C'],
    minor: true,
    arpeggio: true,
    notation: '',
    chords:
      'Bm7b5 | E7 | Am7 | Am7 | Bm7b5 | E7 | Am7 | Am7',
  },
  {
    // The A section of Autumn Leaves: ii-V-I-IV in major, then ii-V-i in the
    // relative minor. Bb is the usual G minor.
    id: 'arp-autumn-leaves',
    title: 'Autumn Leaves changes (A section)',
    group: 'Arpeggios',
    time: [4, 4],
    beatQuarters: 1,
    bpm: 100,
    keys: ['Bb', 'G'],
    minor: true,
    arpeggio: true,
    notation: '',
    chords: 'Dm7 | G7 | Cmaj7 | Fmaj7 | Bm7b5 | E7 | Am7 | Am7',
  },
  {
    // The A section of rhythm changes (I Got Rhythm), as in the last A so it
    // ends on I: I-VI7-ii-V twice, I7-IV-#iv dim, ii-V-I. Bb is the usual key.
    id: 'arp-rhythm-changes',
    title: 'Rhythm changes (A section)',
    group: 'Arpeggios',
    time: [4, 4],
    beatQuarters: 1,
    bpm: 80,
    keys: ['Bb', 'F', 'Eb'],
    arpeggio: true,
    notation: '',
    chords: 'Cmaj7 A7 | Dm7 G7 | Cmaj7 A7 | Dm7 G7 | Gm7 C7 | Fmaj7 F#dim7 | Dm7 G7 | Cmaj7',
  },
  {
    // 12-bar jazz blues with the ii-V in bar 4, the #iv diminished in bar 6, and
    // the VI7-ii-V turnaround. F is the usual key.
    id: 'arp-jazz-blues',
    title: 'Jazz blues',
    group: 'Arpeggios',
    time: [4, 4],
    beatQuarters: 1,
    bpm: 90,
    keys: ['F', 'Bb', 'C'],
    arpeggio: true,
    notation: '',
    chords:
      'C7 | F7 | C7 | Gm7 C7 | F7 | F#dim7 | C7 | A7 | ' +
      'Dm7 | G7 | C7 A7 | Dm7 G7 | C7',
  },
  {
    // 12-bar minor blues: i, iv, bVI7-V7, and a minor ii-V turnaround. Written in
    // A minor; Eb shows it as C minor, the usual key.
    id: 'arp-minor-blues',
    title: 'Minor blues',
    group: 'Arpeggios',
    time: [4, 4],
    beatQuarters: 1,
    bpm: 100,
    keys: ['Eb', 'Ab', 'Bb'],
    minor: true,
    arpeggio: true,
    notation: '',
    chords:
      'Am7 | Dm7 | Am7 | Am7 | Dm7 | Dm7 | Am7 | Am7 | ' +
      'F7 | E7 | Am7 | Bm7b5 E7 | Am7',
  },
];

export function parseChords(chords: string | undefined): string[][] {
  if (!chords) return [];
  return chords.split('|').map((bar) => bar.trim().split(/\s+/).filter((c) => c && c !== '-'));
}

function toneNote(symbol: string, degree: number, quarters: number, duration: string): SongNote {
  const chord = parseChord(symbol);
  if (!chord) throw new Error(`Unknown chord in arpeggio exercise: ${symbol}`);
  return { pitch: chordTone(chord.root, chord.quality, degree), quarters, duration, dots: 0, tie: false, chordTone: { symbol, degree } };
}

/**
 * Arpeggio bars from chord bars: a chord for one bar goes up 1-3-5-7; a chord
 * held for two bars goes up, then down from the octave 8-7-5-3; two chords in
 * a bar get two notes each, root and third, so the third still shows whether
 * the chord is major or minor. The last bar holds the final chord's root.
 */
export function arpeggioMeasures(bars: string[][]): SongNote[][] {
  const up = [0, 1, 2, 3];
  const down = [4, 3, 2, 1];
  const single = (i: number, symbol: string) => bars[i]?.length === 1 && bars[i][0] === symbol;
  return bars.map((chords, b) => {
    if (b === bars.length - 1) return [toneNote(chords[0], 0, 4, 'w')];
    if (chords.length > 1) return chords.flatMap((c) => [0, 1].map((d) => toneNote(c, d, 1, 'q')));
    // Within a run of bars on the same chord, every second bar comes down.
    let run = 0;
    while (single(b - run, chords[0])) run++;
    return (run % 2 === 0 ? down : up).map((d) => toneNote(chords[0], d, 1, 'q'));
  });
}

export function buildSong(def: SongDef): Song {
  const chordBars = parseChords(def.chords);
  return { ...def, measures: def.arpeggio ? arpeggioMeasures(chordBars) : parseNotation(def.notation), chordBars };
}

export const SONGS: Song[] = DEFS.map(buildSong);

/** Collection for imported songs, listed after the built-in ones. */
export const MY_SONGS = 'My songs';

let userSongs: Song[] = [];

/** Replace the imported songs (kept in storage by the caller). */
export function setUserSongs(songs: Song[]): void {
  userSongs = songs;
}

export function getUserSongs(): Song[] {
  return userSongs;
}

/** Songs by collection, in menu order. Collections without songs are left out. */
export function songsByGroup(): { group: string; songs: Song[] }[] {
  return [
    ...GROUPS.map((group) => ({ group, songs: SONGS.filter((s) => s.group === group) })),
    { group: MY_SONGS, songs: userSongs },
  ].filter((g) => g.songs.length > 0);
}

export function songById(id: string): Song {
  return SONGS.find((s) => s.id === id) ?? userSongs.find((s) => s.id === id) ?? SONGS[0];
}

/** Keys for songs that do not list their own: the common beginner keys. */
export const DEFAULT_KEYS = ['C', 'G', 'F', 'D'];

/** Keys the song is offered in, the usual one first. */
export function songKeys(song: SongDef): string[] {
  return song.keys ?? DEFAULT_KEYS;
}

/** A chord token split into its symbol and position in the bar ("G7@3"), or null position for an even share. */
export function splitChordToken(token: string): { symbol: string; at: number | null } {
  const [symbol, at] = token.split('@');
  return { symbol, at: at === undefined ? null : Number(at) };
}

/** Key the song is usually played in. */
export function homeKey(song: SongDef): string {
  return songKeys(song)[0];
}

/** Name of a key for a song: "Bb major", or "G minor" for a minor song. */
export function keyLabel(song: SongDef, keyId: string): string {
  const key = keyById(keyId);
  if (!song.minor) return key.name;
  const tonic: Pitch = { step: key.tonicStep, alter: key.tonicAlter, octave: 4 };
  return `${pitchClassName(transpose(tonic, 5, 9))} minor`;
}

/** Length of a full bar in quarter notes. */
export function barQuarters(song: SongDef): number {
  return (song.time[0] * 4) / song.time[1];
}
