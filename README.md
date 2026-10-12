# Instrument Hero

A web app for learning an instrument by playing along to sheet music. A cursor
sweeps across standard notation in time with a metronome; the app listens to
your instrument through an audio input and grades each note on pitch and
timing.

## Features

- Twelve beginner tunes (nursery songs plus a scale warm-up), including one in 6/8.
- Any of the twelve major keys, with correct key signatures and note spelling.
- Instruments: guitar, 4-string bass, 5-string bass. The song is placed in an
  octave that fits the instrument, and you can pick another octave when more
  than one fits. Guitar and bass are written an octave above where they sound,
  as is conventional.
- Tempo from 40 to 200 bpm, optional metronome, optional guide melody.
- Three difficulty levels (Easy, Normal, Hard) that change how notes are scored.
- Input device and channel selection for audio interfaces, with a level meter
  and noise gate. Browser voice processing (echo cancellation, noise
  suppression, auto gain) is switched off.
- Per-note feedback on the sheet (perfect, good, early or late, wrong note,
  missed), a final score and letter grade, and a best score per song and
  instrument kept in the browser.
- A simulated player input for checking the whole chain without an instrument.

## Running

Everything runs in Docker; nothing is installed on the host.

Production build served by nginx on http://localhost:8080:

```bash
docker compose up -d --build app
```

Development server with hot reload on http://localhost:5173:

```bash
docker compose --profile dev up dev
```

Tests and type check:

```bash
docker compose --profile dev run --rm dev npm test
```

```bash
docker compose --profile dev run --rm dev npm run typecheck
```

Browsers only allow audio input on a secure page. `localhost` counts as
secure; to use the app from another machine, put it behind HTTPS.

## Using it

1. Plug the instrument into the audio interface and open the app in Chrome or Edge.
2. Under Audio input, press Connect input and allow microphone access. Pick the
   interface as the input device, then the channel the instrument is on
   (Input 1 is left, Input 2 is right).
3. Play a note. The level meter should move well past the gate marker and the
   note name should appear next to the Start button. Lower the noise gate if
   quiet notes are ignored; raise it if hum triggers notes.
4. Pick song, instrument, key, range, and tempo, then press Start (or Space).
   One bar of count-in clicks comes first.
5. After the song, the result panel shows the grade. If it reports that you
   were consistently late or early although you felt on the beat, press
   "Treat as latency" to fold that into the latency offset.

Use headphones for the metronome and guide melody when playing through a
microphone, so the app does not hear its own output.

## How grading works

- Each note has a time window reaching halfway to its neighbors, capped by the
  difficulty level.
- A note is a hit when an attack with the right pitch falls in its window. The
  timing error decides between Perfect, Good, and Early or Late.
- An attack with another pitch in the window is a Wrong note; no attack is a Miss.
- The note score combines timing with sustain (holding the pitch for the
  required part of the written length). The song score is the average over all
  notes.

Difficulty changes the numbers:

| | Easy | Normal | Hard |
| --- | --- | --- | --- |
| Perfect within | 80 ms | 45 ms | 30 ms |
| Good within | 150 ms | 90 ms | 60 ms |
| Hit window cap | 350 ms | 250 ms | 150 ms |
| Pitch tolerance | 50 cents, any octave | 50 cents | 30 cents |
| Timing score: Good / Early or late | 90% / 70% | 80% / 50% | 70% / 30% |
| Sustain share of note score | none | 20% | 30% |
| Required hold | - | half the note | 80% of the note |

Best scores are kept separately per difficulty. The levels are defined in
`DIFFICULTIES` in `src/game/grader.ts`.

## Project layout

```
src/music/     theory (spelling, keys, transposition), songs, instruments, arranger
src/audio/     pitch detector (McLeod method), Web Audio engine
src/game/      note tracker (attack + pitch events), grader
src/ui/        VexFlow sheet renderer with cursor and note coloring
src/main.ts    UI wiring and the frame loop
tests/         unit and end-to-end tests on synthesized audio
test-artifacts/ test plans and reports
```

### Adding a song

Append an entry to `DEFS` in `src/music/songs.ts`. Write it in C major; see the
notation comment at the top of that file. The test suite checks that every bar
is full and that the song fits every instrument in every key.

### Adding an instrument

Append an entry to `INSTRUMENTS` in `src/music/instruments.ts`: clef, sounding
range, how far it sounds below written pitch, and the written-key offset in
fifths for transposing instruments (Bb: 2, Eb: 3, F: 1). Set `legato` for
instruments that slur between notes without a new attack. Only `treble` and
`bass` clefs are wired up so far.
