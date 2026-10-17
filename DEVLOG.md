# DEVLOG

## 2026-10-12 - Initial build (v0.1.0)

Requirements agreed with the user before starting:

- Input is an instrument through an audio interface (microphone API), not MIDI.
- Bass and guitar first; keep the design open for other instruments.
- Static sheet music with a moving cursor, not a scrolling note highway.
- Browser-only persistence (localStorage), no backend.

Decisions:

- Vite + TypeScript, VexFlow 4.2.5 for notation, no UI framework. Static build
  served by nginx in Docker; dev server and tests also run in Docker with
  node_modules in a named volume.
- Songs are stored once in C major and transposed by diatonic step plus
  semitones, which keeps note spelling correct in every key.
- Pitch detection: McLeod Pitch Method on audio decimated to about 11-12 kHz.
  Window length scales with the instrument's lowest note (about 83 ms for
  4-string bass, 50 ms for guitar). Peaks are compared by interpolated height;
  comparing raw heights caused octave errors on high notes with a weak
  fundamental.
- Note attacks come from an RMS envelope compared with its recent minimum, so
  a re-plucked ringing string is still detected. The envelope history restarts
  after each attack; without that, the silence before a note triggered a
  second attack 70 ms later.
- Audio is read with an AnalyserNode once per animation frame rather than an
  AudioWorklet. Simpler, and timing resolution (5 ms blocks) is adequate.
- Latency: event times are corrected by output latency + reported input
  latency + a user offset. The result panel offers to fold a consistent
  early/late bias into the offset.
- A "simulated player" input feeds a synth into the analysis chain so the full
  loop can be tested without an instrument or microphone permission.

Verified: 33 unit and end-to-end tests pass; browser self-test with the
simulated player scored 100% on two songs; production image builds and serves.
Not verified: a real instrument through a real audio interface. See
test-artifacts/TEST_REPORT.md.

## 2026-10-12 - Difficulty levels (v0.2.0)

Added Easy, Normal, and Hard. A level is a set of scoring rules passed to the
grader (`Difficulty` in `src/game/grader.ts`): timing limits, hit window cap,
pitch tolerance, whether any octave counts, timing scores for non-perfect
hits, and the sustain weight and required hold. Normal is the previous
behavior unchanged. Best scores are stored per level; Normal keeps the old
storage key so existing bests carry over.

Considered and left out: penalizing extra notes on Hard. Attack detection has
not been checked against a real instrument yet, and false attacks would be
punished unfairly.

Verified: 39 tests pass (6 new for difficulty); browser self-test on Hard
scored 100% with the simulated player.

## 2026-10-12 - Separate timing and pitch feedback (v0.3.0)

User feedback: the single color per notehead did not say what to improve.

- Noteheads are no longer colored. Two lanes under each staff carry one marker
  per note: timing (bar left of the tick is early, right is late) and pitch
  (bar above the line is sharp, below is flat, a red note name is the wrong
  note that was played). Markers are HTML elements positioned over the SVG.
- Wrong notes now carry their timing too, so a wrong note played on time shows
  good timing and bad pitch.
- The live readout next to Start is split into Timing and Pitch.
- The result panel shows a timing percentage (average timing score of the
  notes with the right pitch) and a pitch percentage (share of notes with the
  right pitch), early and late counts, and one line of advice on what to
  focus on. The overall score formula is unchanged.
- Added a second simulated input, "Simulated player with mistakes", with a
  fixed pattern of early, late, out-of-tune, wrong, and skipped notes. It
  doubles as a demo of the feedback and as the way to check the error
  markers without a microphone.
- First attempt used 8 px dots displaced from the tick; too subtle on screen,
  and a CSS specificity slip hid the wrong-note names. Replaced with bars that
  grow from the tick.
- README rewritten for a public audience; screenshot in docs/.

Verified: 41 tests pass; browser run with the sloppy simulated player showed
early, late, sharp, wrong-note, and skipped markers as expected.

## 2026-10-12 - License

Added the MIT License at the owner's request (LICENSE, README section,
package.json field).

## 2026-10-13 - Song collections and typed tempo (v0.4.0)

- Songs are organized into collections. Chose fixed collections over
  user-made playlists: each song has one `group`, the song menu shows a
  labeled section per collection (`GROUPS` sets the order). Playlists need an
  editor, ordering, and storage for a library of a dozen songs; they can be
  layered on later without changing this. "Album" was rejected as a name
  because it implies a published release.
- Tempo can be typed into a number box next to the slider. Range widened from
  40-200 to 30-240 bpm. The slider applies while dragging; the box applies on
  Enter or blur, rounds to a whole number, clamps to the range, and keeps the
  current tempo if emptied.

Verified: 42 tests pass (1 new: every song is in exactly one known
collection). Browser: three sections in the song menu (1 / 9 / 2 songs);
typing 137, 999, 5, an empty value, and 92.6 gave 137, 240, 30, unchanged,
and 93, with slider and saved setting in step; changing song loads its
default tempo into both controls.

## 2026-10-15 - Competition mode and high scores (v0.5.0)

Agreed with the owner before building:

- Two modes. Free play is the app as it was. Competition fixes settings so
  scores can be ranked.
