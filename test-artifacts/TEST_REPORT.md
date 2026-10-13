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
