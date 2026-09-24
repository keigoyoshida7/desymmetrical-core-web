import { clamp } from "./analysis.js";
import { createCoreSpeakers } from "./core-layout.js";
const bounded = (value, minimum, maximum, fallback) =>
  clamp(Number.isFinite(value) ? value : fallback, minimum, maximum);
const CORE_SPEAKERS = createCoreSpeakers();

// The original sine lookup is retained, including its size and interpolation.
const TABLE_SIZE = 8192;
const SINE = new Float32Array(TABLE_SIZE + 1);
for (let i = 0; i <= TABLE_SIZE; i++)
  SINE[i] = Math.sin((2 * Math.PI * i) / TABLE_SIZE);

export const WAVEFORMS = Object.freeze([
  "sine", "square", "sawtooth", "triangle", "noise",
]);
export const CORE_OUTPUT_CHANNELS = 18;
const VOICES = 257;
const SHAPE_SIZE = 2048;
const HARMONICS = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512];

// Additive tables contain only the stated harmonics. Lookup selects and blends
// tables whose highest partial stays below 0.45 * sampleRate, including for
// square/sawtooth fundamentals near Nyquist. No raw discontinuous oscillator is used.
function makePeriodicTables() {
  const sums = Array.from({ length: 3 }, () => new Float64Array(SHAPE_SIZE + 1));
  const tables = [[], [], []];
  for (let harmonic = 1; harmonic <= HARMONICS.at(-1); harmonic++) {
    for (let j = 0; j < SHAPE_SIZE; j++) {
      const partial = Math.sin((2 * Math.PI * harmonic * j) / SHAPE_SIZE);
      sums[1][j] += ((harmonic % 2 ? 1 : -1) * 2 * partial) / (Math.PI * harmonic);
      if (harmonic % 2) {
        sums[0][j] += (4 * partial) / (Math.PI * harmonic);
        sums[2][j] +=
          ((harmonic % 4 === 1 ? 1 : -1) * 8 * partial) /
          (Math.PI * Math.PI * harmonic * harmonic);
      }
    }
    if (HARMONICS.includes(harmonic)) {
      for (let shape = 0; shape < 3; shape++) {
        const table = new Float32Array(sums[shape]);
        // Keep each oscillator peak at or below unity, including Gibbs peaks.
        let peak = 0;
        for (let j = 0; j < SHAPE_SIZE; j++) peak = Math.max(peak, Math.abs(table[j]));
        for (let j = 0; j < SHAPE_SIZE; j++) table[j] /= peak || 1;
        table[SHAPE_SIZE] = table[0];
        tables[shape].push(table);
      }
    }
  }
  return tables;
}
const PERIODIC = makePeriodicTables();

function lookup(table, position) {
  const index = Math.floor(position);
  return table[index] + (table[index + 1] - table[index]) * (position - index);
}
function tableBand(frequency, sampleRate) {
  const allowed = (sampleRate * 0.45) / frequency;
  let upper = 0;
  while (upper + 1 < HARMONICS.length && HARMONICS[upper + 1] <= allowed) upper++;
  return {
    lower: Math.max(0, upper - 1),
    upper,
    mix: upper === 0 ? 1 : clamp(allowed / HARMONICS[upper] - 1),
  };
}
function periodicSample(shape, phase, band) {
  if (shape === 0) return lookup(SINE, phase);
  const position = (phase * SHAPE_SIZE) / TABLE_SIZE;
  const tables = PERIODIC[shape - 1];
  const low = lookup(tables[band.lower], position);
  return low + (lookup(tables[band.upper], position) - low) * band.mix;
}
function pulseAt(phase, width, rate) {
  if (width >= 1) return 1;
  if (width <= 0 || phase >= width) return 0;
  const edge = Math.min(width * 0.25, rate * 0.008);
  const distance = Math.min(phase, width - phase);
  return distance >= edge ? 1 : 0.5 - 0.5 * Math.cos((Math.PI * distance) / edge);
}
function fallbackSpeaker(index, mainChannels) {
  // Match the provisional Core layout; calibrated positions take precedence.
  if (mainChannels === 17) return CORE_SPEAKERS[index];
  const angle = (index / mainChannels) * Math.PI * 2;
  return { x: Math.cos(angle) * 1.2, y: Math.sin(angle) * 1.2, z: 1.5 };
}

