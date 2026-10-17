// Renders an arrangement as standard notation with VexFlow, and provides the
// playback cursor and per-note result coloring on top of it.

import { Accidental, Barline, Beam, Dot, Formatter, Fraction, Renderer, Stave, StaveNote, StaveTie, Voice } from 'vexflow';
import type { Arrangement } from '../music/arrange';
import type { NoteResult, Target } from '../game/grader';
import { midiName, pitchToVex } from '../music/theory';

interface System {
  top: number;
  startQuarter: number;
  endQuarter: number;
  /** Cursor anchor points, ascending in time. */
  points: { quarter: number; x: number }[];
}

interface Cells {
  timing: HTMLDivElement;
  pitch: HTMLDivElement;
}

const SYSTEM_HEIGHT = 200;
/** Vertical position of the chord symbols above each staff. */
const CHORD_LINE = 6;
/** Vertical position of the two feedback lanes below each staff. */
const TIMING_LANE = 140;
const PITCH_LANE = 168;
/** Timing error drawn at full deflection, in seconds, and that deflection in pixels. */
const TIMING_FULL_SCALE = 0.15;
const TIMING_DEFLECTION = 10;
/** Pitch error drawn at full deflection, in cents, and that deflection in pixels. */
const PITCH_FULL_SCALE = 50;
const PITCH_DEFLECTION = 7;
/** Thickness of a marker bar, and its length when the error is zero. */
const MARKER = 8;
/** Pitch errors up to this many cents are shown as in tune. */
const IN_TUNE_CENTS = 15;
const MARGIN = 12;
const MIN_MEASURE_WIDTH = 210;
const MAX_PER_SYSTEM = 4;

export class SheetView {
  private readonly surface: HTMLDivElement;
  private readonly cursor: HTMLDivElement;
  private systems: System[] = [];
  private readonly lanes: HTMLDivElement;
  private cells: Cells[] = [];
  private cursorSystem = -1;

  constructor(private readonly container: HTMLElement) {
    this.surface = document.createElement('div');
    this.cursor = document.createElement('div');
    this.cursor.className = 'cursor';
    this.cursor.hidden = true;
    this.lanes = document.createElement('div');
    container.append(this.surface, this.lanes, this.cursor);
  }

