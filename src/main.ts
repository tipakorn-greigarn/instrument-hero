import { AudioEngine, type Channel } from './audio/engine';
import { DIFFICULTIES, Grader, difficultyById, type NoteResult, type Summary, type Target } from './game/grader';
import { NoteTracker } from './game/tracker';
import { arrange, defaultOctave, octaveOptions, type Arrangement } from './music/arrange';
import { INSTRUMENTS, instrumentById } from './music/instruments';
import { SONGS, barQuarters, songById } from './music/songs';
import { KEYS, keyById, midiName } from './music/theory';
import { SIMULATED, SIMULATED_SLOPPY, loadBest, loadSettings, saveBest, saveSettings } from './storage';
import { SheetView } from './ui/sheet';

interface Run {
  /** AudioContext time of the first beat of the song. */
  songStart: number;
  secPerQuarter: number;
  /** Length of the count-in and of the song, in seconds. */
  countIn: number;
  total: number;
  /** Subtracted from event times to get song time; includes latency compensation. */
  offset: number;
  /** How far the cursor trails the audio clock, so it lines up with what is heard. */
  visualDelay: number;
  grader: Grader;
  hits: number;
  streak: number;
}

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const ui = {
  song: el<HTMLSelectElement>('song'),
  instrument: el<HTMLSelectElement>('instrument'),
  key: el<HTMLSelectElement>('key'),
  octave: el<HTMLSelectElement>('octave'),
  bpm: el<HTMLInputElement>('bpm'),
  bpmValue: el<HTMLOutputElement>('bpm-value'),
  difficulty: el<HTMLSelectElement>('difficulty'),
  difficultyHint: el('difficulty-hint'),
  metronome: el<HTMLInputElement>('metronome'),
  guide: el<HTMLInputElement>('guide'),
  device: el<HTMLSelectElement>('device'),
  channel: el<HTMLSelectElement>('channel'),
  latency: el<HTMLInputElement>('latency'),
  gate: el<HTMLInputElement>('gate'),
  gateValue: el<HTMLOutputElement>('gate-value'),
  connect: el<HTMLButtonElement>('connect'),
  inputStatus: el('input-status'),
  meterFill: el('meter-fill'),
  meterGate: el('meter-gate'),
  start: el<HTMLButtonElement>('start'),
  pitchName: el('pitch-name'),
  needle: el('tuner-needle'),
  status: el('status'),
  fbTiming: el('fb-timing'),
  fbPitch: el('fb-pitch'),
  tally: el('tally'),
  sheetTitle: el('sheet-title'),
  sheetSub: el('sheet-sub'),
  results: el('results'),
};

const METER_FLOOR_DB = -70;

const engine = new AudioEngine();
const sheet = new SheetView(el('sheet'));
const settings = loadSettings();

let arrangement: Arrangement;
let tracker: NoteTracker | null = null;
let run: Run | null = null;
let starting = false;
/** Results shown on the sheet, kept so they survive a re-render. */
let shown: (NoteResult | null)[] = [];
let shownTargets: Target[] = [];

// ---------------------------------------------------------------- setup

function fillSelect(select: HTMLSelectElement, options: { value: string; label: string }[], value: string): void {
  select.replaceChildren(...options.map((o) => new Option(o.label, o.value)));
  select.value = value;
}

function prefersFlats(): boolean {
  return keyById(settings.key).fifths < 0;
}

function describeBest(): string {
  const best = loadBest(settings.song, settings.instrument, settings.difficulty);
  const level = difficultyById(settings.difficulty).name;
  if (!best) return `No ${level} score yet`;
  return `Best on ${level}: ${best.grade} (${Math.round(best.score)}%) at ${best.bpm} bpm in ${best.key}`;
}