export class SynthCore {
  constructor(sampleRate = 48000, channels = 2) {
    this.sampleRate = bounded(sampleRate, 1000, 384000, 48000);
    this.channels = Math.round(bounded(channels, 1, 32, 2));
    this.phase = new Float64Array(VOICES);
    this.frequency = new Float64Array(VOICES);
    this.tableBands = Array.from({ length: VOICES }, () => ({ lower: 0, upper: 0, mix: 1 }));
    this.gain = new Float32Array(VOICES);
    this.targets = new Float32Array(VOICES);
    this.pan = new Float32Array(VOICES).fill(0.5);
    this.spread = new Float32Array(VOICES);
    this.routes = Array.from({ length: VOICES }, () => new Float32Array(this.channels));
    this.targetRoutes = Array.from({ length: VOICES }, () => new Float32Array(this.channels));
    this.reverb = new Float32Array(VOICES);
    this.waveforms = new Uint8Array(VOICES);
    this.waveMix = Array.from({ length: VOICES }, () => new Float32Array([1, 0, 0, 0, 0]));
    this.pulse = new Uint8Array(VOICES);
    this.pulseMix = new Float32Array(VOICES);
    this.pulsePhase = new Float64Array(VOICES);
    this.pulseRate = new Float32Array(VOICES).fill(2);
    this.pulseWidth = new Float32Array(VOICES).fill(0.35);
    this.phaseOffset = new Float32Array(VOICES);
    this.pulseEnvelope = new Float32Array(VOICES);
    this.noiseState = Uint32Array.from({ length: VOICES }, (_, i) => (67 + i * 104729) >>> 0);
    this.noiseZ1 = new Float64Array(VOICES);
    this.noiseZ2 = new Float64Array(VOICES);
    this.noiseCoefficients = Array.from({ length: VOICES }, () => new Float64Array(3));
    this.currentSample = 0;
    this.lastUpdate = -Infinity;
    this.master = 0;
    this.targetMaster = 0.2;
  }

  update(sources, volume = 0.2, speakers = []) {
    this.targets.fill(0);
    for (const s of Array.isArray(sources) ? sources : []) {
      if (!s || !Number.isInteger(s.id)) continue;
      const i = s.id - 1;
      if (
        i < 0 || i >= VOICES ||
        !["frequency", "gain", "x", "y", "z", "spread", "reverb"].every((k) => Number.isFinite(s[k]))
      ) continue;
      this.frequency[i] = clamp(s.frequency, 20, Math.min(16000, this.sampleRate * 0.45));
      this.tableBands[i] = tableBand(this.frequency[i], this.sampleRate);
      this.targets[i] = clamp(s.gain, 0, 0.65);
      this.reverb[i] = clamp(s.reverb);
      const waveform = WAVEFORMS.indexOf(s.waveform ?? "sine");
      this.waveforms[i] = waveform < 0 ? 0 : waveform;
      this.pulse[i] = s.organization === "pulse" ? 1 : 0;
      this.pulseRate[i] = bounded(s.pulseRate, 0.05, 40, 2);
      this.pulseWidth[i] = bounded(s.pulseWidth, 0, 1, 0.35);
      this.phaseOffset[i] = bounded(s.phaseOffset, 0, 1, 0);
      const omega = (2 * Math.PI * this.frequency[i]) / this.sampleRate;
      const alpha = Math.sin(omega) / (2 * bounded(s.noiseQ, 0.2, 12, 0.8));
      // Constant-peak band-pass: frequency is the noise band's center, not a pitch.
      this.noiseCoefficients[i].set([
        alpha / (1 + alpha),
        (-2 * Math.cos(omega)) / (1 + alpha),
        (1 - alpha) / (1 + alpha),
      ]);
      // Core's provisional room is 7 m wide; retain continuous stereo position
      // across that full extent instead of saturating at the legacy 2.4 m width.
      const p = clamp((s.x / 7) * (1 - clamp(s.spread) * 0.7) + 0.5);
      this.pan[i] = p;
      this.spread[i] = clamp(s.spread);
      const r = this.targetRoutes[i];
      r.fill(0);
      if (this.channels === 2) {
        r[0] = Math.cos((p * Math.PI) / 2);
        r[1] = Math.sin((p * Math.PI) / 2);
      } else {
        const mainChannels = this.channels > 1 ? this.channels - 1 : 1;
        let norm = 0;
        for (let c = 0; c < mainChannels; c++) {
          const candidate = speakers?.[c];
          const sp = candidate && [candidate.x, candidate.y, candidate.z].every(Number.isFinite)
            ? candidate : fallbackSpeaker(c, mainChannels);
          const d = Math.hypot(s.x - sp.x, s.y - sp.y, s.z - sp.z);
          r[c] = (1 - this.spread[i]) / (0.2 + d * d) + this.spread[i] * 0.25;
          norm += r[c] * r[c];
        }
        norm = Math.sqrt(norm) || 1;
        for (let c = 0; c < mainChannels; c++) r[c] /= norm;
        // Sub is always the final output (18 for Core's 16 walls + arm + sub).
        // The output graph also low-passes it, so bright waves send no HF to it.
        if (this.channels > 1) r[this.channels - 1] = s.frequency < 100 ? 0.65 : 0;
      }
    }
    this.targetMaster = bounded(volume, 0, 0.8, 0);
    this.lastUpdate = this.currentSample;
  }

