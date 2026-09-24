import test from "node:test";
import assert from "node:assert/strict";
import { CHAPTERS, WAVEFORMS, ORGANIZATIONS, getChapter, normalizeSoundSettings, applyChapter } from "../chapters.js";

const features = { width: 100, penumbraWidth: 4 };
const source = (tone, frequency) => ({
  id: Math.round(tone * 29) + 1, tone, frequency,
  x: 0.2, y: -0.3, z: 0.7, spread: 0.2, gain: 0.08,
  polygon: [[0, 0], [1, 0], [0, 1]],
});

test("four provisional presets are JSON-friendly and preserve the legacy sine preset", () => {
  assert.deepEqual(CHAPTERS.map((chapter) => chapter.id), ["sustain", "harmonic", "texture", "interference"]);
  assert.deepEqual(CHAPTERS.map((chapter) => chapter.number), ["I", "II", "III", "IV"]);
  assert.deepEqual(WAVEFORMS, ["sine", "noise", "triangle"]);
  assert.deepEqual(ORGANIZATIONS, CHAPTERS.map((chapter) => chapter.id));
  assert.deepEqual(JSON.parse(JSON.stringify(CHAPTERS)), CHAPTERS);
  assert.equal(getChapter("sustain").waveform, "sine");
  assert.equal(getChapter("sustain").frequencyMin, 110);
  assert.equal(getChapter("sustain").frequencyMax, 3520);
  assert.equal(getChapter("unknown").id, "sustain");
});

test("preset defaults and independent waveform/organization overrides normalize safely", () => {
  const normalized = normalizeSoundSettings({ chapter: "texture", waveform: "triangle", organization: "interference" });
  assert.equal(normalized.chapterId, "texture");
  assert.equal(normalized.waveform, "triangle");
  assert.equal(normalized.organization, "interference");
  assert.equal(normalized.frequencyMin, 800);
  assert.equal(normalized.frequencyMax, 8000);
  const invalid = normalizeSoundSettings({ waveform: "invalid", frequencyMin: 20000, frequencyMax: -2, beatHz: Infinity, harmonicFundamental: 5000 });
  assert.equal(invalid.frequencyMin, 15999);
  assert.equal(invalid.frequencyMax, 16000);
  assert.equal(invalid.waveform, "sine");
  assert.equal(invalid.beatHz, 1.5);
  assert.equal(invalid.harmonicFundamental, 1000);
  assert.equal(normalizeSoundSettings({ beatHz: 0 }).beatHz, 0.1);
  assert.equal(normalizeSoundSettings({ beatHz: 99 }).beatHz, 8);
  assert.equal(normalizeSoundSettings({ frequencyMin: "120", frequencyMax: "240" }).frequencyMax, 240);
  assert.equal(normalizeSoundSettings(null).chapterId, "sustain");
});

test("sustain retains original frequencies, gains, and geometry without mutating inputs", () => {
  const input = [source(0, 110), source(0.5, Math.sqrt(110 * 3520)), source(1, 3520)];
  const snapshot = structuredClone(input);
  const output = applyChapter(input, features, { chapterId: "sustain" });
  assert.deepEqual(input, snapshot);
  output.forEach((item, index) => {
    assert.notEqual(item, input[index]);
    for (const field of ["frequency", "gain", "x", "y", "z", "spread"])
      assert.equal(item[field], input[index][field]);
    assert.equal(item.waveform, "sine");
    assert.equal(item.organization, "sustain");
  });
});

test("removed saved waveform and organization values normalize to supported defaults", () => {
  for (const waveform of ["square", "sawtooth"]) {
    const settings = normalizeSoundSettings({ chapterId: "pulse", organization: "pulse", waveform,
      pulseRate: 4, pulseWidth: 0.5 });
    assert.equal(settings.chapterId, "sustain");
    assert.equal(settings.organization, "sustain");
    assert.equal(settings.waveform, "sine");
    assert.equal("pulseRate" in settings, false);
    assert.equal("pulseWidth" in settings, false);
  }
});

