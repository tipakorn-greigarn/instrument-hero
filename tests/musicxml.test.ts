// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { arrange } from '../src/music/arrange';
import { instrumentById } from '../src/music/instruments';
import { exportMusicXml, importMusicXml, readScoreFile } from '../src/music/musicxml';
import { buildSong, songById, type SongDef } from '../src/music/songs';
import { keyById, transposeChord } from '../src/music/theory';

/** A one-part MusicXML score; each bar is the inner XML of a <measure>. */
function score(bars: string[], { fifths = 0, mode = 'major', time = '<beats>4</beats><beat-type>4</beat-type>', title = 'Test Tune', tempo = '' } = {}): string {
  const measures = bars
    .map((inner, i) => {
      const attributes =
        i === 0
          ? `<attributes><divisions>2</divisions><key><fifths>${fifths}</fifths><mode>${mode}</mode></key><time>${time}</time></attributes>${tempo}`
          : '';
      return `<measure number="${i + 1}">${attributes}${inner}</measure>`;
    })
    .join('');
  return `<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>${title}</work-title></work><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
}

/** A note: pitch like "Bb4" or "r", length in divisions (2 per quarter). */
function n(pitch: string, divisions = 2, extra = ''): string {
  if (pitch === 'r') return `<note><rest/><duration>${divisions}</duration><voice>1</voice></note>`;
  const m = /^([A-G])(#|b)?(\d)$/.exec(pitch)!;
  const alter = m[2] === '#' ? '<alter>1</alter>' : m[2] === 'b' ? '<alter>-1</alter>' : '';
  return `<note><pitch><step>${m[1]}</step>${alter}<octave>${m[3]}</octave></pitch><duration>${divisions}</duration>${extra}<voice>1</voice></note>`;
}

const harmony = (step: string, alter: number, kind: string, offset = '') =>
  `<harmony><root><root-step>${step}</root-step>${alter ? `<root-alter>${alter}</root-alter>` : ''}</root><kind>${kind}</kind>${offset}</harmony>`;

function imported(xml: string): SongDef {
  const result = importMusicXml(xml, 'test.musicxml');
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.def;
}

function errorsOf(xml: string): string[] {
  const result = importMusicXml(xml, 'test.musicxml');
  if (result.ok) throw new Error('expected the import to be rejected');
  return result.errors;
}

describe('MusicXML import', () => {
  it('reads a melody in its own key, with pickup, tie, chord symbols, and tempo', () => {
    const def = imported(
      score(
        [
          n('F4') + n('A4'),
          harmony('B', -1, 'major-seventh') + n('Bb4', 4) + harmony('E', -1, 'dominant') + n('C5', 2, '<tie type="start"/>') + n('C5'),
          n('F4', 8),
        ],
        { fifths: -2, tempo: '<direction><sound tempo="96"/></direction>' },
      ).replace('<measure number="1">', '<measure number="0" implicit="yes">'),
    );
    expect(def.title).toBe('Test Tune');
    expect(def.id).toBe('my-test-tune');
    expect(def.keys![0]).toBe('Bb');
    expect(def.keys).toHaveLength(12);
    expect(def.bpm).toBe(96);
    expect(def.pickup).toBe(2);
    expect(def.imported).toBe(true);
    // Stored moved from Bb to C, down a minor seventh: F4 -> G3, Bb4 -> C4, C5 -> D4.
    expect(def.notation).toBe('G3:q B3:q | C4:h D4:q~ D4:q | G3:w');
    expect(def.chords).toBe('- | Cmaj7@0 F7@2 | -');
  });

  it('plays back in the written key and octave', () => {
    const def = imported(score([n('Bb3', 8)], { fifths: -2 }));
    const song = buildSong(def);
    const arrangement = arrange(song, keyById('Bb'), instrumentById('guitar'), 0);
    expect(arrangement.notes[0].pitch).toEqual({ step: 6, alter: -1, octave: 3 });
  });

  it('marks a minor key and names keys by the relative minor', () => {
    const def = imported(score([n('E4', 8)], { fifths: 1, mode: 'minor' }));
    expect(def.minor).toBe(true);
    expect(def.keys![0]).toBe('G');
  });

  it('counts tempo in dotted quarters for 6/8', () => {
    const def = imported(
      score([n('C4', 3) + n('C4', 3)], { time: '<beats>6</beats><beat-type>8</beat-type>', tempo: '<direction><sound tempo="90"/></direction>' }),
    );
    expect(def.beatQuarters).toBe(1.5);
    expect(def.bpm).toBe(60);
  });

  it('allows a short last bar after a pickup', () => {
    const def = imported(score([n('G4', 2), n('C5', 8), n('C5', 6)]));
    expect(def.pickup).toBe(1);
  });
});

describe('MusicXML import rejects what cannot be played', () => {
  const cases: [string, string, RegExp][] = [
    ['two parts', score([n('C4', 8)]).replace('</part></score-partwise>', '</part><part id="P2"><measure number="1"/></part></score-partwise>'), /2 parts/],
    ['a chord', score([n('C4', 8) + n('E4', 8, '<chord/>').replace('<pitch>', '<chord/><pitch>')]), /Bar 1: two notes sound together/],
    ['a second voice', score([n('C4', 8) + '<backup><duration>8</duration></backup>' + n('E4', 8)]), /Bar 1: .*more than one voice/],
    ['a repeat', score([n('C4', 8), n('D4', 8) + '<barline location="right"><repeat direction="backward"/></barline>']), /Bar 2: repeat signs/],
    ['a first ending', score([n('C4', 8) + '<barline><ending number="1" type="start"/></barline>']), /Bar 1: repeat signs/],
    ['D.C. al fine', score([n('C4', 8) + '<direction><direction-type><words>D.C. al Fine</words></direction-type></direction>']), /Bar 1: repeat signs/],
    ['a triplet', score([n('C4', 8).replace('<voice>', '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><voice>')]), /triplets/],
    ['a grace note', score([n('C4', 8).replace('<pitch>', '<grace/><pitch>')]), /grace notes/],
    ['a 32nd note', score([n('C4', 1).replace('<duration>1</duration>', '<duration>1</duration>').replace('<divisions>2</divisions>', '') ]).replace('<divisions>2</divisions>', '<divisions>8</divisions>'), /cannot be written as one note/],
    ['a time signature change', score([n('C4', 8), '<attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>' + n('C4', 6)]), /Bar 2: the time signature changes/],
    ['a key change', score([n('C4', 8), '<attributes><key><fifths>2</fifths></key></attributes>' + n('D4', 8)]), /Bar 2: the key signature changes/],
    ['an overfull bar', score([n('C4', 8) + n('D4', 2)]), /Bar 1: has 5 quarter notes/],
    ['a short bar in the middle', score([n('C4', 8), n('D4', 4), n('E4', 8)]), /Bar 2: has 2 quarter notes/],
    ['a tie to a different note', score([n('C4', 4, '<tie type="start"/>') + n('D4', 4)]), /tie does not lead/],
    ['no notes', score([n('r', 8)]), /no notes/],
    ['not MusicXML', '<html><body>hello</body></html>', /not a MusicXML score/],
    ['broken XML', '<score-partwise><part>', /not a readable MusicXML file/],
  ];
  for (const [name, xml, message] of cases) {
    it(`rejects ${name} with a clear message`, () => {
      expect(errorsOf(xml).join('\n')).toMatch(message);
    });
  }

  it('lists every problem, not just the first', () => {
    const errors = errorsOf(
      score([n('C4', 8).replace('<pitch>', '<grace/><pitch>') + n('C4', 8), n('D4', 8) + '<barline><repeat direction="backward"/></barline>']),
    );
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('MusicXML export', () => {
  it('round-trips an imported song', () => {
    const xml = score(
      [n('F4') + n('A4'), harmony('B', -1, 'major-seventh') + n('Bb4', 4) + harmony('E', -1, 'dominant') + n('C5', 2, '<tie type="start"/>') + n('C5'), n('F4', 8)],
      { fifths: -2, tempo: '<direction><sound tempo="96"/></direction>' },
    ).replace('<measure number="1">', '<measure number="0" implicit="yes">');
    const first = imported(xml);
    const again = imported(exportMusicXml(buildSong(first)));
    expect(again.notation).toBe(first.notation);
    expect(again.chords).toBe(first.chords);
    expect(again.keys![0]).toBe(first.keys![0]);
    expect(again.pickup).toBe(first.pickup);
    expect(again.bpm).toBe(first.bpm);
  });

  it('exports a built-in song in its own key and reads it back the same', () => {
    for (const id of ['saints', 'row-row', 'closer-walk', 'jazz-blues']) {
      const song = songById(id);
      const again = imported(exportMusicXml(song));
      expect(buildSong(again).measures.flat().map((x) => x.pitch), id).toEqual(song.measures.flat().map((x) => x.pitch));
      expect(again.keys![0], id).toBe(song.keys?.[0] ?? 'C');
    }
  });

  it('refuses the generated arpeggio exercises', () => {
    expect(() => exportMusicXml(songById('arp-jazz-blues'))).toThrow(/arpeggio/i);
  });
});

describe('score files', () => {
  it('reads a compressed .mxl file', async () => {
    const xml = score([n('C4', 8)]);
    const zip = await makeZip({
      'META-INF/container.xml': '<container><rootfiles><rootfile full-path="score.musicxml"/></rootfiles></container>',
      'score.musicxml': xml,
    });
    expect(await readScoreFile(zip)).toBe(xml);
  });

  it('transposes slash chords on both notes', () => {
    expect(transposeChord('C/E', keyById('F'))).toBe('F/A');
  });
});

/** A minimal zip archive with deflated entries. */
async function makeZip(files: Record<string, string>): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const deflate = async (bytes: Uint8Array) =>
    new Uint8Array(await new Response(new Response(bytes.slice()).body!.pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  const chunks: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = encoder.encode(content);
    const data = await deflate(raw);
    const nameBytes = encoder.encode(name);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, 8, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, nameBytes.length, true);
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(10, 8, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, raw.length, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint32(42, offset, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);
    centrals.push(new Uint8Array(central.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralLength = centrals.reduce((sum, c) => sum + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, centralLength, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((sum, c) => sum + c.length, 0));
  let at = 0;
  for (const c of all) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
