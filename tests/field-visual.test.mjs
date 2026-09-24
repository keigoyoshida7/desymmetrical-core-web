import test from "node:test";
import assert from "node:assert/strict";
import { analyze, testFrame, toSources } from "../analysis.js";
import { CHAPTERS, applyChapter, normalizeSoundSettings } from "../chapters.js";
import { buildFieldStudy } from "../field-visual.js";

const close = (actual, expected, tolerance = 1e-10) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} is close to ${expected}`);
const acquire = (bands = 30) => analyze(testFrame(64, 40, 0.25), 64, 40, { bands });
const mapChapter = (features, chapter, comparison = null) => {
  const settings = normalizeSoundSettings(chapter);
  const sources = applyChapter(toSources(features, settings, comparison), features, settings);
  return { settings, sources, model: buildFieldStudy(features, sources, settings) };
};

test("chapter transformations preserve the acquired boundary and tonal envelope coordinates", () => {
  for (const bands of [16, 30]) {
    const features = acquire(bands);
    const captured = structuredClone(features);
    assert.ok(features.contours.length > 0);
    assert.ok(features.layers.some(layer => layer.cell.polygon.length > 2));
    const studies = CHAPTERS.map(chapter => mapChapter(features, chapter));

    for (const { sources, model } of studies) {
      assert.equal(model.layers.length, bands);
      assert.deepEqual(model.layers.map(layer => layer.id), captured.layers.map(layer => layer.id));
      assert.deepEqual(model.layers.map(layer => layer.polygon), captured.layers.map(layer => layer.cell.polygon));
      assert.deepEqual(model.layers.map(layer => layer.density), captured.layers.map(layer => layer.density));
      assert.deepEqual(sources.map(source => source.polygon), captured.layers.map(layer => layer.cell.polygon));
    }
    assert.notDeepEqual(studies[0].sources.map(source => [source.x, source.y]),
      studies[1].sources.map(source => [source.x, source.y]), "harmonic audio positions change without moving the acquired contour");
    assert.deepEqual(features, captured, "the frozen analysis, including its literal boundary, stays untouched");
  }
});

test("frequency elevation follows harmonic quantization rather than the original tone index", () => {
  const features = acquire();
  const { settings, sources, model } = mapChapter(features, { chapterId: "harmonic" });
  const changedIndex = model.layers.findIndex(layer => Math.abs(layer.height - layer.tone) > 0.01);
  assert.ok(changedIndex >= 0, "the test frame exposes a quantized layer away from its original tone height");
  for (let index = 0; index < model.layers.length; index++) {
    const layer = model.layers[index];
    assert.equal(layer.frequency, sources[index].frequency);
    assert.equal(layer.partial, sources[index].harmonicPartial);
    close(layer.frequency, layer.partial * settings.harmonicFundamental);
    close(layer.height, Math.log(layer.frequency / settings.frequencyMin) /
      Math.log(settings.frequencyMax / settings.frequencyMin));
    close(model.position(layer.frequency), layer.height);
  }
  close(model.position(settings.frequencyMin), 0);
  close(model.position(settings.frequencyMax), 1);
});

test("interference shows the actual two frequency centers, including a narrow custom range", () => {
  const features = acquire(16);
  for (const overrides of [{ beatHz: 2 }, { frequencyMin: 99, frequencyMax: 100, beatHz: 8 }]) {
    const { settings, sources, model } = mapChapter(features, { chapterId: "interference", ...overrides });
    for (let index = 0; index < model.layers.length; index++) {
      const layer = model.layers[index], source = sources[index];
      close(layer.separation, source.detuneHz);
      close(layer.pair[0], source.frequency - source.detuneHz / 2);
      close(layer.pair[1], source.frequency + source.detuneHz / 2);
      close(layer.pair[1] - layer.pair[0], layer.separation);
      assert.ok(layer.pair[0] >= settings.frequencyMin);
      assert.ok(layer.pair[1] <= settings.frequencyMax);
    }
  }
});

test("the comparison voice is reported separately and never becomes an acquired tone layer", () => {
  const features = acquire();
  const { settings, sources, model } = mapChapter(features, { chapterId: "sustain" },
    { valid: true, features: structuredClone(features), distance: 0.4 });
  assert.ok(sources.some(source => source.id === 257 && source.gain > 0));
  assert.equal(model.comparison, true);
  assert.equal(model.layers.length, features.bands);
  assert.ok(model.layers.every(layer => layer.id !== 257));
  assert.equal(buildFieldStudy(features, sources.filter(source => source.id !== 257), settings).comparison, false);
  assert.equal(buildFieldStudy(features, sources.map(source => source.id === 257 ? { ...source, gain: 0 } : source), settings).comparison, false);
});

test("missing analysis and a blank frame do not invent active shadow geometry", () => {
  const empty = buildFieldStudy(null);
  assert.deepEqual(empty.layers, []);
  assert.equal(empty.comparison, false);
  assert.ok(Number.isFinite(empty.position(empty.lo)));

  const blank = analyze(new Uint8ClampedArray(64 * 40 * 4).fill(255), 64, 40, { bands: 16 });
  const { model } = mapChapter(blank, { chapterId: "sustain" });
  assert.equal(blank.contours.length, 0);
  assert.equal(model.layers.length, 16);
  assert.ok(model.layers.every(layer => layer.polygon.length === 0 && layer.density === 0 && layer.gain === 0));
  assert.ok(model.layers.every(layer => Number.isFinite(layer.height) && Number.isFinite(layer.frequency)));
});
