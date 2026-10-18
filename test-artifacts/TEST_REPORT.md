# Test report - v0.1.0 (2026-10-12)

## Automated

`docker compose --profile dev run --rm dev npm test`: 3 files, 33 tests, all passed.
`npm run build` (type check plus production build): passed.

## Browser, simulated player

| # | Case | Result |
| --- | --- | --- |
| 1 | Load, render | Pass. No console errors. |
| 2 | Hot Cross Buns, bass 4, C, 80 bpm | Pass. 17 / 17 Perfect, score 100%, grade S. |
| 3 | Row, Row, Row Your Boat, guitar, F#, 60 bpm | Pass. 27 / 27 Perfect, score 100%, average pitch error 1 cent. |
| 4 | Narrow viewport | Pass. One bar per line at 429 px; four per line at 1100 px. |
| 5 | Real device with microphone blocked | Pass. Status shows "Microphone permission was denied. Allow it in the browser and try again." |

## Production image

Pass. Image builds; `/`, the JS bundle, and the CSS return 200 on port 8080.

## Not run

Real instrument through an audio interface. The browser pane used for testing
blocks microphone access, and no instrument was available to the test. The
wrong-note and missed-note colors were therefore exercised only through the
grader unit tests, not on screen.

# Test report - v0.2.0, difficulty levels (2026-10-12)

Automated: 3 files, 39 tests, all passed. New cases: same timing graded
Perfect on Easy, Good on Normal, Early or late on Hard; octave-off notes hit
only on Easy; 40 cents sharp is a hit on Normal and wrong on Hard; sustain
weight 0 / 20 / 30%; narrower hit window on Hard; unknown level falls back to
Normal.

Browser, simulated player: Row, Row, Row Your Boat, guitar, F# major, Hard:
27 / 27 Perfect, "100% on Hard". The rule summary under the setup panel
changes with the selected level. No console errors.

Not run: real instrument, as before.

# Test report - v0.3.0, separate timing and pitch feedback (2026-10-12)

Automated: 3 files, 41 tests, all passed. New cases: wrong notes carry their
own timing; pitch percentage, timing percentage, and early/late counts in the
summary; clean and silent runs.

Browser, "Simulated player with mistakes", Hot Cross Buns, bass 4, C, Normal,
1100 px wide:

