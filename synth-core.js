import { clamp } from "./analysis.js";
const TABLE_SIZE = 8192,
  TABLE = new Float32Array(TABLE_SIZE + 1);
for (let i = 0; i <= TABLE_SIZE; i++)
  TABLE[i] = Math.sin((2 * Math.PI * i) / TABLE_SIZE);
export class SynthCore {
  constructor(sampleRate = 48000, channels = 2) {
    this.sampleRate = sampleRate;
    this.channels = channels;
    this.phase = new Float64Array(257);
    this.frequency = new Float64Array(257);
    this.gain = new Float32Array(257);
    this.targets = new Float32Array(257);
    this.pan = new Float32Array(257).fill(0.5);
    this.spread = new Float32Array(257);
    this.routes = Array.from({ length: 257 }, () => new Float32Array(channels));
    this.targetRoutes = Array.from(
      { length: 257 },
      () => new Float32Array(channels),
    );
    this.reverb = new Float32Array(257);
    this.currentSample = 0;
    this.lastUpdate = -Infinity;
    this.master = 0;
    this.targetMaster = 0.2;
  }
  update(sources, volume = 0.2, speakers = []) {
    this.targets.fill(0);
    for (const s of sources) {
      const i = s.id - 1;
      if (
        i < 0 ||
        i >= 257 ||
        !["frequency", "gain", "x", "y", "z", "spread", "reverb"].every((k) =>
          Number.isFinite(s[k]),
        )
      )
        continue;
      this.frequency[i] = clamp(
        s.frequency,
        20,
        Math.min(16000, this.sampleRate * 0.45),
      );
      this.targets[i] = clamp(s.gain, 0, 0.65);
      this.reverb[i] = clamp(s.reverb);
      const p = clamp(
        (s.x / 2.4 + 0.5 - 0.5) * (1 - clamp(s.spread) * 0.7) + 0.5,
      );
      this.pan[i] = p;
      this.spread[i] = clamp(s.spread);
      const r = this.targetRoutes[i];
      r.fill(0);
      if (this.channels === 2) {
        r[0] = Math.cos((p * Math.PI) / 2);
        r[1] = Math.sin((p * Math.PI) / 2);
      } else {
        let norm = 0;
        for (let c = 0; c < Math.min(12, this.channels); c++) {
          const sp = speakers[c] ?? {
            x: Math.cos((c / 12) * 6.28),
            y: Math.sin((c / 12) * 6.28),
            z: 1,
          };
          const d = Math.hypot(s.x - sp.x, s.y - sp.y, s.z - sp.z);
          r[c] = (1 - clamp(s.spread)) / (0.2 + d * d) + clamp(s.spread) * 0.25;
          norm += r[c] * r[c];
        }
        norm = Math.sqrt(norm) || 1;
        for (let c = 0; c < 12; c++) r[c] /= norm;
        if (this.channels >= 13) r[12] = s.frequency < 100 ? 0.65 : 0;
      }
    }
    this.targetMaster = clamp(volume, 0, 0.8);
    this.lastUpdate = this.currentSample;
  }
  render(outputs, wet = null) {
    const n = outputs[0].length;
    for (const c of outputs) c.fill(0);
    if (wet) for (const c of wet) c.fill(0);
    const fresh = this.currentSample - this.lastUpdate < this.sampleRate * 1.5,
      alpha = 1 - Math.exp(-1 / (this.sampleRate * 0.035));
    for (let i = 0; i < 257; i++) {
      let g = this.gain[i];
      const target = fresh ? this.targets[i] : 0;
      if (g < 1e-7 && target === 0) continue;
      let phase = this.phase[i];
      const step = (this.frequency[i] * TABLE_SIZE) / this.sampleRate,
        r = this.routes[i],
        rt = this.targetRoutes[i];
      for (let c = 0; c < this.channels; c++) r[c] += (rt[c] - r[c]) * 0.18;
      for (let j = 0; j < n; j++) {
        g += (target - g) * alpha;
        const k = Math.floor(phase),
          frac = phase - k,
          sample = (TABLE[k] + (TABLE[k + 1] - TABLE[k]) * frac) * g;
        for (let c = 0; c < outputs.length; c++) {
          if (this.channels === 2 && c === 1 && this.spread[i] > 0.001) {
            let other =
              phase + TABLE_SIZE * this.spread[i] * 0.18 * (i % 2 ? 1 : -1);
            if (other < 0) other += TABLE_SIZE;
            if (other >= TABLE_SIZE) other -= TABLE_SIZE;
            const q = Math.floor(other);
            outputs[c][j] +=
              (TABLE[q] + (TABLE[q + 1] - TABLE[q]) * (other - q)) * g * r[c];
          } else outputs[c][j] += sample * r[c];
        }
        if (wet) {
          for (let c = 0; c < Math.min(2, wet.length); c++)
            wet[c][j] += sample * (r[c] ?? 0.5) * this.reverb[i];
        }
        phase += step;
        if (phase >= TABLE_SIZE) phase -= TABLE_SIZE;
      }
      this.phase[i] = phase;
      this.gain[i] = g;
    }
    for (let j = 0; j < n; j++) {
      this.master += (this.targetMaster - this.master) * alpha;
      for (const c of outputs) c[j] = Math.tanh(c[j] * this.master);
      if (wet) for (const c of wet) c[j] *= this.master;
    }
    this.currentSample += n;
  }
}