/** Rebuild the arrangement from the settings and redraw the sheet. */
function refresh(): void {
  const song = songById(settings.song);
  const instrument = instrumentById(settings.instrument);
  const key = keyById(settings.key);

  const options = octaveOptions(song, key, instrument);
  if (settings.octave === null || !options.some((o) => o.shift === settings.octave)) {
    settings.octave = defaultOctave(options, instrument);
  }
  fillSelect(
    ui.octave,
    options.map((o) => ({
      value: String(o.shift),
      label: `${midiName(o.low, prefersFlats())} to ${midiName(o.high, prefersFlats())}${o.fits ? '' : ' (out of range)'}`,
    })),
    String(settings.octave),
  );

  arrangement = arrange(song, key, instrument, settings.octave);
  shown = [];
  ui.bpmValue.textContent = `${settings.bpm} bpm`;
  ui.difficultyHint.textContent = difficultyById(settings.difficulty).summary;
  ui.sheetTitle.textContent = song.title;
  const transposing = instrument.soundsBelowWritten === 12 ? ', sounds one octave below written' : '';
  ui.sheetSub.textContent = `${key.name} · ${instrument.name}${transposing} · ${describeBest()}`;
  sheet.render(arrangement);
  saveSettings(settings);
}

function redrawSheet(): void {
  sheet.render(arrangement);
  shown.forEach((result, i) => result && sheet.mark(i, result, shownTargets[i], prefersFlats()));
}

function gateLevel(): number {
  return Math.pow(10, settings.gateDb / 20);
}

function makeTracker(): NoteTracker {
  const instrument = instrumentById(settings.instrument);
  return new NoteTracker({
    sampleRate: engine.sampleRate,
    lowMidi: instrument.low,
    highMidi: instrument.high,
    legato: instrument.legato,
    gate: gateLevel(),
  });
}

function updateGateDisplay(): void {
  ui.gateValue.textContent = `${settings.gateDb} dB`;
  ui.meterGate.style.left = `${(100 * (settings.gateDb - METER_FLOOR_DB)) / -METER_FLOOR_DB}%`;
}

// ---------------------------------------------------------------- audio input

function isSimulated(): boolean {
  return settings.device === SIMULATED || settings.device === SIMULATED_SLOPPY;
}

async function populateDevices(): Promise<void> {
  const inputs = await engine.listInputs();
  const options = [{ value: '', label: 'Default input' }];
  inputs.forEach((d, i) => {
    if (d.deviceId && d.deviceId !== 'default') {
      options.push({ value: d.deviceId, label: d.label || `Input ${i + 1}` });
    }
  });
  options.push({ value: SIMULATED, label: 'Simulated player (self-test)' });
  options.push({ value: SIMULATED_SLOPPY, label: 'Simulated player with mistakes (self-test)' });
  if (!options.some((o) => o.value === settings.device)) settings.device = '';
  fillSelect(ui.device, options, settings.device);
}

function updateInputStatus(message?: string): void {
  if (message) {
    ui.inputStatus.textContent = `- ${message}`;
  } else if (isSimulated()) {
    ui.inputStatus.textContent = '- simulated player';
  } else {
    ui.inputStatus.textContent = engine.hasInput ? '- listening' : '- not connected';
  }
  ui.connect.hidden = isSimulated() || engine.hasInput;
}

/** Open the selected device. Throws with a readable message on failure. */
async function connectInput(): Promise<void> {
  if (isSimulated()) {
    engine.closeInput();
    updateInputStatus();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Audio input needs a secure page (https or localhost).');
  }
  try {
    try {
      await engine.openInput(settings.device, settings.channel);
    } catch (error) {
      // A remembered device that is no longer plugged in: fall back to the default.
      if (!settings.device || (error as DOMException).name !== 'OverconstrainedError') throw error;
      settings.device = '';
      await engine.openInput('', settings.channel);
    }
  } catch (error) {
    const name = (error as DOMException).name;
    throw new Error(
      name === 'NotAllowedError'
        ? 'Microphone permission was denied. Allow it in the browser and try again.'
        : name === 'NotFoundError'
          ? 'No audio input device was found.'
          : `Could not open the audio input (${name}).`,
    );
  }
  tracker = null;
  await populateDevices();
  updateInputStatus();
  saveSettings(settings);
}

