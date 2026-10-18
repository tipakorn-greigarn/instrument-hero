// MusicXML import and export for single-line songs.
//
// Import turns a MusicXML file with one melody line into a song definition:
// the notes are moved to C (the song format is written in C and transposed by
// the arranger) and the file's key becomes the song's own key. Anything the
// app cannot play is rejected with a message naming the bar, rather than
// guessed at. Export writes a song back out in its own key, so it can be
// fixed in a notation editor and imported again.

import { MY_SONGS, homeKey, splitChordToken, type Song, type SongDef } from './songs';
import { MAX_BPM, MIN_BPM } from '../storage';
import {
  KEYS,
  keyById,
  keyByFifths,
  pitchClassName,
  pitchName,
  pitchToMidi,
  tonicOfFifths,
  transpose,
  transposeChord,
  transposeFromC,
  type Pitch,
} from './theory';

export type ImportResult = { ok: true; def: SongDef } | { ok: false; errors: string[] };

/** Note lengths the song format can write, in quarter notes. */
const LENGTHS: [number, string][] = [
  [6, 'w.'],
  [4, 'w'],
  [3, 'h.'],
  [2, 'h'],
  [1.5, 'q.'],
  [1, 'q'],
  [0.75, 'e.'],
  [0.5, 'e'],
  [0.375, 's.'],
  [0.25, 's'],
];

/** MusicXML chord kinds and the symbol suffix used for each. */
const KINDS: Record<string, string> = {
  major: '',
  minor: 'm',
  augmented: '+',
  diminished: 'dim',
  dominant: '7',
  'major-seventh': 'maj7',
  'minor-seventh': 'm7',
  'diminished-seventh': 'dim7',
  'augmented-seventh': '+7',
  'half-diminished': 'm7b5',
  'major-minor': 'm(maj7)',
  'major-sixth': '6',
  'minor-sixth': 'm6',
  'dominant-ninth': '9',
  'major-ninth': 'maj9',
  'minor-ninth': 'm9',
  'dominant-11th': '11',
  'major-11th': 'maj11',
  'minor-11th': 'm11',
  'dominant-13th': '13',
  'major-13th': 'maj13',
  'minor-13th': 'm13',
  'suspended-second': 'sus2',
  'suspended-fourth': 'sus4',
  power: '5',
};

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

function child(el: Element, name: string): Element | null {
  for (const c of Array.from(el.children)) if (c.localName === name) return c;
  return null;
}

function text(el: Element | null, name: string): string | null {
  const c = el && child(el, name);
  return c ? (c.textContent ?? '').trim() : null;
}

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'song';
}

function formatQuarters(q: number): string {
  return String(Math.round(q * 1000) / 1000);
}

/** Moves a pitch from a key (given by its tonic) to C, keeping the spelling. */
function toC(p: Pitch, tonic: Pitch): Pitch {
  const semitones = pitchToMidi({ ...tonic, octave: 4 }) - 60;
  return transpose(p, -tonic.step, -semitones);
}

/** A chord symbol read from a <harmony> element, moved to C, or null for N.C. or an unreadable one. */
function harmonySymbol(harmony: Element, tonic: Pitch): string | null {
  const root = child(harmony, 'root');
  const step = text(root, 'root-step');
  if (!step) return null;
  const kindEl = child(harmony, 'kind');
  const kind = (kindEl?.textContent ?? 'major').trim();
  if (kind === 'none') return null;
  const suffix = KINDS[kind] ?? kindEl?.getAttribute('text') ?? '';
  const name = (s: string, alter: string | null) => {
    const moved = toC({ step: 'CDEFGAB'.indexOf(s), alter: Math.round(Number(alter ?? 0)), octave: 4 }, tonic);
    return pitchClassName(moved);
  };
  let symbol = name(step, text(root, 'root-alter')) + suffix;
  const bass = child(harmony, 'bass');
  const bassStep = text(bass, 'bass-step');
  if (bassStep) symbol += `/${name(bassStep, text(bass, 'bass-alter'))}`;
  return symbol;
}

