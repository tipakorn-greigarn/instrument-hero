// Web Audio plumbing: input device capture, the analysis tap, the metronome
// click, and a simple synth used for the guide melody and the simulated player.

import { midiToFreq } from '../music/theory';

export type Channel = 'mix' | 'left' | 'right';

export interface ScheduledNote {
  /** Start time on the AudioContext clock. */
  time: number;
  dur: number;
  midi: number;
}

const ANALYSIS_SAMPLES = 16384;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser!: AnalyserNode;
  /** Everything to be analyzed is summed here. */
  private inputBus!: GainNode;
  private outputBus!: GainNode;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private splitter: ChannelSplitterNode | null = null;
  private voices: AudioScheduledSourceNode[] = [];
  private runBus: GainNode | null = null;
  private readonly buffer = new Float32Array(ANALYSIS_SAMPLES);

  /** Creates the context on first use. Must first be called from a user gesture. */
  async resume(): Promise<AudioContext> {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.inputBus = ctx.createGain();
      this.inputBus.channelCount = 1;
      this.inputBus.channelCountMode = 'explicit';
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = ANALYSIS_SAMPLES;
      this.inputBus.connect(this.analyser);
      // Keep the analysis branch pulled without making the input audible.
      const mute = ctx.createGain();
      mute.gain.value = 0;
      this.analyser.connect(mute).connect(ctx.destination);
      this.outputBus = ctx.createGain();
      this.outputBus.connect(ctx.destination);
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
    return this.ctx;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  get now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  get sampleRate(): number {
    return this.ctx ? this.ctx.sampleRate : 48000;
  }

  get hasInput(): boolean {
    return this.stream !== null;
  }

  /** Delay between scheduling a sound and hearing it, in seconds. */
  get outputLatency(): number {
    if (!this.ctx) return 0;
    return (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
  }

  /** Capture delay reported by the input device, in seconds (0 if unknown). */
  get inputLatency(): number {
    const track = this.stream?.getAudioTracks()[0];
    const settings = track?.getSettings() as (MediaTrackSettings & { latency?: number }) | undefined;
    return settings?.latency ?? 0;
  }

  async listInputs(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'audioinput');
  }

  /**
   * Open an input device. Browser voice processing is switched off: echo
   * cancellation, noise suppression, and auto gain all damage instrument
   * signals.
   */
  async openInput(deviceId: string, channel: Channel): Promise<string> {
    const ctx = await this.resume();
    this.closeInput();
    const audio: MediaTrackConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: { ideal: 2 },
    };
    if (deviceId) audio.deviceId = { exact: deviceId };
    this.stream = await navigator.mediaDevices.getUserMedia({ audio });
    this.source = ctx.createMediaStreamSource(this.stream);
    this.setChannel(channel);
    return this.stream.getAudioTracks()[0]?.getSettings().deviceId ?? deviceId;
  }

  /** Choose which input of a two-channel interface is analyzed. */
  setChannel(channel: Channel): void {
    if (!this.ctx || !this.source) return;
    this.source.disconnect();
    this.splitter?.disconnect();
    this.splitter = null;
    if (channel === 'mix') {
      this.source.connect(this.inputBus);
    } else {
      this.splitter = this.ctx.createChannelSplitter(2);
      this.source.connect(this.splitter);
      this.splitter.connect(this.inputBus, channel === 'left' ? 0 : 1);
    }
  }

  closeInput(): void {
    this.source?.disconnect();
    this.splitter?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.source = null;
    this.splitter = null;
    this.stream = null;
  }

  /** The most recent input samples; the last one was captured about now. */
  read(): Float32Array {
    if (this.ctx) this.analyser.getFloatTimeDomainData(this.buffer);
    return this.buffer;
  }

  private bus(): GainNode {
    if (!this.runBus) {
      this.runBus = this.ctx!.createGain();
    }
    return this.runBus;
  }

  private track(node: AudioScheduledSourceNode): void {
    this.voices.push(node);
  }

  /** Schedule a metronome click on the output. */
  click(time: number, accent: boolean, volume: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? 1568 : 1047;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.connect(gain).connect(this.outputBus);
    osc.start(time);
    osc.stop(time + 0.06);
    this.track(osc);
  }

  /**
   * Schedule plucked-sounding notes. `audible` sends them to the speakers,
   * `analyzed` feeds them to the pitch tracker in place of an instrument.
   */
  playNotes(notes: ScheduledNote[], opts: { audible: number; analyzed: boolean }): void {
    const ctx = this.ctx!;
    const bus = this.bus();
    const out = ctx.createGain();
    out.gain.value = opts.audible;
    bus.connect(out).connect(this.outputBus);
    if (opts.analyzed) bus.connect(this.inputBus);
    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = midiToFreq(note.midi);
      const end = note.time + note.dur;
      gain.gain.setValueAtTime(0, note.time);
      gain.gain.linearRampToValueAtTime(0.5, note.time + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.12, Math.max(note.time + 0.01, end - 0.03));
      gain.gain.linearRampToValueAtTime(0, end - 0.005);
      osc.connect(gain).connect(bus);
      osc.start(note.time);
      osc.stop(end);
      this.track(osc);
    }
  }

  /** Silence and discard everything scheduled by click() and playNotes(). */
  stopScheduled(): void {
    for (const voice of this.voices) {
      try {
        voice.stop();
      } catch {
        // Already stopped.
      }
      voice.disconnect();
    }
    this.voices = [];
    this.runBus?.disconnect();
    this.runBus = null;
  }
}