async function connectFromUi(): Promise<void> {
  try {
    await engine.resume();
    await connectInput();
  } catch (error) {
    updateInputStatus((error as Error).message);
  }
}

// ---------------------------------------------------------------- playing

/** A fixed pattern of early, late, out-of-tune, wrong, and skipped notes for the sloppy simulated player. */
function withMistakes(targets: Target[]): Target[] {
  const shifts = [0, 0.06, -0.07, 0, 0.13, 0, -0.03, 0.02];
  return targets.flatMap((target, i) => {
    if (i % 11 === 9) return [];
    const midi = i % 7 === 5 ? target.midi + 2 : i % 5 === 2 ? target.midi + 0.3 : target.midi;
    return [{ ...target, time: Math.max(0, target.time + shifts[i % shifts.length]), midi }];
  });
}

async function start(): Promise<void> {
  if (run || starting) return;
  starting = true;
  try {
    await engine.resume();
    if (isSimulated()) engine.closeInput();
    else if (!engine.hasInput) await connectInput();
  } catch (error) {
    ui.status.textContent = (error as Error).message;
    updateInputStatus((error as Error).message);
    return;
  } finally {
    starting = false;
  }

  const song = arrangement.song;
  const simulated = isSimulated();
  const secPerQuarter = 60 / settings.bpm / song.beatQuarters;
  const beat = song.beatQuarters * secPerQuarter;
  const bar = barQuarters(song);
  const countIn = bar * secPerQuarter;
  const songStart = engine.now + 0.25 + countIn;
  const total = arrangement.totalQuarters * secPerQuarter;

  for (let b = 0; b * song.beatQuarters < bar; b++) {
    engine.click(songStart - countIn + b * beat, b === 0, 0.5);
  }
  if (settings.metronome) {
    for (let q = 0; q < arrangement.totalQuarters; q += song.beatQuarters) {
      engine.click(songStart + q * secPerQuarter, q % bar === 0, 0.3);
    }
  }

  const targets: Target[] = arrangement.notes.map((n) => ({
    time: n.start * secPerQuarter,
    dur: n.quarters * secPerQuarter,
    midi: n.midi!,
  }));
  if (simulated || settings.guide) {
    const played = settings.device === SIMULATED_SLOPPY ? withMistakes(targets) : targets;
    engine.playNotes(
      played.map((t) => ({ ...t, time: t.time + songStart })),
      { audible: 0.5, analyzed: simulated },
    );
  }

  // A player follows the click as heard, which is late by the output latency,
  // and the instrument arrives late by the input latency.
  const latency = simulated ? 0 : engine.outputLatency + engine.inputLatency + settings.latencyMs / 1000;
  tracker = makeTracker();
  shown = targets.map(() => null);
  shownTargets = targets;
  sheet.clearMarks();
  setFeedback(null);
  ui.results.hidden = true;
  run = {
    songStart,
    secPerQuarter,
    countIn,
    total,
    offset: songStart + latency,
    visualDelay: simulated ? 0 : engine.outputLatency,
    grader: new Grader(targets, difficultyById(settings.difficulty)),
    hits: 0,
    streak: 0,
  };
  ui.start.textContent = 'Stop';
  ui.tally.textContent = '';
}

function endRun(): void {
  engine.stopScheduled();
  sheet.setCursor(null);
  run = null;
  ui.start.textContent = 'Start';
}

function stop(): void {
  if (!run) return;
  endRun();
  ui.status.textContent = 'Stopped.';
}

const TIMING_CLASS = { perfect: 'is-good', good: 'is-near', ok: 'is-off' } as const;