  render(arrangement: Arrangement): void {
    const { song, instrument, writtenKey, measures } = arrangement;
    const clef = instrument.clef;
    const timeSpec = `${song.time[0]}/${song.time[1]}`;
    const restKey = clef === 'bass' ? 'd/3' : 'b/4';

    this.surface.innerHTML = '';
    this.systems = [];
    this.lanes.replaceChildren();
    this.cells = [];
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

    /** The note an open tie starts from, and the system it is on. */
    let tieFrom: { note: StaveNote; system: number } | null = null;
    const drawTie = (first: StaveNote | null, last: StaveNote | null) =>
      new StaveTie({ first_note: first, last_note: last, first_indices: [0], last_indices: [0] }).setContext(ctx).draw();

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
          if (n.tiedFrom && tieFrom) {
            // A tie that crosses to a new line is drawn in two halves.
            if (tieFrom.system === s) drawTie(tieFrom.note, note);
            else {
              drawTie(tieFrom.note, null);
              drawTie(null, note);
            }
          }
          tieFrom = n.tie ? { note, system: s } : null;
          system.points.push({ quarter: n.start, x: (note.getNoteHeadBeginX() + note.getNoteHeadEndX()) / 2 });
          if (n.noteIndex >= 0) this.cells[n.noteIndex] = this.addCells(system.points[system.points.length - 1].x, top);
        });

        const last = measure[measure.length - 1];
        if (j === 0) system.startQuarter = measure[0].start;
        system.endQuarter = last.start + last.quarters;
        x += stave.getWidth();
      });

      // The cursor runs on to the final barline of the system.
      system.points.push({ quarter: system.endQuarter, x: x - 2 });
      this.systems.push(system);
      for (const chord of arrangement.chords) {
        if (chord.start >= system.startQuarter && chord.start < system.endQuarter) {
          this.addChord(chord.name, this.xAt(system, chord.start), top);
        }
      }
      this.addLabel('Timing', top + TIMING_LANE);
      this.addLabel('Pitch', top + PITCH_LANE);
    }
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
    const x = this.xAt(system, quarter);
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

  /** Horizontal position of a song position on a system, between its anchor points. */
  private xAt(system: System, quarter: number): number {
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
    return x;
  }

  private addChord(name: string, x: number, top: number): void {
    const chord = document.createElement('div');
    chord.className = 'chord';
    // Typeset flats and sharps; "b" is a flat only right after a note letter or before a number.
    chord.textContent = name.replace(/^([A-G])b/, '$1\u266d').replace(/^([A-G])#/, '$1\u266f').replace(/b(\d)/g, '\u266d$1').replace(/#(\d)/g, '\u266f$1');
    chord.style.left = `${x}px`;
    chord.style.top = `${top + CHORD_LINE}px`;
    this.lanes.append(chord);
  }

  private addLabel(text: string, y: number): void {
    const label = document.createElement('div');
    label.className = 'lane-label';
    label.textContent = text;
    label.style.top = `${y}px`;
    this.lanes.append(label);
  }

  private addCells(x: number, top: number): Cells {
    const make = (kind: string, y: number) => {
      const cell = document.createElement('div');
      cell.className = `cell ${kind}`;
      cell.style.left = `${x}px`;
      cell.style.top = `${top + y}px`;
      cell.append(document.createElement('i'));
      this.lanes.append(cell);
      return cell;
    };
    return { timing: make('timing', TIMING_LANE), pitch: make('pitch', PITCH_LANE) };
  }

  /**
   * Show a note's result in the two lanes. Timing: a bar reaching left of the
   * tick is early, right is late. Pitch: a bar reaching above the line is
   * sharp, below is flat; a wrong note shows the name of the note played.
   */
  mark(noteIndex: number, result: NoteResult, target: Target, flats: boolean): void {
    const cells = this.cells[noteIndex];
    if (!cells) return;
    this.reset(cells);
    const { timing, pitch } = cells;

    if (result.verdict === 'miss') {
      timing.classList.add('marked', 'is-none', 'text');
      timing.append('x');
      timing.title = 'No note was played here';
      return;
    }

    const ms = Math.round(result.dt! * 1000);
    const fraction = Math.max(-1, Math.min(1, result.dt! / TIMING_FULL_SCALE));
    const timingClass = result.timing === 'perfect' ? 'is-good' : result.timing === 'good' ? 'is-near' : 'is-off';
    timing.classList.add('marked', timingClass);
    // A bar growing from the tick toward the side the note fell on.
    const bar = timing.firstElementChild as HTMLElement;
    bar.style.width = `${MARKER + Math.abs(fraction) * TIMING_DEFLECTION}px`;
    bar.style[fraction < 0 ? 'right' : 'left'] = `calc(50% - ${MARKER / 2}px)`;
    timing.title = ms === 0 ? 'On time' : `${Math.abs(ms)} ms ${ms > 0 ? 'late' : 'early'}`;

    if (result.verdict === 'wrong') {
      const played = result.playedMidi!;
      pitch.classList.add('marked', 'is-bad', 'text');
      pitch.append(midiName(played, flats).replace(/-?\d+$/, ''));
      pitch.title = `Played ${midiName(played, flats)}, expected ${midiName(target.midi, flats)} (${played > target.midi ? 'too high' : 'too low'})`;
    } else {
      const cents = Math.round(result.cents!);
      const offset = Math.max(-1, Math.min(1, cents / PITCH_FULL_SCALE));
      pitch.classList.add('marked', Math.abs(cents) <= IN_TUNE_CENTS ? 'is-good' : 'is-near');
      const bar = pitch.firstElementChild as HTMLElement;
      bar.style.height = `${MARKER + Math.abs(offset) * PITCH_DEFLECTION}px`;
      bar.style[offset > 0 ? 'bottom' : 'top'] = `calc(50% - ${MARKER / 2}px)`;
      pitch.title = cents === 0 ? 'In tune' : `${Math.abs(cents)} cents ${cents > 0 ? 'sharp' : 'flat'}`;
    }
  }

  private reset(cells: Cells): void {
    for (const [kind, cell] of [['timing', cells.timing], ['pitch', cells.pitch]] as const) {
      cell.className = `cell ${kind}`;
      cell.title = '';
      cell.replaceChildren(document.createElement('i'));
    }
  }

  clearMarks(): void {
    this.cells.forEach((cells) => this.reset(cells));
  }
}
