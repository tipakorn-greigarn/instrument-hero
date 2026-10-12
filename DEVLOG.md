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