/** Show the latest note's timing and pitch as two separate readouts. */
function setFeedback(result: NoteResult | null, target?: Target): void {
  let timing = '-';
  let pitch = '-';
  let timingClass = '';
  let pitchClass = '';
  if (result?.verdict === 'miss') {
    timing = 'No note played';
    timingClass = 'is-none';
  } else if (result && target) {
    const ms = Math.round(result.dt! * 1000);
    timing = result.timing === 'perfect' ? `On time (${ms >= 0 ? '+' : ''}${ms} ms)` : `${Math.abs(ms)} ms ${ms > 0 ? 'late' : 'early'}`;
    timingClass = TIMING_CLASS[result.timing!];
    if (result.verdict === 'wrong') {
      const played = result.playedMidi!;
      pitch = `${midiName(played, prefersFlats())} played, ${midiName(target.midi, prefersFlats())} expected`;
      pitchClass = 'is-bad';
    } else {
      const cents = Math.round(result.cents!);
      pitch = Math.abs(cents) <= 15 ? 'Correct' : `Correct, ${Math.abs(cents)} cents ${cents > 0 ? 'sharp' : 'flat'}`;
      pitchClass = Math.abs(cents) <= 15 ? 'is-good' : 'is-near';
    }
  }
  ui.fbTiming.textContent = timing;
  ui.fbTiming.className = timingClass;
  ui.fbPitch.textContent = pitch;
  ui.fbPitch.className = pitchClass;
}

function applyResults(current: Run, indices: number[]): void {
  for (const i of indices) {
    const result = current.grader.results[i]!;
    const target = current.grader.targets[i];
    shown[i] = result;
    sheet.mark(i, result, target, prefersFlats());
    if (result.verdict === 'wrong' || result.verdict === 'miss') {
      current.streak = 0;
    } else {
      current.hits++;
      current.streak++;
    }
    setFeedback(result, target);
  }
  if (indices.length) {
    ui.tally.textContent = `${current.hits} / ${current.grader.targets.length} hit · streak ${current.streak}`;
  }
}

function updateRun(current: Run, activeTracker: NoteTracker): void {
  const songNow = engine.now - current.songStart;
  const visual = songNow - current.visualDelay;
  if (visual < 0) {
    const beat = arrangement.song.beatQuarters * current.secPerQuarter;
    const count = Math.floor((visual + current.countIn) / beat) + 1;
    ui.status.textContent = count >= 1 ? `Count in: ${count}` : 'Get ready';
    sheet.setCursor(0, true);
  } else {
    ui.status.textContent = 'Playing';
    sheet.setCursor(Math.min(visual / current.secPerQuarter, arrangement.totalQuarters), true);
  }
  applyResults(current, current.grader.update(activeTracker.events, current.offset, engine.now - current.offset));
  if (songNow > current.total + 0.8) finish(current, activeTracker);
}

function finish(current: Run, activeTracker: NoteTracker): void {
  const before = current.grader.results.map((r) => r !== null);
  const summary = current.grader.finalize(activeTracker.events, activeTracker.frames, current.offset);
  applyResults(
    current,
    before.flatMap((done, i) => (done ? [] : [i])),
  );
  summary.results.forEach((result, i) => (shown[i] = result));
  endRun();
  ui.status.textContent = 'Finished.';

  const isBest =
    !isSimulated() &&
    saveBest(settings.song, settings.instrument, settings.difficulty, {
      score: summary.score,
      grade: summary.grade,
      bpm: settings.bpm,
      key: settings.key,
      date: new Date().toISOString(),
    });
  showResults(summary, isBest);
}

function block(title: string, pct: number | null, ...lines: (string | HTMLElement)[]): HTMLElement {
  const section = document.createElement('div');
  const heading = Object.assign(document.createElement('h3'), { textContent: title });
  const value = Object.assign(document.createElement('p'), {
    className: 'pct',
    textContent: pct === null ? '-' : `${Math.round(pct)}%`,
  });
  section.append(heading, value);
  for (const line of lines) {
    const p = document.createElement('p');
    p.className = 'detail';
    p.append(line);
    section.append(p);
  }
  return section;
}