- Competition: key fixed to C major (every song is written in C), range fixed
  to the instrument's default placement, metronome on, guide melody off (it
  plays the answer, and a microphone would hear it). Tempo is Slow, Medium,
  or Fast at 75%, 100%, and 125% of the song's own tempo, relative so slow
  and quick songs are treated alike. Difficulty stays as implemented. Device,
  channel, gate, and latency stay open: they are equipment, not skill.
- One table per song, across instruments, difficulties, and tempos, so the
  score has to reward harder settings: points = accuracy x 10 x difficulty
  (0.8 / 1 / 1.25) x tempo (0.8 / 1 / 1.25). Top 10 only; a tie ranks below
  the existing row.
- Name box after a qualifying run, prefilled with the last name used and
  editable; a run that misses the top 10 is not kept.
- Tables stay in localStorage, as before. Free-play best scores are left as
  they were and not copied into the competition tables.
- 5-string bass removed. A saved setting that points at it falls back to the
  first instrument.
- The simulated players stay (they are the browser self-test and the demo).
  They can run in competition but cannot enter the tables.

Implementation: `src/game/competition.ts` has the tempo levels and points;
`src/storage.ts` has the table (pure `rankFor` and `insertScore`, tested, plus
load/save). In `main.ts`, `playKey`, `playBpm`, `playMetronome`, and
`playGuide` return the value in force, so the free-play settings survive a
switch to competition and back. Fixed controls are disabled and show the
fixed value.

Found while testing: saved settings can name a song that no longer exists
(the browser pane had one from an earlier build). The page fell back to the
first song but the score was filed under the missing id. The song id is now
normalized at startup, like the instrument. Also, on a phone the score table
widened the whole page; the panel now has `min-width: 0` and the table
scrolls inside it.

Verified: typecheck clean; 43 tests pass (4 new for points, tempo, and the
table; the per-instrument tracker tests drop by 3 with the 5-string bass).
Browser checks in test-artifacts/TEST_REPORT.md.

## 2026-10-15 - Jazz blues walking bass (v0.6.0)

Added a "Jazz" collection with one exercise: a 12-bar jazz blues walking
bass line in quarter notes, written in C like every song, with a final bar
on the tonic so the exercise resolves (13 bars). Changes:
C7 | F7 | C7 | Gm7 C7 | F7 | Fm7 Bb7 | C7 | A7 | Dm7 | G7 | C7 A7 | Dm7 G7.
Chord tones on the beat; beat 4 leads by step or half step into the next
root. 100 bpm by default.

Spelling: songs are transposed letter by letter, so a chromatic note
written in C picks up a double accidental in keys that already alter that
letter. Approach notes were chosen as flats from the chords (Bb, Eb, Ab)
rather than passing Gb, Db, or sharps; the only double flat left is the
minor third of the iv minor chord in Db (Bbb in Gbm7), which is the correct
spelling. Range is A2 to Bb3 as written, 13 semitones, so it fits both
instruments in every key.

No chord symbols over the staff yet; the format has no place for them.

Verified: 44 tests pass (new end-to-end grading case for the line on
4-string bass at 120 bpm in G). Browser: new "Jazz" section in the song
menu; rendered in C and Db with the expected accidentals; four bars per
line at desktop width.

## 2026-10-16 - Ties, pickups, and traditional jazz tunes (v0.7.0)

Asked for beginner jazz heads. Most of them (Autumn Leaves, Blue Bossa,
Summertime, C Jam Blues) are under copyright and the repo is public, so the
owner chose from public-domain tunes. First round: four tunes that are free
worldwide and need only ties and pickups, not swing.

Format:
- Ties: a token ending in `~` is tied to the next note. The arranger plays
  and grades a tied chain as one note: the first note gets the whole length
  (`held`), the continuations are drawn but get no target or lane marker.
  Ties that cross to a new line are drawn as two halves.
- Pickups: `pickup` is the first bar's length in quarters. The arranger
  starts the song at `leadIn` = bar - pickup, so the metronome clicks the
  silent beats and bar 2 falls on a downbeat.
- `key`: the key a song is usually played in. Choosing a song loads it (like
  the tempo), and competition now uses it instead of C. Existing songs have
  no key, so they stay in C.

Tunes (melodies looked up rather than written from memory, each
cross-checked against a second source, syncopations straightened):
- When the Saints Go Marching In, F, pickup of 3. De/fr/nl Wikipedia ABC,
  checked against the singing-bell.com lead sheet.
- Down by the Riverside, F, pickup of 3. Verse and chorus with its final
  ending. free-notes.net lead sheet, checked against German Wikibooks ABC.
  The sources differ in a few notes; this follows free-notes.
- Careless Love, F. free-notes.net, checked against bushbanjo.net. Keeps the
  free-notes chromatic Ab and Eb.
- Just a Closer Walk with Thee, Bb (C is also common), one tie. Two hymnary.org
  MusicXML files that agree on every pitch. Hymnary lists the tune as
  anonymous and public domain; only Kenneth Morris's 1940 arrangement and a
  1948 edition were copyrighted, and they are not used here.
Keys from trad jazz charts on the iReal Pro forum (all in F for the first
three; Bb and C split for Closer Walk).

Verified: 50 tests pass (new: tie and pickup arrangement, ties join equal
pitches, every home key is known, end-to-end grading of Saints on bass and
Closer Walk on guitar). Browser: pickup bar and tie drawn; choosing a song
loads its key and tempo; simulated run of Saints scored 100% with every note
on time, so the pickup lines up with the clicks.
