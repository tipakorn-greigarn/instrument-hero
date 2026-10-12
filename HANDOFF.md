# HANDOFF

State as of 2026-10-12: v0.1.0 feature-complete for the first request, on
branch `develop` (gitflow; `main` holds only the scaffolding commit until a
release is cut).

## What works

- Song, key, instrument, range, tempo selection; notation rendering; cursor;
  metronome and count-in; guide melody; input device and channel selection;
  per-note grading on the sheet; result summary; best scores and settings in
  localStorage.
- Automated tests (33) and a browser self-test with the simulated player.

## Not yet verified

- A real guitar or bass through an audio interface. Detection thresholds were
  tuned on synthesized plucked tones only. First things to check with a real
  instrument:
  - Attack detection on repeated notes and on quiet notes (ONSET_RATIO and the
    noise gate in `src/game/tracker.ts`).
  - Octave errors on the low E and B strings of a bass (PEAK_THRESHOLD in
    `src/audio/pitch.ts`).
  - Timing bias; adjust with the latency offset.
- Safari and Firefox. Developed against Chromium.

## Known limits

- Monophonic only; chords are not graded.
- Extra notes that are not in the score are not penalized.
- Major keys only; no ties, repeats, or pickup bars in the song format.
- Beams and the stems of beamed notes stay black when a note is colored.
- Non-octave transposing instruments are supported by the data model
  (`writtenKeyFifths`) but none is defined or tested.

## Ideas for next steps

- Calibrate latency with a dedicated clap/pluck-on-the-click routine.
- Practice mode that waits for the right note before moving on.
- Loop a range of bars; slow-down trainer that raises tempo after a good run.
- More instruments (ukulele, violin, voice) and alto/tenor clefs.
- Score history over time, not just the best score.

## Commands

See README.md. Dev server for the Claude browser pane is configured in
`.claude/launch.json` (name: dev).