  render(outputs, wet = null) {
    if (!outputs?.length || !outputs[0]?.length) return;
    const n = outputs[0].length;
    for (const channel of outputs) channel.fill(0);
    if (wet) for (const channel of wet) channel.fill(0);
    const alpha = 1 - Math.exp(-1 / (this.sampleRate * 0.035));
    const timbreAlpha = 1 - Math.exp(-1 / (this.sampleRate * 0.02));
    const envelopeAlpha = 1 - Math.exp(-1 / (this.sampleRate * 0.002));
    for (let i = 0; i < VOICES; i++) {
      let g = this.gain[i];
      if (g < 1e-7 && (this.targets[i] === 0 || this.currentSample - this.lastUpdate >= this.sampleRate * 1.5)) continue;
      let phase = this.phase[i];
      let pulsePhase = this.pulsePhase[i];
      let envelope = this.pulseEnvelope[i];
      let pulseMix = this.pulseMix[i];
      const step = (this.frequency[i] * TABLE_SIZE) / this.sampleRate;
      const band = this.tableBands[i];
      const weights = this.waveMix[i];
      const r = this.routes[i], rt = this.targetRoutes[i];
      const noise = this.noiseCoefficients[i];
      for (let c = 0; c < this.channels; c++) r[c] += (rt[c] - r[c]) * 0.18;
      for (let j = 0; j < n; j++) {
        const fresh = this.currentSample + j - this.lastUpdate < this.sampleRate * 1.5;
        g += ((fresh ? this.targets[i] : 0) - g) * alpha;
        pulseMix += (this.pulse[i] - pulseMix) * timbreAlpha;
        const pulsePosition = (pulsePhase + this.phaseOffset[i]) % 1;
        envelope += (pulseAt(pulsePosition, this.pulseWidth[i], this.pulseRate[i]) - envelope) * envelopeAlpha;
        const amplitude = g * (1 + (envelope - 1) * pulseMix);
        let value = 0, rightValue = 0;
        const stereoSpread = this.channels === 2 && this.spread[i] > 0.001;
        const otherPhase = (phase + TABLE_SIZE * (1 + this.spread[i] * 0.18 * (i % 2 ? 1 : -1))) % TABLE_SIZE;
        for (let shape = 0; shape < WAVEFORMS.length; shape++) {
          weights[shape] += ((this.waveforms[i] === shape ? 1 : 0) - weights[shape]) * timbreAlpha;
          if (weights[shape] < 1e-7) continue;
          let sample;
          if (shape === 4) {
            const state = (Math.imul(this.noiseState[i], 1664525) + 1013904223) >>> 0;
            this.noiseState[i] = state;
            const white = (state / 4294967296) * 2 - 1;
            sample = noise[0] * white + this.noiseZ1[i];
            this.noiseZ1[i] = -noise[1] * sample + this.noiseZ2[i];
            this.noiseZ2[i] = -noise[0] * white - noise[2] * sample;
          } else sample = periodicSample(shape, phase, band);
          value += sample * weights[shape];
          if (stereoSpread)
            rightValue += (shape === 4 ? sample : periodicSample(shape, otherPhase, band)) * weights[shape];
        }
        const sample = value * amplitude;
        for (let c = 0; c < Math.min(outputs.length, this.channels); c++)
          outputs[c][j] += (stereoSpread && c === 1 ? rightValue * amplitude : sample) * r[c];
        if (wet) {
          for (let c = 0; c < Math.min(2, wet.length); c++)
            wet[c][j] += sample * (this.channels === 2 ? r[c] : Math.SQRT1_2) * this.reverb[i];
        }
        phase += step;
        if (phase >= TABLE_SIZE) phase -= TABLE_SIZE;
        pulsePhase += this.pulseRate[i] / this.sampleRate;
        if (pulsePhase >= 1) pulsePhase -= 1;
      }
      this.phase[i] = phase;
      this.pulsePhase[i] = pulsePhase;
      this.pulseEnvelope[i] = envelope;
      this.pulseMix[i] = pulseMix;
      this.gain[i] = g;
    }
    for (let j = 0; j < n; j++) {
      this.master += (this.targetMaster - this.master) * alpha;
      for (const channel of outputs) channel[j] = Math.tanh(channel[j] * this.master);
      if (wet) for (const channel of wet) channel[j] = Math.tanh(channel[j] * this.master);
    }
    this.currentSample += n;
  }
}
