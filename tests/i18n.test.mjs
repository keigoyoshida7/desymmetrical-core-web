import test from "node:test";
import assert from "node:assert/strict";

test("language preference survives reload without changing saved sound settings", async () => {
  const savedSound = '{"chapterId":"interference","frequencyMin":220}';
  const data = new Map([["desymmetrical-core-study-v1", savedSound]]);
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  }});
  try {
    const first = await import("../i18n.js?test=initial");
    assert.equal(first.getLanguage(), "en");
    const changes = [];
    const unsubscribe = first.onLanguageChange(language => changes.push(language));
    first.setLanguage("ja");
    assert.equal(first.tr("sin波", "Sine wave"), "sin波");
    first.setLanguage("en");
    first.setLanguage("unsupported");
    assert.deepEqual(changes, ["ja", "en"]);
    const reloaded = await import("../i18n.js?test=reloaded");
    assert.equal(reloaded.getLanguage(), "en");
    first.setLanguage("ja");
    assert.equal(first.tr("sin波", "Sine wave"), "sin波");
    assert.equal(data.get("desymmetrical-core-study-v1"), savedSound);
    unsubscribe();
    first.setLanguage("en");
    assert.deepEqual(changes, ["ja", "en", "ja"]);
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
    else delete globalThis.localStorage;
  }
});

test("language switching remains available when storage is blocked", async () => {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("Storage blocked"); } });
  try {
    const locale = await import("../i18n.js?test=blocked-storage");
    locale.setLanguage("en");
    assert.equal(locale.tr("停止", "Stop"), "Stop");
    locale.setLanguage("ja");
    assert.equal(locale.tr("停止", "Stop"), "停止");
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
    else delete globalThis.localStorage;
  }
});

test("clicking the active language preserves live controls; switching restores runtime labels after static text", async () => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const label = { textContent: "ブラウザで試聴", getAttribute: () => "Start audio" };
  const document = { documentElement: {}, querySelectorAll: selector => selector === "[data-en]" ? [label] : [] };
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  try {
    const locale = await import("../i18n.js?test=active-control");
    assert.equal(label.textContent, "Start audio");
    label.textContent = "Mute audio";
    locale.onLanguageChange(() => { label.textContent = locale.tr("音をミュート", "Mute audio"); });
    locale.setLanguage("en");
    assert.equal(label.textContent, "Mute audio");
    locale.setLanguage("ja");
    assert.equal(label.textContent, "音をミュート");
    assert.equal(document.documentElement.lang, "ja");
    locale.setLanguage("en");
    assert.equal(label.textContent, "Mute audio");
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else delete globalThis.document;
  }
});