/** Reads a MusicXML document into a song definition, or lists why it cannot be used. */
export function importMusicXml(xml: string, fileName: string): ImportResult {
  const errors: string[] = [];
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const root = doc.documentElement;
  if (!root || doc.getElementsByTagName('parsererror').length > 0) {
    return { ok: false, errors: ['This is not a readable MusicXML file.'] };
  }
  if (root.localName === 'score-timewise') {
    return { ok: false, errors: ['The file is in the "timewise" MusicXML layout. Export it again as standard (partwise) MusicXML.'] };
  }
  if (root.localName !== 'score-partwise') return { ok: false, errors: ['This is not a MusicXML score.'] };

  const parts = Array.from(root.children).filter((c) => c.localName === 'part');
  if (parts.length === 0) return { ok: false, errors: ['The file has no music in it.'] };
  if (parts.length > 1) {
    return {
      ok: false,
      errors: [`The file has ${parts.length} parts (instruments or staves). Only one melody line can be imported: delete the other parts, or export just the melody.`],
    };
  }

  const title =
    text(child(root, 'work'), 'work-title') || text(root, 'movement-title') || fileName.replace(/\.[^.]+$/, '') || 'Untitled';

  let divisions: number | null = null;
  let fifths: number | null = null;
  let mode = 'major';
  let time: [number, number] | null = null;
  let tempo: number | null = null;
  let voice: string | null = null;
  const bars: { label: string; tokens: string[]; chords: string[]; length: number }[] = [];
  /** Notes in order, to check that every tie joins two notes of the same pitch. */
  const sequence: { pitch: Pitch | null; tie: boolean; bar: string }[] = [];

  const measures = Array.from(parts[0].children).filter((c) => c.localName === 'measure');
  measures.forEach((measure, index) => {
    const label = `Bar ${index + 1}`;
    const bar = { label, tokens: [] as string[], chords: [] as string[], length: 0 };
    const fail = (message: string) => {
      const line = `${label}: ${message}`;
      if (!errors.includes(line)) errors.push(line);
    };
    const repeat = () =>
      fail('repeat signs, endings, D.C., D.S., and codas are not supported. Write the music out in full.');

    for (const el of Array.from(measure.children)) {
      switch (el.localName) {
        case 'attributes': {
          const d = text(el, 'divisions');
          if (d) divisions = Number(d);
          const staves = text(el, 'staves');
          if (staves && Number(staves) > 1) fail('the part has more than one staff. Only one melody line can be imported.');
          const key = child(el, 'key');
          if (key) {
            const f = Number(text(key, 'fifths') ?? 0);
            const m = text(key, 'mode') ?? 'major';
            if (fifths === null) {
              fifths = f;
              mode = m;
            } else if (f !== fifths) fail('the key signature changes. A song must stay in one key.');
          }
          const t = child(el, 'time');
          if (t) {
            const beats = text(t, 'beats') ?? '';
            const beatType = Number(text(t, 'beat-type'));
            if (child(t, 'senza-misura') || !/^\d+$/.test(beats) || !beatType) {
              fail('the time signature is not a plain one like 4/4 or 6/8.');
            } else if (time === null) {
              time = [Number(beats), beatType];
            } else if (time[0] !== Number(beats) || time[1] !== beatType) {
              fail('the time signature changes. A song must keep one time signature.');
            }
          }
          break;
        }
        case 'barline':
          if (child(el, 'repeat') || child(el, 'ending')) repeat();
          break;
        case 'direction':
        case 'sound': {
          const sounds = el.localName === 'sound' ? [el] : Array.from(el.getElementsByTagName('sound'));
          for (const s of sounds) {
            if (['dacapo', 'dalsegno', 'coda', 'tocoda', 'segno', 'fine'].some((a) => s.hasAttribute(a))) repeat();
            const t = s.getAttribute('tempo');
            if (t && tempo === null) tempo = Number(t);
          }
          if (el.getElementsByTagName('segno').length || el.getElementsByTagName('coda').length) repeat();
          for (const w of Array.from(el.getElementsByTagName('words'))) {
            if (/\bD\.\s?[CS]\.|\bda capo\b|\bdal segno\b|\bto coda\b|\bfine\b/i.test(w.textContent ?? '')) repeat();
          }
          if (tempo === null) {
            const perMinute = el.getElementsByTagName('per-minute')[0];
            if (perMinute && Number(perMinute.textContent)) tempo = Number(perMinute.textContent);
          }
          break;
        }
        case 'harmony': {
          if (fifths === null) fifths = 0;
          const symbol = harmonySymbol(el, tonicOfFifths(fifths));
          const offset = Number(text(el, 'offset') ?? 0) / (divisions ?? 1);
          if (symbol) bar.chords.push(`${symbol}@${formatQuarters(Math.max(0, bar.length + offset))}`);
          break;
        }
        case 'backup':
        case 'forward':
          fail('the music has more than one voice. Only one melody line can be imported.');
          break;
        case 'note': {
          if (child(el, 'grace')) {
            fail('grace notes are not supported.');
            break;
          }
          if (child(el, 'cue')) {
            fail('cue notes are not supported.');
            break;
          }
          if (child(el, 'chord')) {
            fail('two notes sound together (a chord). Only one note at a time can be imported.');
            break;
          }
          if (child(el, 'time-modification')) {
            fail('triplets and other tuplets are not supported.');
            break;
          }
          const v = text(el, 'voice') ?? '1';
          if (voice === null) voice = v;
          else if (v !== voice) fail('the music has more than one voice. Only one melody line can be imported.');
          if (!divisions) {
            fail('the file does not say how long a quarter note is (no divisions).');
            break;
          }
          const quarters = Number(text(el, 'duration') ?? 0) / divisions;
          const length = LENGTHS.find(([q]) => near(q, quarters));
          if (!length) {
            fail(`a note lasts ${formatQuarters(quarters)} quarter notes, which cannot be written as one note here. Split it into tied notes.`);
            bar.length += quarters;
            break;
          }
          const pitchEl = child(el, 'pitch');
          let pitch: Pitch | null = null;
          if (pitchEl && !child(el, 'rest')) {
            const alter = Number(text(pitchEl, 'alter') ?? 0);
            if (!Number.isInteger(alter)) fail('quarter-tone accidentals are not supported.');
            if (fifths === null) fifths = 0;
            pitch = toC(
              { step: 'CDEFGAB'.indexOf(text(pitchEl, 'step') ?? 'C'), alter: Math.round(alter), octave: Number(text(pitchEl, 'octave')) },
              tonicOfFifths(fifths),
            );
          } else if (!child(el, 'rest')) {
            fail('a note has no pitch (unpitched percussion is not supported).');
          }
          const tie = Array.from(el.children).some((c) => c.localName === 'tie' && c.getAttribute('type') === 'start');
          bar.tokens.push(`${pitch ? pitchName(pitch) : 'r'}:${length[1]}${tie && pitch ? '~' : ''}`);
          sequence.push({ pitch, tie: tie && pitch !== null, bar: label });
          bar.length += quarters;
          break;
        }
        default:
          break;
      }
    }
    bars.push(bar);
  });

  if (time === null) errors.unshift('The file has no time signature.');
  if (bars.length === 0 || sequence.every((n) => n.pitch === null)) errors.unshift('The file has no notes.');
  if (errors.length > 0) return { ok: false, errors };

  const [beats, beatType] = time!;
  const barLength = (beats * 4) / beatType;
  let pickup: number | undefined;
  bars.forEach((bar, i) => {
    if (near(bar.length, barLength)) return;
    if (bar.length > barLength) {
      errors.push(`${bar.label}: has ${formatQuarters(bar.length)} quarter notes of music, more than a ${beats}/${beatType} bar holds.`);
    } else if (i === 0 && bar.length > 0) {
      pickup = bar.length;
    } else if (i === bars.length - 1 && i > 0 && bar.length > 0) {
      // A short last bar, usually completing a pickup.
    } else {
      errors.push(`${bar.label}: has ${formatQuarters(bar.length)} quarter notes of music, less than a ${beats}/${beatType} bar needs. Only the first bar (a pickup) and the last bar may be short.`);
    }
  });
  sequence.forEach((note, i) => {
    if (!note.tie) return;
    const next = sequence[i + 1];
    if (!next?.pitch || pitchToMidi(next.pitch) !== pitchToMidi(note.pitch!)) {
      errors.push(`${note.bar}: a tie does not lead to a note of the same pitch.`);
    }
  });
  if (errors.length > 0) return { ok: false, errors };

  const beatQuarters = beatType === 8 && beats % 3 === 0 ? 1.5 : 4 / beatType;
  const home = keyByFifths(fifths ?? 0).id;
  // MusicXML tempo counts quarter notes; the app counts metronome beats (a dotted quarter in 6/8).
  const bpm = tempo === null ? 80 : Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(tempo / beatQuarters)));
  const hasChords = bars.some((b) => b.chords.length > 0);
  const def: SongDef = {
    id: `my-${slug(title)}`,
    title,
    group: MY_SONGS,
    time: [beats, beatType],
    beatQuarters,
    bpm,
    keys: [home, ...KEYS.map((k) => k.id).filter((k) => k !== home)],
    minor: mode === 'minor' || undefined,
    pickup,
    notation: bars.map((b) => b.tokens.join(' ')).join(' | '),
    chords: hasChords ? bars.map((b) => (b.chords.length ? b.chords.join(' ') : '-')).join(' | ') : undefined,
    imported: true,
  };
  return { ok: true, def };
}

