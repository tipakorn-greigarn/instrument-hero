# Test plan - v0.1.0

## Automated (vitest, run in Docker)

| Area | What is checked |
| --- | --- |
| Theory | MIDI conversion; spelling after transposition; all scale degrees diatonic in all 12 keys |
| Songs | Every bar is exactly full; ids unique |
| Arranger | Every song fits every instrument in every key; written pitch is an octave above sounding for guitar and bass |
| Pitch detector | Pure and harmonic tones (including weak fundamental) from E1 to C6 within 5 cents; silence gives no pitch |
| Note tracker | Every note across each instrument's range found once with correct pitch and attack time within 30 ms, at 44.1, 48, and 96 kHz; repeated same-pitch notes; legato pitch changes only in legato mode; silence |
| Grader | Perfect run scores 100; good, late, wrong, and missed verdicts; wrong octave is wrong; time offset; live resolution order; short notes lose sustain points; letter grades |
| End to end | Four synthesized song performances (bass 4, bass 5, guitar; 4/4 and 6/8) graded with no wrong, missed, or late notes |

## Browser (Chromium, dev server, simulated player input)

1. Page loads without console errors; sheet renders with clef, key signature, time signature.
2. Hot Cross Buns, 4-string bass, C major, 80 bpm: Start, count-in shows, cursor moves, notes turn green as they are played, result panel appears.
3. Row, Row, Row Your Boat, guitar, F# major (6/8, six sharps): same as above.
4. Narrow viewport (about 430 px): sheet reflows to one bar per line.
5. Start with a real input device when microphone access is blocked: readable error, no crash.

## Production image

Build the nginx image, start it, and fetch the page and its assets.

## Manual, requires hardware (not run)

Real guitar and bass through an audio interface: device and channel selection, level meter, tuner readout, grading of a deliberately clean run, a run with wrong notes, and a run played late.
