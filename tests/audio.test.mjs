import test from 'node:test';
import assert from 'node:assert/strict';
import { SynthCore, WAVEFORMS } from '../synth-core.js';

const rate = 48000;
const voice = (extra = {}) => ({
  id: 1, frequency: 375, gain: 0.2, x: 0, y: 0, z: 1.5,
  spread: 0, reverb: 0, waveform: 'sine', organization: 'sustain', ...extra,
});
function advance(synth, count, { sources, volume = 0.2, speakers } = {}) {
  const result = Array.from({ length: synth.channels }, () => new Float32Array(count));
  for (let offset = 0; offset < count; offset += 128) {
    if (sources && offset % 4096 === 0) synth.update(sources, volume, speakers);
    const block = result.map((channel) => channel.subarray(offset, Math.min(count, offset + 128)));
    synth.render(block);
  }
  return result;
}
function settled(source, seconds = 0.5) {
  const synth = new SynthCore(rate, 2);
  advance(synth, rate / 2, { sources: [source] });
  return { synth, audio: advance(synth, Math.floor(rate * seconds), { sources: [source] })[0] };
}
const rms = (a) => Math.sqrt(a.reduce((sum, value) => sum + value * value, 0) / a.length);
function magnitude(audio, frequency) {
  let cosine = 0, sine = 0;
  for (let i = 0; i < audio.length; i++) {
    const angle = (i * 2 * Math.PI * frequency) / rate;
    cosine += audio[i] * Math.cos(angle);
    sine += audio[i] * Math.sin(angle);
  }
  return Math.hypot(cosine, sine) * 2 / audio.length;
}

test('five waveforms produce finite, bounded, distinct audio; sine remains the default', () => {
  const shapes = WAVEFORMS.map((waveform) => settled(voice({ waveform })).audio);
  for (const audio of shapes) {
    assert(rms(audio) > 0.0001);
    assert(audio.every((sample) => Number.isFinite(sample) && Math.abs(sample) <= 1));
  }
  for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) {
    const difference = shapes[i].map((sample, k) => sample - shapes[j][k]);
    assert(rms(difference) > 0.001, `${WAVEFORMS[i]} differs from ${WAVEFORMS[j]}`);
  }
  assert.deepEqual(settled(voice({ waveform: undefined })).audio, shapes[0]);
  assert(magnitude(shapes[1], 1125) > magnitude(shapes[0], 1125) * 20, 'square adds odd harmonics');
  assert(magnitude(shapes[2], 750) > magnitude(shapes[0], 750) * 20, 'saw adds even harmonics');
});

test('high fundamentals discard partials that would fold below Nyquist', () => {
  for (const waveform of ['square', 'sawtooth', 'triangle']) {
    const { audio } = settled(voice({ waveform, frequency: 10000, gain: 0.01 }));
    const fundamental = magnitude(audio, 10000);
    assert(fundamental > 0.0001);
    assert(magnitude(audio, 18000) < fundamental * 0.002, `${waveform}: no folded third partial`);
    const high = settled(voice({ waveform, frequency: 15000, gain: 0.01 })).audio;
    const highFundamental = magnitude(high, 15000);
    assert(magnitude(high, 18000) < highFundamental * 0.002, `${waveform}: no folded second partial`);
    assert(magnitude(high, 3000) < highFundamental * 0.002, `${waveform}: no folded third partial at 15 kHz`);
  }
  const synth = new SynthCore(rate, 2);
  synth.update([voice({ frequency: 1e12, waveform: 'square' })]);
  assert.equal(synth.frequency[0], 16000);
  assert(advance(synth, 1024)[0].every(Number.isFinite));
});

test('noise is deterministic and concentrated around its selected band center', () => {
  const source = voice({ waveform: 'noise', frequency: 3000, noiseQ: 5 });
  const one = settled(source, 1).audio;
  const two = settled(source, 1).audio;
  assert.deepEqual(one, two);
  const averagePower = (center) => {
    let sum = 0;
    for (let f = center - 100; f <= center + 100; f += 10) sum += magnitude(one, f) ** 2;
    return sum;
  };
  assert(averagePower(3000) > averagePower(300) * 10);
  assert(averagePower(3000) > averagePower(12000) * 10);
});

