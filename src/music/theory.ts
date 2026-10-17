// Pitch spelling, keys, and transposition.

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const LETTER_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

/** A spelled pitch: step 0-6 (C-B), alter in semitones, scientific octave. */
export interface Pitch {
  step: number;
  alter: number;
  octave: number;
}

export interface KeyDef {
  id: string;
  /** Display name, e.g. "Bb major". */
  name: string;
  /** VexFlow key signature spec, e.g. "Bb". */
  vex: string;
  tonicStep: number;
  tonicAlter: number;
  /** Position on the circle of fifths: sharps positive, flats negative. */
  fifths: number;
}

function key(vex: string, fifths: number): KeyDef {
  const tonicStep = LETTERS.indexOf(vex[0] as (typeof LETTERS)[number]);
  const tonicAlter = vex[1] === '#' ? 1 : vex[1] === 'b' ? -1 : 0;
  return { id: vex, name: `${vex} major`, vex, tonicStep, tonicAlter, fifths };
}

/** The twelve major keys in chromatic order. */
export const KEYS: KeyDef[] = [
  key('C', 0),
  key('Db', -5),
  key('D', 2),
  key('Eb', -3),
  key('E', 4),
  key('F', -1),
  key('F#', 6),
  key('G', 1),
  key('Ab', -4),
  key('A', 3),
  key('Bb', -2),
  key('B', 5),
];

export function keyById(id: string): KeyDef {
  return KEYS.find((k) => k.id === id) ?? KEYS[0];
}

/** Key a number of fifths away, wrapped into the range the app supports. */
export function keyByFifths(fifths: number): KeyDef {
  let f = fifths;
  while (f > 6) f -= 12;
  while (f < -5) f += 12;
  return KEYS.find((k) => k.fifths === f)!;
}

export function pitchToMidi(p: Pitch): number {
  return 12 * (p.octave + 1) + LETTER_SEMITONES[p.step] + p.alter;
}

export function parsePitch(text: string): Pitch {
  const m = /^([A-G])([#b]*)(-?\d)$/.exec(text);
  if (!m) throw new Error(`Bad pitch: ${text}`);
  let alter = 0;
  for (const c of m[2]) alter += c === '#' ? 1 : -1;
  return { step: LETTERS.indexOf(m[1] as (typeof LETTERS)[number]), alter, octave: Number(m[3]) };
}

function accidentalText(alter: number): string {
  return alter > 0 ? '#'.repeat(alter) : 'b'.repeat(-alter);
}

/** Letter and accidental without the octave, e.g. "Bb". */
export function pitchClassName(p: Pitch): string {
  return `${LETTERS[p.step]}${accidentalText(p.alter)}`;
}

export function pitchName(p: Pitch): string {
  return `${LETTERS[p.step]}${accidentalText(p.alter)}${p.octave}`;
}

/** VexFlow key string, e.g. "bb/3". */
export function pitchToVex(p: Pitch): string {
  return `${LETTERS[p.step].toLowerCase()}${accidentalText(p.alter)}/${p.octave}`;
}

/** Transpose by a diatonic step count and a semitone count, keeping correct spelling. */
export function transpose(p: Pitch, steps: number, semitones: number): Pitch {
  const diatonic = p.octave * 7 + p.step + steps;
  const step = ((diatonic % 7) + 7) % 7;
  const octave = Math.floor(diatonic / 7);
  const alter = pitchToMidi(p) + semitones - pitchToMidi({ step, alter: 0, octave });
  return { step, alter, octave };
}

/** Transpose a pitch written in C major into the given key, plus whole octaves. */
export function transposeFromC(p: Pitch, to: KeyDef, octaveShift: number): Pitch {
  const semitones = LETTER_SEMITONES[to.tonicStep] + to.tonicAlter;
  const moved = transpose(p, to.tonicStep, semitones);
  return { ...moved, octave: moved.octave + octaveShift };
}

/**
 * A chord symbol written in C, moved to a key: the root is spelled like a
 * note, the quality is kept. Returns null for a symbol without a root letter.
 */
export function transposeChord(symbol: string, to: KeyDef): string | null {
  const m = /^([A-G])([#b]?)(.*)$/.exec(symbol);
  if (!m) return null;
  const root = transposeFromC(parsePitch(`${m[1]}${m[2]}4`), to, 0);
  return `${LETTERS[root.step]}${accidentalText(root.alter)}${m[3]}`;
}

/** The 3rd, 5th, and 7th of each chord quality above the root, as (letter steps, semitones). */
const CHORD_QUALITIES: Record<string, [number, number][]> = {
  maj7: [[2, 4], [4, 7], [6, 11]],
  m7: [[2, 3], [4, 7], [6, 10]],
  '7': [[2, 4], [4, 7], [6, 10]],
  m7b5: [[2, 3], [4, 6], [6, 10]],
  dim7: [[2, 3], [4, 6], [6, 9]],
};

/** A seventh-chord symbol split into its root (in octave 4) and quality, or null if not recognized. */
export function parseChord(symbol: string): { root: Pitch; quality: string } | null {
  const m = /^([A-G][#b]?)(.*)$/.exec(symbol);
  if (!m || !CHORD_QUALITIES[m[2]]) return null;
  return { root: parsePitch(`${m[1]}4`), quality: m[2] };
}

/** A chord tone above a root: degree 0 is the root, 1 the third, 2 the fifth, 3 the seventh, 4 the octave. */
export function chordTone(root: Pitch, quality: string, degree: number): Pitch {
  if (degree === 0) return root;
  if (degree === 4) return transpose(root, 7, 12);
  const [steps, semitones] = CHORD_QUALITIES[quality][degree - 1];
  return transpose(root, steps, semitones);
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Name for a MIDI number, spelled with flats when preferFlats is set. */
export function midiName(midi: number, preferFlats = false): string {
  const m = Math.round(midi);
  const names = preferFlats ? FLAT_NAMES : SHARP_NAMES;
  return `${names[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}