/** One sentence on what to work on next, from whichever of pitch and timing is weaker. */
function focusAdvice(summary: Summary): string {
  const { counts, pitchPct, timingPct, early, late, meanDtMs } = summary;
  if (timingPct === null) return 'No notes were detected. Check the input device, channel, and level meter.';
  if (pitchPct >= 99.5 && timingPct >= 99.5) return 'Clean run. Raise the tempo or the difficulty.';
  if (pitchPct < timingPct) {
    return counts.miss > counts.wrong
      ? 'Focus on pitch: notes were skipped. Slow the tempo until every note sounds.'
      : 'Focus on pitch: wrong notes were played. Check the red note names against the staff.';
  }
  const direction = Math.abs(late - early) <= 1 ? 'both early and late' : late > early ? 'late' : 'early';
  const drift = meanDtMs !== null && Math.abs(meanDtMs) >= 15 ? `, ${Math.abs(Math.round(meanDtMs))} ms on average` : '';
  return `Focus on timing: the off notes were ${direction}${drift}.`;
}

function showResults(summary: Summary, isBest: boolean): void {
  const { counts } = summary;
  const overall = document.createElement('div');
  overall.className = 'overall';
  overall.append(
    Object.assign(document.createElement('div'), { className: 'grade', textContent: summary.grade }),
    Object.assign(document.createElement('p'), {
      className: 'score',
      textContent: `${Math.round(summary.score)}% on ${difficultyById(settings.difficulty).name}`,
    }),
  );
  if (isBest) overall.append(Object.assign(document.createElement('p'), { className: 'detail', textContent: 'New best' }));

  const timingLines: (string | HTMLElement)[] = [
    `On time ${counts.perfect} · Early ${summary.early} · Late ${summary.late}`,
  ];
  if (summary.meanDtMs !== null) {
    const mean = Math.round(summary.meanDtMs);
    timingLines.push(Math.abs(mean) < 15 ? 'Centered on the beat on average.' : `${Math.abs(mean)} ms ${mean > 0 ? 'late' : 'early'} on average.`);
    if (!isSimulated() && Math.abs(mean) >= 20 && counts.perfect + counts.good + counts.ok >= 5) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `Treat as latency (${mean > 0 ? '+' : ''}${mean} ms)`;
      button.title = 'If you felt on the beat, the difference is audio latency. This adds it to the latency offset.';
      button.addEventListener('click', () => {
        settings.latencyMs += mean;
        ui.latency.value = String(settings.latencyMs);
        saveSettings(settings);
        button.remove();
      });
      timingLines.push(button);
    }
  }

  const pitchLines = [`Correct ${counts.perfect + counts.good + counts.ok} · Wrong ${counts.wrong} · Not played ${counts.miss}`];
  if (summary.meanAbsCents !== null) pitchLines.push(`${Math.round(summary.meanAbsCents)} cents off on average.`);

  const focus = Object.assign(document.createElement('p'), { className: 'focus', textContent: focusAdvice(summary) });
  ui.results.replaceChildren(
    overall,
    block('Timing', summary.timingPct, ...timingLines),
    block('Pitch', summary.pitchPct, ...pitchLines),
    focus,
  );
  ui.results.hidden = false;
  ui.sheetSub.textContent = ui.sheetSub.textContent!.replace(/[^·]*$/, ` ${describeBest()}`);
}

// ---------------------------------------------------------------- frame loop

function updateReadout(activeTracker: NoteTracker): void {
  const db = 20 * Math.log10(Math.max(activeTracker.level, 1e-6));
  const fill = Math.max(0, Math.min(1, (db - METER_FLOOR_DB) / -METER_FLOOR_DB));
  ui.meterFill.style.width = `${100 * fill}%`;

  const midi = activeTracker.midi;
  if (midi === null) {
    ui.pitchName.textContent = '--';
    ui.needle.hidden = true;
    return;
  }
  const nearest = Math.round(midi);
  const cents = (midi - nearest) * 100;
  ui.pitchName.textContent = midiName(nearest, prefersFlats());
  ui.needle.hidden = false;
  ui.needle.style.left = `${50 + cents}%`;
  ui.needle.classList.toggle('in-tune', Math.abs(cents) <= 10);
}