test('pulse organization gates within a render block and honors duty and phase', () => {
  const { audio } = settled(voice({ organization: 'pulse', pulseRate: 4, pulseWidth: 0.3 }));
  // Capture starts at 0.5 s, an exact pulse-cycle boundary.
  assert(rms(audio.subarray(1000, 2500)) > 0.005);
  assert(rms(audio.subarray(6500, 9500)) < 0.00001);
  const shifted = settled(voice({ organization: 'pulse', pulseRate: 4, pulseWidth: 0.3, phaseOffset: 0.5 })).audio;
  assert(rms(shifted.subarray(1000, 2500)) < 0.00001);
  assert(rms(shifted.subarray(6500, 8500)) > 0.005);
  assert(rms(settled(voice({ organization: 'pulse', pulseWidth: 0 })).audio) < 0.00001);
  const full = settled(voice({ organization: 'pulse', pulseWidth: 1 })).audio;
  assert(Math.abs(rms(full) - rms(settled(voice()).audio)) < 0.00001);
});

test('waveform transitions crossfade without an instantaneous jump', () => {
  const { synth } = settled(voice());
  const previous = advance(synth, 128)[0].at(-1);
  synth.update([voice({ waveform: 'square' })]);
  const next = advance(synth, 128)[0];
  assert(Math.abs(next[0] - previous) < 0.003);
  assert(synth.waveMix[0][0] > 0.8, 'old waveform is still present in the first block');
  assert(synth.waveMix[0][1] > 0 && synth.waveMix[0][1] < 0.2);
});

test('Core routes to all 17 mains, arm channel 17, and sub on channel 18', () => {
  const speakers = Array.from({ length: 18 }, (_, i) => ({ x: i === 16 ? 0 : 8, y: 0, z: 1.5 }));
  const synth = new SynthCore(rate, 18);
  const sources = [voice({ frequency: 60, spread: 0 })];
  const audio = advance(synth, rate / 2, { sources, speakers });
  assert(audio.every((channel) => rms(channel) > 0));
  assert(rms(audio[16]) > rms(audio[0]) * 100, 'arm uses supplied position');
  assert(rms(audio[17]) > 0.001, 'sub is output 18');
  const higher = new SynthCore(rate, 18);
  const high = advance(higher, rate / 2, { sources: [voice()], speakers });
  assert.equal(rms(high[17]), 0, 'above-crossover sources do not feed the sub');
  assert(rms(high[16]) > 0.001);
});

test('stereo position spans the full 7 m Core room', () => {
  const synth = new SynthCore(rate, 2);
  synth.update([voice({ x: 1.75 })]);
  assert.equal(synth.pan[0], 0.75);
  assert(synth.targetRoutes[0][0] > 0, 'interior position still reaches the left monitor');
  synth.update([voice({ x: 3.5 })]);
  assert.equal(synth.pan[0], 1);
});

test('missing state fades out after 1.5 seconds; malformed voices cannot poison output', () => {
  const synth = new SynthCore(rate, 18);
  synth.update([voice(), voice({ id: 257, waveform: 'sawtooth' }), voice({ id: 1.5 }), voice({ gain: NaN }), null]);
  assert(rms(advance(synth, 24000)[0]) > 0);
  const stale = advance(synth, rate * 2);
  assert(rms(stale[0].subarray(stale[0].length - 4096)) < 1e-7);
  const loud = Array.from({ length: 257 }, (_, i) => voice({ id: i + 1, waveform: WAVEFORMS[i % 5], gain: 0.65 }));
  const resumed = advance(synth, 12000, { sources: loud, volume: 0.8 });
  assert(resumed.every((channel) => channel.every((sample) => Number.isFinite(sample) && Math.abs(sample) <= 1)));
});

test('invalid optional sound fields use finite defaults for every organization and waveform', () => {
  for (const waveform of WAVEFORMS) for (const organization of ['sustain', 'pulse', 'harmonic', 'texture']) {
    const synth = new SynthCore(NaN, Infinity);
    assert.equal(synth.sampleRate, 48000);
    assert.equal(synth.channels, 2);
    synth.update([voice({ waveform, organization, pulseRate: NaN, pulseWidth: Infinity,
      phaseOffset: -Infinity, noiseQ: 'invalid' })], 0.2);
    assert.equal(synth.pulseRate[0], 2);
    assert(Math.abs(synth.pulseWidth[0] - 0.35) < 1e-6);
    assert.equal(synth.phaseOffset[0], 0);
    assert([...synth.noiseCoefficients[0]].every(Number.isFinite));
    const audio = advance(synth, 4096);
    assert(audio.every((channel) => channel.every(Number.isFinite)), `${waveform}/${organization}`);
    assert(rms(audio[0]) > 0);
    synth.update([voice({ waveform })], NaN);
    assert.equal(synth.targetMaster, 0, 'invalid volume mutes');
    assert(advance(synth, 128)[0].every(Number.isFinite));
  }
});