// ---------------------------------------------------------------- export

const TYPES: Record<string, string> = { w: 'whole', h: 'half', q: 'quarter', '8': 'eighth', '16': '16th' };
/** Export divisions per quarter note: an integer length for every note the format can write. */
const DIVISIONS = 8;

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function harmonyXml(symbol: string, offset: number): string {
  const [main, bass] = symbol.split('/');
  const m = /^([A-G])([#b]?)(.*)$/.exec(main);
  if (!m) return '';
  const alter = (a: string) => (a === '#' ? '<root-alter>1</root-alter>' : a === 'b' ? '<root-alter>-1</root-alter>' : '');
  const kind = Object.entries(KINDS).find(([, suffix]) => suffix === m[3])?.[0];
  let xml = `<harmony><root><root-step>${m[1]}</root-step>${alter(m[2])}</root>`;
  xml += kind ? `<kind text="${escapeXml(m[3])}">${kind}</kind>` : `<kind text="${escapeXml(m[3])}">other</kind>`;
  const b = bass && /^([A-G])([#b]?)$/.exec(bass);
  if (b) xml += `<bass><bass-step>${b[1]}</bass-step>${alter(b[2]).replace(/root/g, 'bass')}</bass>`;
  if (offset > 0) xml += `<offset>${Math.round(offset * DIVISIONS)}</offset>`;
  return `${xml}</harmony>`;
}

/** Whether a song has fixed notes that can be written to a file. */
export function canExport(song: Song): boolean {
  return !song.arpeggio;
}

/** Writes a song as MusicXML in its own key. */
export function exportMusicXml(song: Song): string {
  if (!canExport(song)) throw new Error('Arpeggio exercises are built from their chords and have no fixed notes to export.');
  const key = keyById(homeKey(song));
  const written = (p: Pitch) => transposeFromC(p, key, 0);
  const midis = song.measures.flat().flatMap((n) => (n.pitch ? [pitchToMidi(written(n.pitch))] : []));
  const average = midis.reduce((a, b) => a + b, 0) / Math.max(1, midis.length);
  const clef = average >= 57 ? '<clef><sign>G</sign><line>2</line></clef>' : '<clef><sign>F</sign><line>4</line></clef>';
  const dotted = song.beatQuarters === 1.5;
  const tempo =
    '<direction placement="above"><direction-type><metronome>' +
    `<beat-unit>quarter</beat-unit>${dotted ? '<beat-unit-dot/>' : ''}<per-minute>${song.bpm}</per-minute>` +
    `</metronome></direction-type><sound tempo="${Math.round(song.bpm * song.beatQuarters * 100) / 100}"/></direction>`;

  let tied = false;
  const measures = song.measures.map((measure, m) => {
    const number = song.pickup ? m : m + 1;
    let xml = `<measure number="${number}"${song.pickup && m === 0 ? ' implicit="yes"' : ''}>`;
    if (m === 0) {
      xml +=
        `<attributes><divisions>${DIVISIONS}</divisions>` +
        `<key><fifths>${key.fifths}</fifths><mode>${song.minor ? 'minor' : 'major'}</mode></key>` +
        `<time><beats>${song.time[0]}</beats><beat-type>${song.time[1]}</beat-type></time>${clef}</attributes>` +
        tempo;
    }
    const length = measure.reduce((sum, n) => sum + n.quarters, 0);
    const chords = (song.chordBars[m] ?? []).map((token, i, all) => {
      const { symbol, at } = splitChordToken(token);
      return { symbol: transposeChord(symbol, key) ?? symbol, at: at ?? (i * length) / all.length };
    });
    let position = 0;
    measure.forEach((note, k) => {
      const end = k === measure.length - 1 ? Infinity : position + note.quarters;
      for (const chord of chords) if (chord.at >= position - 1e-6 && chord.at < end - 1e-6) xml += harmonyXml(chord.symbol, chord.at - position);
      const ties = (tied ? '<tie type="stop"/>' : '') + (note.tie ? '<tie type="start"/>' : '');
      const tiedNotations = (tied ? '<tied type="stop"/>' : '') + (note.tie ? '<tied type="start"/>' : '');
      let body: string;
      if (note.pitch) {
        const p = written(note.pitch);
        body = `<pitch><step>${'CDEFGAB'[p.step]}</step>${p.alter ? `<alter>${p.alter}</alter>` : ''}<octave>${p.octave}</octave></pitch>`;
      } else {
        body = '<rest/>';
      }
      xml +=
        `<note>${body}<duration>${Math.round(note.quarters * DIVISIONS)}</duration>${note.pitch ? ties : ''}` +
        `<voice>1</voice><type>${TYPES[note.duration]}</type>${'<dot/>'.repeat(note.dots)}` +
        `${note.pitch && tiedNotations ? `<notations>${tiedNotations}</notations>` : ''}</note>`;
      tied = note.tie && note.pitch !== null;
      position += note.quarters;
    });
    if (m === song.measures.length - 1) xml += '<barline location="right"><bar-style>light-heavy</bar-style></barline>';
    return `${xml}</measure>`;
  });

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' +
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n' +
    '<score-partwise version="4.0">' +
    `<work><work-title>${escapeXml(song.title)}</work-title></work>` +
    '<identification><encoding><software>Instrument Hero</software></encoding></identification>' +
    '<part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list>' +
    `<part id="P1">${measures.join('')}</part></score-partwise>\n`
  );
}

/** File name for an exported song. */
export function exportFileName(song: Song): string {
  return `${slug(song.title)}.musicxml`;
}

// ---------------------------------------------------------------- reading files

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(data.slice()).body!.pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The score inside a compressed .mxl file (a zip archive). */
async function unzipScore(bytes: Uint8Array): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('The .mxl file is damaged (not a zip archive).');
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const entries = new Map<string, { method: number; size: number; local: number }>();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('The .mxl file is damaged.');
    const nameLength = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    entries.set(name, {
      method: view.getUint16(offset + 10, true),
      size: view.getUint32(offset + 20, true),
      local: view.getUint32(offset + 42, true),
    });
    offset += 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  const read = async (name: string) => {
    const entry = entries.get(name)!;
    const start = entry.local + 30 + view.getUint16(entry.local + 26, true) + view.getUint16(entry.local + 28, true);
    const data = bytes.subarray(start, start + entry.size);
    if (entry.method === 0) return data;
    if (entry.method === 8) return inflate(data);
    throw new Error('The .mxl file uses a compression method that is not supported.');
  };
  let path: string | undefined;
  if (entries.has('META-INF/container.xml')) {
    const container = decodeText(await read('META-INF/container.xml'));
    path = /full-path="([^"]+)"/.exec(container)?.[1];
  }
  path ??= [...entries.keys()].find((n) => !n.startsWith('META-INF/') && /\.(musicxml|xml)$/i.test(n));
  if (!path || !entries.has(path)) throw new Error('No score was found inside the .mxl file.');
  return read(path);
}

function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  return new TextDecoder().decode(bytes);
}

/** The MusicXML text of a .musicxml, .xml, or compressed .mxl file. */
export async function readScoreFile(bytes: Uint8Array): Promise<string> {
  const zipped = bytes[0] === 0x50 && bytes[1] === 0x4b;
  return decodeText(zipped ? await unzipScore(bytes) : bytes);
}