function frame(): void {
  if (engine.context && (engine.hasInput || run)) {
    tracker ??= makeTracker();
    tracker.process(engine.read(), engine.now);
    updateReadout(tracker);
    if (run) updateRun(run, tracker);
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- wiring

/** Apply a settings change; any change ends a run in progress. */
function onSetting(apply: () => void): () => void {
  return () => {
    stop();
    apply();
    refresh();
  };
}

function init(): void {
  fillSelect(ui.song, SONGS.map((s) => ({ value: s.id, label: s.title })), settings.song);
  fillSelect(ui.instrument, INSTRUMENTS.map((i) => ({ value: i.id, label: i.name })), settings.instrument);
  fillSelect(ui.key, KEYS.map((k) => ({ value: k.id, label: k.name })), settings.key);
  fillSelect(ui.difficulty, DIFFICULTIES.map((d) => ({ value: d.id, label: d.name })), difficultyById(settings.difficulty).id);
  ui.bpm.value = String(settings.bpm);
  ui.metronome.checked = settings.metronome;
  ui.guide.checked = settings.guide;
  ui.channel.value = settings.channel;
  ui.latency.value = String(settings.latencyMs);
  ui.gate.value = String(settings.gateDb);

  ui.song.addEventListener(
    'change',
    onSetting(() => {
      settings.song = ui.song.value;
      settings.bpm = songById(settings.song).bpm;
      settings.octave = null;
      ui.bpm.value = String(settings.bpm);
    }),
  );
  ui.instrument.addEventListener(
    'change',
    onSetting(() => {
      settings.instrument = ui.instrument.value;
      settings.octave = null;
      tracker = null;
    }),
  );
  ui.key.addEventListener(
    'change',
    onSetting(() => {
      settings.key = ui.key.value;
      settings.octave = null;
    }),
  );
  ui.octave.addEventListener('change', onSetting(() => (settings.octave = Number(ui.octave.value))));
  ui.bpm.addEventListener('input', () => {
    stop();
    settings.bpm = Number(ui.bpm.value);
    ui.bpmValue.textContent = `${settings.bpm} bpm`;
    saveSettings(settings);
  });
  ui.difficulty.addEventListener('change', onSetting(() => (settings.difficulty = ui.difficulty.value)));
  ui.metronome.addEventListener('change', onSetting(() => (settings.metronome = ui.metronome.checked)));
  ui.guide.addEventListener('change', onSetting(() => (settings.guide = ui.guide.checked)));

  ui.device.addEventListener('change', () => {
    stop();
    settings.device = ui.device.value;
    saveSettings(settings);
    if (isSimulated() || engine.context) void connectFromUi();
    else updateInputStatus();
  });
  ui.channel.addEventListener('change', () => {
    settings.channel = ui.channel.value as Channel;
    engine.setChannel(settings.channel);
    saveSettings(settings);
  });
  ui.latency.addEventListener('change', () => {
    settings.latencyMs = Number(ui.latency.value) || 0;
    saveSettings(settings);
  });
  ui.gate.addEventListener('input', () => {
    settings.gateDb = Number(ui.gate.value);
    updateGateDisplay();
    saveSettings(settings);
    if (!run) tracker = null;
  });
  ui.connect.addEventListener('click', () => void connectFromUi());
  ui.start.addEventListener('click', () => (run ? stop() : void start()));

  document.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement;
    if (event.code !== 'Space' || ['INPUT', 'SELECT', 'BUTTON', 'SUMMARY'].includes(target.tagName)) return;
    event.preventDefault();
    if (run) stop();
    else void start();
  });

  navigator.mediaDevices?.addEventListener?.('devicechange', () => void populateDevices());

  let resizeTimer = 0;
  let lastWidth = el('sheet').clientWidth;
  new ResizeObserver(() => {
    const width = el('sheet').clientWidth;
    if (width === lastWidth) return;
    lastWidth = width;
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(redrawSheet, 150);
  }).observe(el('sheet'));

  updateGateDisplay();
  refresh();
  void populateDevices().then(() => updateInputStatus());
  requestAnimationFrame(frame);
}

init();
