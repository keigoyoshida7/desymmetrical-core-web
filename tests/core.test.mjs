import test from "node:test";
import assert from "node:assert/strict";
import { analyze, toSources, testFrame, compareFeatures, ComparisonValidator } from "../analysis.js";
import { CHAPTERS, normalizeSoundSettings, applyChapter } from "../chapters.js";
import { SynthCore, CORE_OUTPUT_CHANNELS } from "../synth-core.js";
import { createCoreSpeakers } from "../core-layout.js";

const width = 64, height = 40;
const measuredFrame = testFrame(width, height, 0.25);
const close = (actual, expected, tolerance = 1e-10) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} is close to ${expected}`);

test("Core defaults to 30 ordered layers, conserving measured mask counts", () => {
  const features = analyze(measuredFrame, width, height);
  assert.equal(features.bands, 30);
  assert.equal(features.layers.length, 30);
  assert.equal(features.histogram.length, 30);
  assert.deepEqual(features.layers.map((layer) => layer.id), Array.from({ length: 30 }, (_, index) => index + 1));
  assert.equal(features.layers[0].tone, 0);
  assert.equal(features.layers.at(-1).tone, 1);
  const count = features.histogram.reduce((sum, value) => sum + value, 0);
  assert.equal(count, features.mask.reduce((sum, value) => sum + value, 0));
  close(count / features.roiPixels, features.area);
  for (let index = 0; index < features.layers.length; index++) {
    assert.equal(features.layers[index].count, features.histogram[index]);
    close(features.layers[index].density, features.histogram[index] / features.roiPixels);
  }
});

test("all supported band counts remain valid and a blank image stays silent", () => {
  const white = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const bands of [16, 30, 64, 256]) {
    const features = analyze(white, width, height, { bands });
    const sources = toSources(features);
    assert.equal(features.layers.length, bands);
    assert.equal(sources.length, bands);
    assert.equal(features.area, 0);
    assert.equal(features.perimeter, 0);
    assert.ok(sources.every((source) => source.gain === 0));
  }
  assert.throws(() => analyze(white, width, height, { bands: 31 }), /Invalid band count/);
  assert.throws(() => analyze(white.subarray(4), width, height), /Frame size mismatch/);
});

test("Core maps measured centroids to the 7 m room and tone height to 0.5–3.5 m", () => {
  const features = analyze(measuredFrame, width, height);
  const sources = toSources(features, { frequencyMin: 2000, frequencyMax: 12000 });
  close(sources[0].frequency, 2000);
  close(sources.at(-1).frequency, 12000);
  close(sources[0].z, 0.5);
  close(sources.at(-1).z, 3.5);
  const ratio = (12000 / 2000) ** (1 / 29);
  for (let index = 0; index < sources.length; index++) {
    const source = sources[index], layer = features.layers[index];
    close(source.x, (layer.centroid[0] - 0.5) * 7);
    close(source.y, (0.5 - layer.centroid[1]) * 7);
    assert.ok(Math.abs(source.x) <= 3.5 && Math.abs(source.y) <= 3.5);
    assert.ok(source.z >= 0.5 && source.z <= 3.5);
    if (index) close(source.frequency / sources[index - 1].frequency, ratio);
  }
});

test("one frozen analysis supports every chapter without altering the captured features", () => {
  const frozen = structuredClone(analyze(measuredFrame, width, height));
  const captured = structuredClone(frozen);
  const rendered = CHAPTERS.map((chapter) => {
    const settings = normalizeSoundSettings(chapter);
    return applyChapter(toSources(frozen, settings), frozen, settings);
  });
  assert.deepEqual(frozen, captured);
  assert.ok(rendered.every((sources) => sources.length === 30));
  for (let layer = 0; layer < 30; layer++) {
    assert.ok(rendered.every((sources) => sources[layer].id === captured.layers[layer].id));
    assert.ok(rendered.every((sources) => sources[layer].density === captured.layers[layer].density));
    assert.ok(rendered.every((sources) => sources[layer].gain === rendered[0][layer].gain));
  }
  assert.notDeepEqual(rendered[0].map((source) => source.frequency), rendered[1].map((source) => source.frequency));
  assert.ok(rendered[3].every((source) => source.detuneHz > 0));
  assert.ok(rendered[2].some((source, index) => source.spread > rendered[0][index].spread));
  const settings = normalizeSoundSettings({ chapterId: "sustain", waveform: "triangle", frequencyMin: 1000, frequencyMax: 10000 });
  const altered = applyChapter(toSources(frozen, settings), frozen, settings);
  assert.equal(altered[0].waveform, "triangle");
  close(altered[0].frequency, 1000);
  close(altered.at(-1).frequency, 10000);
  assert.deepEqual(frozen, captured);
});

test("the validated comparison remains a distinct additional voice at every band count", () => {
  for (const bands of [16, 30, 64, 256]) {
    const features = analyze(measuredFrame, width, height, { bands });
    const comparison = { valid: true, features: structuredClone(features), distance: 0.4 };
    const captured = structuredClone(comparison);
    const base = toSources(features, {}, { ...comparison, valid: false });
    const added = toSources(features, {}, comparison);
    assert.equal(base.length, bands);
    assert.equal(added.length, bands + 1);
    assert.equal(new Set(added.map((source) => source.id)).size, bands + 1);
    assert.equal(added.at(-1).id, 257);
    assert.ok(added.at(-1).gain > 0);
    assert.ok(added.reduce((sum, source) => sum + source.gain, 0) <= 0.65);
    assert.deepEqual(comparison, captured);
  }
});

test("comparison validation requires distinct observations and rejects stale or mismatched data", () => {
  const features = analyze(measuredFrame, width, height);
  assert.equal(compareFeatures(features, structuredClone(features)), 0);
  assert.throws(() => compareFeatures(features, analyze(measuredFrame, width, height, { bands: 16 })), /settings mismatch/);
  const validator = new ComparisonValidator();
  const observation = { sourceId: "capture-1", generatedFrom: "capture-1", generatedId: "generated-1", sourceAt: 1000, generatedAt: 1100, now: 1200, distance: 0.3 };
  assert.equal(validator.validate(observation).valid, false);
  assert.equal(validator.validate(observation).valid, false);
  assert.equal(validator.validate({ ...observation, generatedId: "generated-2" }).valid, false);
  assert.equal(validator.validate({ ...observation, generatedId: "generated-3" }).valid, true);
  assert.equal(validator.validate({ ...observation, generatedId: "generated-4", generatedFrom: "another-capture" }).valid, false);
  assert.equal(validator.validate({ ...observation, now: 8000 }).valid, false);
});

test("30-layer Core analysis feeds the complete 18-channel renderer including voice 257", () => {
  const features = analyze(measuredFrame, width, height);
  const settings = normalizeSoundSettings({ chapterId: "harmonic" });
  const sources = applyChapter(toSources(features, settings, { valid: true, features, distance: 0.5 }), features, settings);
  const synth = new SynthCore(48000, CORE_OUTPUT_CHANNELS);
  synth.update(sources, 0.2, createCoreSpeakers());
  assert.equal(synth.channels, 18);
  assert.equal(synth.targets[256] > 0, true);
  assert.ok(Array.from(synth.targets.slice(30, 256)).every((gain) => gain === 0));
  const output = Array.from({ length: 18 }, () => new Float32Array(128));
  for (let block = 0; block < 100; block++) synth.render(output);
  assert.ok(output.every((channel) => channel.every((sample) => Number.isFinite(sample) && Math.abs(sample) <= 1)));
  assert.ok(output.every((channel) => channel.some((sample) => Math.abs(sample) > 1e-9)), "all 17 mains and the low-frequency sub receive signal");
});

test("Core layout has 16 wall speakers in two columns and two heights, then arm and sub", () => {
  const speakers = createCoreSpeakers();
  assert.equal(speakers.length, 18);
  assert.deepEqual(speakers.map((speaker) => speaker.id), Array.from({ length: 18 }, (_, index) => index + 1));
  assert.equal(new Set(speakers.map(({ x, y, z }) => `${x},${y},${z}`)).size, 18);
  const walls = [
    { group: "後壁", fixed: "y", value: -3.5, along: "x" },
    { group: "前壁", fixed: "y", value: 3.5, along: "x" },
    { group: "右壁", fixed: "x", value: 3.5, along: "y" },
    { group: "左壁", fixed: "x", value: -3.5, along: "y" },
  ];
  walls.forEach((wall, index) => {
    const group = speakers.slice(index * 4, index * 4 + 4);
    assert.ok(group.every((speaker) => speaker.group === wall.group && speaker[wall.fixed] === wall.value));
    assert.deepEqual([...new Set(group.map((speaker) => speaker[wall.along]))].sort(), [-1.75, 1.75]);
    assert.deepEqual([...new Set(group.map((speaker) => speaker.z))].sort(), [0.8, 2.8]);
  });
  assert.equal(speakers[16].group, "アーム（仮）");
  assert.deepEqual([speakers[16].x, speakers[16].y, speakers[16].z], [0, 0, 1.85]);
  assert.equal(speakers[17].group, "Sub");
  assert.ok(speakers.every((speaker) => speaker.measured === false && speaker.gainDb === 0 && speaker.delayMs === 0 && speaker.polarity === 1));
  const untouched = createCoreSpeakers();
  speakers[0].x = 10;
  speakers[1].eq.push({ type: "peaking", frequency: 1000, gain: -2 });
  assert.equal(untouched[0].x, -1.75);
  assert.deepEqual(untouched[1].eq, []);
  assert.deepEqual(speakers[0].eq, [], "each output owns an independent calibration array");
});
