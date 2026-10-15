# HANDOFF

State as of 2026-10-15: v0.6.0 on `develop` (adds a jazz blues walking bass
exercise; v0.5.0 added competition mode with
per-song top-10 tables, removes the 5-string bass; v0.4.0's song collections
and typed tempo are in it too; not yet released to `main`). v0.3.0 is the latest release. Gitflow: work on `develop`, releases merged to
`main` and tagged. Remote: https://github.com/tipakorn-greigarn/instrument-hero

## What works

- Song, key, instrument, range, tempo, and difficulty (Easy, Normal, Hard) selection; notation rendering; cursor;
  metronome and count-in; guide melody; input device and channel selection;
  per-note timing and pitch lanes under the staff; result summary with
  separate timing and pitch percentages; Free play and Competition modes with
  named top-10 tables per song (`src/game/competition.ts`, `src/storage.ts`);
  best scores and settings in
  localStorage.
- Automated tests (42) and browser self-tests with the two simulated players
  (a clean one and one that makes deliberate mistakes).

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
- Extra notes that are not in the score are not penalized, on any difficulty.
  Worth adding to Hard once attack detection is proven on a real instrument.
- Major keys only; no ties, repeats, or pickup bars in the song format.
- Non-octave transposing instruments are supported by the data model
  (`writtenKeyFifths`) but none is defined or tested.

## Ideas for next steps

- Chord symbols above the staff, for the walking bass line and future jazz
  exercises. Needs a field in the song format and VexFlow annotations.

- Competition tables live in one browser only. Sharing them across devices
  needs a server; agreed with the owner to leave this for later.

- User-made playlists on top of the fixed collections, if the library grows.
- Calibrate latency with a dedicated clap/pluck-on-the-click routine.
- Practice mode that waits for the right note before moving on.
- Loop a range of bars; slow-down trainer that raises tempo after a good run.
- More instruments (ukulele, violin, voice) and alto/tenor clefs.
- Score history over time, not just the best score.

## Commands

See README.md. Dev server for the Claude browser pane is configured in
`.claude/launch.json` (name: dev).
