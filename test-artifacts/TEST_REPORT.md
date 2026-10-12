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
