// Renders an arrangement as standard notation with VexFlow, and provides the
// playback cursor and per-note result coloring on top of it.

import { Accidental, Barline, Beam, Dot, Formatter, Fraction, Renderer, Stave, StaveNote, Voice } from 'vexflow';
import type { Arrangement } from '../music/arrange';
import type { Verdict } from '../game/grader';
import { pitchToVex } from '../music/theory';

interface System {
  top: number;
  startQuarter: number;
  endQuarter: number;
  /** Cursor anchor points, ascending in time. */
  points: { quarter: number; x: number }[];
}

const SYSTEM_HEIGHT = 150;
const MARGIN = 12;
const MIN_MEASURE_WIDTH = 210;
const MAX_PER_SYSTEM = 4;
const VERDICT_CLASSES: Verdict[] = ['perfect', 'good', 'ok', 'wrong', 'miss'];

export class SheetView {
  private readonly surface: HTMLDivElement;
  private readonly cursor: HTMLDivElement;
  private systems: System[] = [];
  private noteElements: (SVGElement | undefined)[] = [];
  private cursorSystem = -1;

  constructor(private readonly container: HTMLElement) {
    this.surface = document.createElement('div');
    this.cursor = document.createElement('div');
    this.cursor.className = 'cursor';
    this.cursor.hidden = true;
    container.append(this.surface, this.cursor);
  }

  render(arrangement: Arrangement): void {
    const { song, instrument, writtenKey, measures } = arrangement;
    const clef = instrument.clef;
    const timeSpec = `${song.time[0]}/${song.time[1]}`;
    const restKey = clef === 'bass' ? 'd/3' : 'b/4';

    this.surface.innerHTML = '';
    this.systems = [];
    this.noteElements = [];
    this.cursorSystem = -1;

    const width = Math.max(320, this.container.clientWidth);
    const available = width - 2 * MARGIN;
    const perSystem = Math.max(1, Math.min(MAX_PER_SYSTEM, Math.floor(available / MIN_MEASURE_WIDTH)));
    const systemCount = Math.ceil(measures.length / perSystem);

    const renderer = new Renderer(this.surface, Renderer.Backends.SVG);
    renderer.resize(width, systemCount * SYSTEM_HEIGHT + 10);
    const ctx = renderer.getContext();

    // Space taken by the clef, key signature, and time signature, measured
    // on throwaway staves so the note areas of all measures come out equal.
    const plainOffset = new Stave(0, 0, 300).getNoteStartX();
    const firstOffset = new Stave(0, 0, 300)
      .addClef(clef)
      .addKeySignature(writtenKey.vex)
      .addTimeSignature(timeSpec)
      .getNoteStartX();
    const otherOffset = new Stave(0, 0, 300).addClef(clef).addKeySignature(writtenKey.vex).getNoteStartX();

    const staveNotes: StaveNote[] = [];
    const noteIndices: number[] = [];

    for (let s = 0; s < systemCount; s++) {
      const leadOffset = s === 0 ? firstOffset : otherOffset;
      const noteArea = (available - leadOffset - (perSystem - 1) * plainOffset) / perSystem;
      const top = s * SYSTEM_HEIGHT;
      const system: System = { top, startQuarter: 0, endQuarter: 0, points: [] };
      let x = MARGIN;

      const slice = measures.slice(s * perSystem, (s + 1) * perSystem);
      slice.forEach((measure, j) => {
        const index = s * perSystem + j;
        const stave = new Stave(x, top + 10, noteArea + (j === 0 ? leadOffset : plainOffset));
        if (j === 0) {
          stave.addClef(clef).addKeySignature(writtenKey.vex);
          if (s === 0) stave.addTimeSignature(timeSpec);
        }
        if (index === measures.length - 1) stave.setEndBarType(Barline.type.END);
        stave.setContext(ctx).draw();

        const notes = measure.map((n) => {
          const note = new StaveNote({
            keys: [n.pitch ? pitchToVex(n.pitch) : restKey],
            duration: n.duration + 'd'.repeat(n.dots) + (n.pitch ? '' : 'r'),
            clef,
            auto_stem: true,
          });
          if (n.dots) Dot.buildAndAttach([note], { all: true });
          return note;
        });

        const voice = new Voice({ num_beats: song.time[0], beat_value: song.time[1] })
          .setMode(Voice.Mode.SOFT)
          .addTickables(notes);
        Accidental.applyAccidentals([voice], writtenKey.vex);
        const beams = Beam.generateBeams(notes, song.time[1] === 8 ? { groups: [new Fraction(3, 8)] } : {});
        new Formatter().joinVoices([voice]).format([voice], stave.getNoteEndX() - stave.getNoteStartX() - 16);
        voice.draw(ctx, stave);
        beams.forEach((beam) => beam.setContext(ctx).draw());

        measure.forEach((n, k) => {
          const note = notes[k];
          system.points.push({ quarter: n.start, x: (note.getNoteHeadBeginX() + note.getNoteHeadEndX()) / 2 });
          if (n.noteIndex >= 0) {
            staveNotes.push(note);
            noteIndices.push(n.noteIndex);
          }
        });

        const last = measure[measure.length - 1];
        if (j === 0) system.startQuarter = measure[0].start;
        system.endQuarter = last.start + last.quarters;
        x += stave.getWidth();
      });

      // The cursor runs on to the final barline of the system.
      system.points.push({ quarter: system.endQuarter, x: x - 2 });
      this.systems.push(system);
    }

    staveNotes.forEach((note, i) => {
      this.noteElements[noteIndices[i]] = note.getSVGElement();
    });
    this.setCursor(null);
  }

  /** Position the cursor at a song position in quarter notes, or hide it with null. */
  setCursor(quarter: number | null, follow = false): void {
    if (quarter === null || this.systems.length === 0) {
      this.cursor.hidden = true;
      this.cursorSystem = -1;
      return;
    }
    let index = this.systems.findIndex((s) => quarter < s.endQuarter);
    if (index < 0) index = this.systems.length - 1;
    const system = this.systems[index];
    const points = system.points;
    let x = points[0].x;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (quarter >= a.quarter) {
        const f = Math.min(1, (quarter - a.quarter) / (b.quarter - a.quarter));
        x = a.x + f * (b.x - a.x);
      }
    }
    this.cursor.hidden = false;
    this.cursor.style.transform = `translate(${x}px, ${system.top + 30}px)`;
    if (follow && index !== this.cursorSystem) {
      const rect = this.container.getBoundingClientRect();
      const y = rect.top + system.top;
      if (y < 0 || y + SYSTEM_HEIGHT * 1.5 > window.innerHeight) {
        window.scrollBy({ top: y - window.innerHeight / 3, behavior: 'smooth' });
      }
    }
    this.cursorSystem = index;
  }

  mark(noteIndex: number, verdict: Verdict): void {
    this.noteElements[noteIndex]?.classList.add(`is-${verdict}`);
  }

  clearMarks(): void {
    for (const element of this.noteElements) {
      element?.classList.remove(...VERDICT_CLASSES.map((v) => `is-${v}`));
    }
  }
}
