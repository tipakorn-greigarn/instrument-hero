// Monophonic pitch detection using the McLeod Pitch Method (normalized
// square difference function with parabolic peak interpolation).

export interface PitchResult {
  freq: number;
  /** 0-1; how periodic the signal is at the detected period. */
  clarity: number;
}

/** Fraction of the highest NSDF peak a peak must reach to be chosen. */
const PEAK_THRESHOLD = 0.93;

export class PitchDetector {
  private readonly nsdf: Float32Array;
  private readonly prefix: Float64Array;
  private readonly minLag: number;
  private readonly maxLag: number;

  constructor(
    private readonly sampleRate: number,
    readonly size: number,
    minFreq: number,
    maxFreq: number,
  ) {
    this.maxLag = Math.min(size - 2, Math.ceil(sampleRate / minFreq) + 1);
    this.minLag = Math.max(2, Math.floor(sampleRate / maxFreq));
    this.nsdf = new Float32Array(this.maxLag + 2);
    this.prefix = new Float64Array(size + 1);
  }

  detect(x: Float32Array): PitchResult | null {
    const n = this.size;
    const { nsdf, prefix, maxLag, minLag } = this;
    for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + x[i] * x[i];
    if (prefix[n] <= 0) return null;

    for (let tau = 0; tau <= maxLag + 1; tau++) {
      let acf = 0;
      const limit = n - tau;
      for (let j = 0; j < limit; j++) acf += x[j] * x[j + tau];
      const m = prefix[limit] + (prefix[n] - prefix[tau]);
      nsdf[tau] = m > 0 ? (2 * acf) / m : 0;
    }

    // Collect the maximum of each positive lobe after the first zero crossing.
    let tau = 1;
    while (tau <= maxLag && nsdf[tau] > 0) tau++;
    // Peaks are compared by their interpolated height: at short periods the
    // true peak can fall between two lags and look lower than it is.
    let best = 0;
    const peaks: PitchResult[] = [];
    while (tau <= maxLag) {
      while (tau <= maxLag && nsdf[tau] <= 0) tau++;
      let peak = -1;
      while (tau <= maxLag && nsdf[tau] > 0) {
        if (nsdf[tau] > nsdf[tau - 1] && nsdf[tau] >= nsdf[tau + 1] && (peak < 0 || nsdf[tau] > nsdf[peak])) {
          peak = tau;
        }
        tau++;
      }
      if (peak < minLag) continue;
      const a = nsdf[peak - 1];
      const b = nsdf[peak];
      const c = nsdf[peak + 1];
      const denom = a - 2 * b + c;
      const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
      const clarity = Math.min(1, b - 0.25 * (a - c) * shift);
      peaks.push({ freq: this.sampleRate / (peak + shift), clarity });
      if (clarity > best) best = clarity;
    }

    const threshold = best * PEAK_THRESHOLD;
    return peaks.find((p) => p.clarity >= threshold) ?? null;
  }
}

/** Downsample by averaging groups of `factor` samples, taking the tail of `src`. */
export function decimateTail(src: Float32Array, factor: number, out: Float32Array): void {
  const start = src.length - out.length * factor;
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    const base = start + i * factor;
    for (let k = 0; k < factor; k++) sum += src[base + k];
    out[i] = sum / factor;
  }
}
