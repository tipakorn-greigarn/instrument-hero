import { AudioEngine, type Channel } from './audio/engine';
import { DIFFICULTIES, Grader, difficultyById, type NoteResult, type Summary, type Target } from './game/grader';
import { NoteTracker } from './game/tracker';
import { arrange, defaultOctave, octaveOptions, type Arrangement } from './music/arrange';
import { INSTRUMENTS, instrumentById } from './music/instruments';
import { SONGS, barQuarters, songById } from './music/songs';
import { KEYS, keyById, midiName } from './music/theory';
import { SIMULATED, loadBest, loadSettings, saveBest, saveSettings } from './storage';
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
  shown.forEach((result, i) => result && sheet.mark(i, result.verdict));
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
  return settings.device === SIMULATED;
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
    engine.playNotes(
      targets.map((t) => ({ ...t, time: t.time + songStart })),
      { audible: 0.5, analyzed: simulated },
    );
  }

  // A player follows the click as heard, which is late by the output latency,
  // and the instrument arrives late by the input latency.
  const latency = simulated ? 0 : engine.outputLatency + engine.inputLatency + settings.latencyMs / 1000;
  tracker = makeTracker();
  shown = targets.map(() => null);
  sheet.clearMarks();
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

function describeResult(result: NoteResult, target: Target): string {
  const ms = result.dt !== undefined ? Math.round(Math.abs(result.dt) * 1000) : 0;
  switch (result.verdict) {
    case 'perfect':
      return 'Perfect';
    case 'good':
      return `Good, ${ms} ms ${result.dt! > 0 ? 'late' : 'early'}`;
    case 'ok':
      return `${result.dt! > 0 ? 'Late' : 'Early'} by ${ms} ms`;
    case 'wrong':
      return `Wrong note: ${midiName(result.playedMidi!, prefersFlats())} instead of ${midiName(target.midi, prefersFlats())}`;
    case 'miss':
      return 'Missed';
  }
}

function applyResults(current: Run, indices: number[]): void {
  for (const i of indices) {
    const result = current.grader.results[i]!;
    shown[i] = result;
    sheet.mark(i, result.verdict);
    if (result.verdict === 'wrong' || result.verdict === 'miss') {
      current.streak = 0;
    } else {
      current.hits++;
      current.streak++;
    }
    ui.status.textContent = describeResult(result, current.grader.targets[i]);
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

function showResults(summary: Summary, isBest: boolean): void {
  const { counts } = summary;
  const grade = document.createElement('div');
  grade.className = 'grade';
  grade.textContent = summary.grade;

  const score = document.createElement('p');
  score.className = 'score';
  score.textContent = `${Math.round(summary.score)}% on ${difficultyById(settings.difficulty).name}${isBest ? ' - new best' : ''}`;

  const tally = document.createElement('p');
  tally.className = 'counts';
  const parts: [string, number][] = [
    ['Perfect', counts.perfect],
    ['Good', counts.good],
    ['Early or late', counts.ok],
    ['Wrong note', counts.wrong],
    ['Missed', counts.miss],
  ];
  tally.append(...parts.map(([label, n]) => Object.assign(document.createElement('span'), { textContent: `${label}: ${n}` })));

  const notes = document.createElement('p');
  notes.className = 'notes';
  if (summary.meanDtMs === null) {
    notes.textContent = 'No notes were detected. Check the input device, channel, and level meter.';
  } else {
    const mean = Math.round(summary.meanDtMs);
    const timing =
      Math.abs(mean) < 15 ? 'Timing was centered on the beat.' : `On average ${Math.abs(mean)} ms ${mean > 0 ? 'late' : 'early'}.`;
    notes.textContent = `${timing} Average pitch error ${Math.round(summary.meanAbsCents!)} cents.`;
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
      notes.append(button);
    }
  }

  ui.results.replaceChildren(grade, score, tally, notes);
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