| Check | Result |
| --- | --- |
| Timing lane: on-time dot, early bar to the left, late bar to the right | Pass |
| Pitch lane: in-tune dot, sharp bar above the line | Pass |
| Wrong notes show the played note name in red (C#, D, E) with their own timing | Pass |
| Skipped note shows x in the timing lane and nothing in the pitch lane | Pass |
| Tooltips give ms and cents ("123 ms late", "Played D2, expected C2 (too high)") | Pass |
| Live readout shows Timing and Pitch separately | Pass ("On time (+3 ms)" / "D2 played, C2 expected") |
| Result panel: Timing 93%, Pitch 76%, counts, advice "Focus on pitch..." | Pass |
| Console errors | None |

Not run: real instrument; narrow viewport with the new lanes.

# Test report - v0.4.0, song collections and typed tempo (2026-10-13)

Automated: 3 files, 42 tests, all passed.

Browser (dev server):

| Check | Result |
| --- | --- |
| Song menu has sections Warm-ups (1), Nursery rhymes (9), Classical and holiday (2) | Pass |
| Typing 137 in the tempo box sets slider and saved tempo to 137 | Pass |
| 999 clamps to 240; 5 clamps to 30; 92.6 rounds to 93 | Pass |
| Emptying the box keeps the current tempo | Pass (after fix; first version fell to 30) |
| Dragging the slider updates the box | Pass |
| Changing song loads its default tempo into both controls | Pass |
| Console errors | None |

# Test report - v0.5.0, competition mode and high scores (2026-10-15)

Automated: 4 files, 43 tests, all passed. New: tempo levels and rounding,
points for each multiplier, tie ranking, top-10 trimming.

Browser (dev server, Chromium). To exercise saving without an instrument, the
simulated-player block on saving was disabled locally for the test and
restored before the commit.

| Check | Result |
| --- | --- |
| Competition: key shows C major and is disabled; range disabled; metronome on and disabled; guide off and disabled | Pass |
| Tempo slider replaced by Slow / Medium / Fast; Fast on Major Scale (70 bpm) plays at 88 bpm | Pass |
| Result shows points (947 for 75.75% on Normal, Fast) and the accuracy line | Pass |
| Simulated run (block in place): "Simulated runs are not entered in the high scores." | Pass |
| Qualifying run: name box focused; Enter with an empty name saves nothing | Pass |
| Saved name is prefilled and selected on the next run; editing it saves the new name | Pass ("Tee", then "Sam") |
| Equal points rank below the existing row; new row highlighted | Pass (saved as number 2) |
| Full table (10 seeded rows): "Not in the top 10. Number 10 has 1410 points.", table shown | Pass |
| Back to Free play: key, range, tempo (200 bpm), and guide restored and enabled; results hidden | Pass |
| Instrument menu has Guitar and Bass (4-string) only | Pass |
| Saved settings with a song id that no longer exists: score filed under the song shown | Fail, fixed, Pass |
| 375 px wide with the score table open: no horizontal page scroll, table scrolls in its panel | Fail, fixed, Pass |
| Console errors | None |

Not run: real instrument; Safari and Firefox.

# Test report - v0.6.0, jazz blues walking bass (2026-10-15)

Automated: 4 files, 44 tests, all passed. New: end-to-end grading of the
walking line on 4-string bass; the existing tests confirm every bar is full
and the line fits both instruments in all 12 keys.

Browser (dev server):

| Check | Result |
| --- | --- |
| Song menu has a Jazz section with one song | Pass |
| C major, bass: four bars per line, flats only on Eb, Ab, Bb | Pass |
| Db major: Fb, Cb, and Bbb where the chords call for them, no double sharps | Pass |
| Console errors | None |

Not run: playing the line on a real bass.

# Test report - v0.7.0, ties, pickups, and traditional jazz tunes (2026-10-16)

Automated: 4 files, 50 tests, all passed.

Browser (dev server):

| Check | Result |
| --- | --- |
| Choosing Just a Closer Walk with Thee loads Bb and 70 bpm | Pass |
| Choosing When the Saints Go Marching In loads F | Pass |
| Tie drawn in bar 6 of Closer Walk; no timing or pitch marker under the held half | Pass |
| Saints: 3-beat pickup bar drawn with the time signature | Pass |
| Saints, simulated player, 160 bpm: 31 of 31 notes on time, 100% | Pass |
| Console errors | None |

Not run: the tunes on a real instrument; a tie across a line break (none of
the current songs has one at desktop width; covered by code path only).

# Test report - v0.8.0, arpeggio exercises and chord symbols (2026-10-17)

Automated: 4 files, 57 tests, all passed.

Browser (dev server):

| Check | Result |
| --- | --- |
| Arpeggios section lists six exercises | Pass |
| Autumn Leaves, bass, Bb: Cm7 from C2, F7 from F1, Bbmaj7 from Bb1, Ebmaj7 from Eb2 | Pass |
| Two-bar Gm7: up G-Bb-D-F, then down G-F-D-Bb | Pass |
| Chord symbols above each bar, transposed (Am7b5 shown as Am7 with a flat 5) | Pass |
| Range menu shows one placement (F1 to D3) | Pass |
| Rhythm changes: two chords per bar as eighths | Pass |
| Console errors | None |

Not run: real instrument.

# Test report - v0.9.0, a few usual keys per song (2026-10-17)

Automated: 4 files, 58 tests, all passed.

Browser (dev server):

| Check | Result |
| --- | --- |
| Autumn Leaves key menu: G minor, E minor; sheet header follows the choice | Pass |
| Minor blues: C minor, F minor, G minor | Pass |
| Twinkle: C, G, F, D major; a saved key it does not offer falls back to C | Pass |
| Saints: F, Bb, C major | Pass |
| Competition: key disabled on the song's first key | Pass |
| Console errors | None |

# Test report - v0.10.0, arpeggio A sections (2026-10-17)

Automated: 4 files, 59 tests, all passed.

Browser (dev server): rhythm changes (A section), bass, Bb: 8 bars on two
lines; shared bars play root and third of each chord in quarters; final
bar holds Bb; 15 chord symbols in place; no console errors. Pass.

# Test report - v0.11.0, nearest arpeggio roots (2026-10-17)

Automated: 4 files, 61 tests, all passed. Root sequences printed for all six
exercises on bass and guitar in their usual keys: moves of a fifth or less
apart from drops forced by the top of the instrument; Ebmaj7-Edim7 is a half
step on both instruments. Every note within each instrument's range in every
offered key.

# Test report - v0.12.0, MusicXML import and export (2026-10-18)

Automated: 5 files, 89 tests, all passed (tests/musicxml.test.ts runs in
jsdom).

Browser (dev server; files handed to the import input by script, exports
captured in the page instead of downloaded):

| Check | Result |
| --- | --- |
| Export Saints: MusicXML file named when-the-saints-go-marching-in.musicxml, message shown | Pass |
| Import it retitled: listed under My songs, F major, 12 keys offered, Delete shown | Pass |
| Import again with tempo 120: "Replaced ...", still one song, tempo 120 | Pass |
| File with a repeat and a grace note: rejected, "Bar 2: repeat signs..." and "Bar 8: grace notes..." | Pass |
| Reload: imported song still there and rendered | Pass |
| Imported blues: chord symbols shown in F | Pass |
| Delete: song gone, storage empty, back to the first song | Pass |
| Console errors | None |

Not run: files saved by MuseScore, Sibelius, Finale, or Dorico.