test("interference maps tones to nearby sustained pairs within the configured band", () => {
  const input = [source(0, 110), source(0.5, 440), source(1, 1760)];
  const captured = structuredClone(input);
  const output = applyChapter(input, features, { chapterId: "interference", beatHz: 2 });
  assert.deepEqual(input, captured);
  assert.deepEqual(output.map((item) => item.detuneHz), [1, 2, 3]);
  assert.deepEqual(output.map((item) => item.frequency), [110.5, 440, 1758.5]);
  output.forEach((item, index) => {
    assert.ok(item.frequency - item.detuneHz / 2 >= 110);
    assert.ok(item.frequency + item.detuneHz / 2 <= 1760);
    for (const field of ["id", "gain", "x", "y", "z", "spread"])
      assert.equal(item[field], input[index][field]);
  });
  const narrow = applyChapter([source(1, 100)], features, {
    chapterId: "interference", frequencyMin: 99, frequencyMax: 100, beatHz: 8,
  });
  assert.equal(narrow[0].detuneHz, 1);
  assert.equal(narrow[0].frequency, 99.5);
  const ordinary = applyChapter(output, features, { chapterId: "sustain" });
  assert.ok(ordinary.every((item) => item.detuneHz === 0));
});

test("harmonic organization selects integer partials in range and changes spatial distribution", () => {
  const input = [source(0, 55), source(0.25, 117), source(0.5, 311), source(0.75, 703), source(1, 880)];
  const output = applyChapter(input, features, { chapterId: "harmonic" });
  assert.deepEqual(output.map((item) => item.frequency), [55, 110, 330, 715, 880]);
  output.forEach((item, index) => {
    assert.equal(item.frequency / 55, item.harmonicPartial);
    assert.equal(item.z, input[index].z);
    assert.equal(item.gain, input[index].gain);
    assert.notEqual(item.y, input[index].y);
    assert.ok(Math.abs(item.x) <= 2.5 && Math.abs(item.y) <= 2.5);
    assert.ok(Math.abs(Math.hypot(item.x, item.y) - 2.5) < 1e-10);
  });
  const narrow = applyChapter([source(0.5, 92)], features, { chapterId: "harmonic", frequencyMin: 90, frequencyMax: 95 });
  assert.equal(narrow[0].frequency, 92);
  assert.equal(narrow[0].harmonicPartial, null);
});

test("texture widens spatial spread with measured penumbra while preserving amplitude", () => {
  const input = [source(0.5, 2500)];
  const narrow = applyChapter(input, { width: 100, penumbraWidth: 0 }, { chapterId: "texture" });
  const broad = applyChapter(input, { width: 100, penumbraWidth: 10 }, { chapterId: "texture" });
  assert.equal(narrow[0].waveform, "noise");
  assert.equal(narrow[0].frequency, 2500);
  assert.ok(broad[0].spread > narrow[0].spread);
  assert.ok(broad[0].spread <= 1);
  assert.equal(broad[0].gain, input[0].gain);
  assert.notEqual(broad[0].x, input[0].x);
  assert.equal(input[0].spread, 0.2);
  const outer = applyChapter([{ ...source(0.5, 2500), x: 2.5, y: -3.4 }], features, { chapterId: "texture" });
  assert.equal(outer[0].x, 2.875, "Core texture expands an outer source instead of clamping to the former room width");
  assert.equal(outer[0].y, -3.5, "texture expansion stays within the 7 m room");
});

test("all three waveforms remain available with every organization", () => {
  for (const chapter of CHAPTERS) {
    for (const waveform of WAVEFORMS) {
      const result = applyChapter([source(0.5, 1000)], features, { chapterId: chapter.id, waveform });
      assert.equal(result[0].waveform, waveform);
      assert.equal(result[0].organization, chapter.organization);
      assert.ok(Number.isFinite(result[0].frequency));
    }
  }
  assert.deepEqual(applyChapter([], features), []);
});
