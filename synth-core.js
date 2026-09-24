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
  "sine", "noise", "triangle",
]);
export const CORE_OUTPUT_CHANNELS = 18;
const VOICES = 257;
const SHAPE_SIZE = 2048;
const HARMONICS = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512];

// Triangle tables retain only partials that fit below 0.45 * sampleRate.
// Continuous lookup avoids the aliases of a raw piecewise-linear oscillator.
function makeTriangleTables() {
  const sum = new Float64Array(SHAPE_SIZE + 1);
  const tables = [];
  for (let harmonic = 1; harmonic <= HARMONICS.at(-1); harmonic++) {
    if (harmonic % 2) {
      for (let j = 0; j < SHAPE_SIZE; j++) {
        sum[j] += ((harmonic % 4 === 1 ? 1 : -1) * 8 *
          Math.sin((2 * Math.PI * harmonic * j) / SHAPE_SIZE)) /
          (Math.PI * Math.PI * harmonic * harmonic);
      }
    }
    if (HARMONICS.includes(harmonic)) {
      const table = new Float32Array(sum);
      let peak = 0;
      for (let j = 0; j < SHAPE_SIZE; j++) peak = Math.max(peak, Math.abs(table[j]));
      for (let j = 0; j < SHAPE_SIZE; j++) table[j] /= peak || 1;
      table[SHAPE_SIZE] = table[0];
      tables.push(table);
    }
  }
  return tables;
}
const TRIANGLE = makeTriangleTables();

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
  const low = lookup(TRIANGLE[band.lower], position);
  return low + (lookup(TRIANGLE[band.upper], position) - low) * band.mix;
}
function noiseCoefficients(frequency, sampleRate, q, target) {
  const omega = (2 * Math.PI * frequency) / sampleRate;
  const alpha = Math.sin(omega) / (2 * q);
  // Constant-peak band-pass: its center is a frequency band, not a pitch.
  target.set([
    alpha / (1 + alpha),
    (-2 * Math.cos(omega)) / (1 + alpha),
    (1 - alpha) / (1 + alpha),
  ]);
}
function filteredNoise(state, z1, z2, coefficients, i) {
  state[i] = (Math.imul(state[i], 1664525) + 1013904223) >>> 0;
  const white = (state[i] / 4294967296) * 2 - 1;
  const sample = coefficients[0] * white + z1[i];
  z1[i] = -coefficients[1] * sample + z2[i];
  z2[i] = -coefficients[0] * white - coefficients[2] * sample;
  return sample;
}
const wrappedPhase = (phase) => (phase + TABLE_SIZE) % TABLE_SIZE;
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
    this.waveMix = Array.from({ length: VOICES }, () => new Float32Array([1, 0, 0]));
    this.paired = new Uint8Array(VOICES);
    this.pairMix = new Float32Array(VOICES);
    this.detuneHz = new Float64Array(VOICES);
    this.detune = new Float64Array(VOICES);
    this.detunePhase = new Float64Array(VOICES);
    this.pairBands = Array.from({ length: VOICES }, () => ({ lower: 0, upper: 0, mix: 1 }));
    this.pairNoiseState = Array.from({ length: 2 }, (_, pair) =>
      Uint32Array.from({ length: VOICES }, (_, i) => (997 + pair * 10619863 + i * 104729) >>> 0));
    this.pairNoiseZ1 = Array.from({ length: 2 }, () => new Float64Array(VOICES));
    this.pairNoiseZ2 = Array.from({ length: 2 }, () => new Float64Array(VOICES));
    this.pairNoiseCoefficients = Array.from({ length: 2 }, () =>
      Array.from({ length: VOICES }, () => new Float64Array(3)));
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
      this.paired[i] = s.organization === "interference" ? 1 : 0;
      const maxDetune = Math.max(0, Math.min(12, 2 * (this.frequency[i] - 20),
        2 * (Math.min(16000, this.sampleRate * 0.45) - this.frequency[i])));
      this.detuneHz[i] = this.paired[i] ? bounded(s.detuneHz, 0, maxDetune, Math.min(1.5, maxDetune)) : 0;
      this.pairBands[i] = tableBand(this.frequency[i] + this.detuneHz[i] / 2, this.sampleRate);
      const q = bounded(s.noiseQ, 0.2, 12, 0.8);
      noiseCoefficients(this.frequency[i], this.sampleRate, q, this.noiseCoefficients[i]);
      for (let pair = 0; pair < 2; pair++) {
        const center = this.frequency[i] + (pair ? 1 : -1) * this.detuneHz[i] / 2;
        noiseCoefficients(center, this.sampleRate, q, this.pairNoiseCoefficients[pair][i]);
      }
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
    for (let i = 0; i < VOICES; i++) {
      let g = this.gain[i];
      if (g < 1e-7 && (this.targets[i] === 0 || this.currentSample - this.lastUpdate >= this.sampleRate * 1.5)) continue;
      let phase = this.phase[i];
      let detunePhase = this.detunePhase[i];
      let detune = this.detune[i];
      let pairMix = this.pairMix[i];
      const step = (this.frequency[i] * TABLE_SIZE) / this.sampleRate;
      const band = this.tableBands[i], pairBand = this.pairBands[i];
      const weights = this.waveMix[i];
      const r = this.routes[i], rt = this.targetRoutes[i];
      const noise = this.noiseCoefficients[i];
      for (let c = 0; c < this.channels; c++) r[c] += (rt[c] - r[c]) * 0.18;
      for (let j = 0; j < n; j++) {
        const fresh = this.currentSample + j - this.lastUpdate < this.sampleRate * 1.5;
        g += ((fresh ? this.targets[i] : 0) - g) * alpha;
        pairMix += (this.paired[i] - pairMix) * timbreAlpha;
        detune += (this.detuneHz[i] - detune) * alpha;
        const amplitude = g;
        let value = 0, rightValue = 0;
        const stereoSpread = this.channels === 2 && this.spread[i] > 0.001;
        const otherPhase = (phase + TABLE_SIZE * (1 + this.spread[i] * 0.18 * (i % 2 ? 1 : -1))) % TABLE_SIZE;
        for (let shape = 0; shape < WAVEFORMS.length; shape++) {
          weights[shape] += ((this.waveforms[i] === shape ? 1 : 0) - weights[shape]) * timbreAlpha;
          if (weights[shape] < 1e-7) continue;
          let sample;
          let rightSample;
          if (shape === 1) {
            sample = filteredNoise(this.noiseState, this.noiseZ1, this.noiseZ2, noise, i);
            if (pairMix > 1e-7) {
              // Independent filtered streams overlap without a periodic amplitude
              // envelope. Noise does not produce the predictable beat of two sines.
              let pairSample = 0;
              for (let pair = 0; pair < 2; pair++) {
                pairSample += 0.5 * filteredNoise(this.pairNoiseState[pair], this.pairNoiseZ1[pair],
                  this.pairNoiseZ2[pair], this.pairNoiseCoefficients[pair][i], i);
              }
              sample += (pairSample - sample) * pairMix;
            }
            rightSample = sample;
          } else {
            sample = periodicSample(shape, phase, band);
            rightSample = stereoSpread ? periodicSample(shape, otherPhase, band) : sample;
            if (pairMix > 1e-7) {
              // Symmetric f-d/2 and f+d/2 oscillators remain continuously active.
              // Half gain per oscillator keeps their combined peak gain bounded.
              const pairSample = 0.5 * (periodicSample(shape, wrappedPhase(phase - detunePhase), pairBand) +
                periodicSample(shape, wrappedPhase(phase + detunePhase), pairBand));
              sample += (pairSample - sample) * pairMix;
              if (stereoSpread) {
                const rightPair = 0.5 * (periodicSample(shape, wrappedPhase(otherPhase - detunePhase), pairBand) +
                  periodicSample(shape, wrappedPhase(otherPhase + detunePhase), pairBand));
                rightSample += (rightPair - rightSample) * pairMix;
              }
            }
          }
          value += sample * weights[shape];
          if (stereoSpread) rightValue += rightSample * weights[shape];
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
        detunePhase += (detune * TABLE_SIZE) / (2 * this.sampleRate);
        if (detunePhase >= TABLE_SIZE) detunePhase -= TABLE_SIZE;
      }
      this.phase[i] = phase;
      this.detunePhase[i] = detunePhase;
      this.detune[i] = detune;
      this.pairMix[i] = pairMix;
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
