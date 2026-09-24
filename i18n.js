const STORAGE_KEY = "desymmetrical-core-language";
const listeners = new Set();
const originals = new WeakMap();
const boundButtons = new WeakSet();
let language = "en";
try {
  if (globalThis.localStorage?.getItem(STORAGE_KEY) === "ja") language = "ja";
} catch { /* Language switching also works when browser storage is unavailable. */ }

export const getLanguage = () => language;
export const tr = (japanese, english) => language === "en" ? english : japanese;
export function onLanguageChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function translateDocument() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = language;
  for (const element of document.querySelectorAll("[data-en]")) {
    if (!originals.has(element)) originals.set(element, { text: element.textContent });
    element.textContent = tr(originals.get(element).text, element.getAttribute("data-en"));
  }
  for (const attribute of ["aria-label", "title", "placeholder", "content"]) {
    for (const element of document.querySelectorAll(`[data-en-${attribute}]`)) {
      if (!originals.has(element)) originals.set(element, {});
      const original = originals.get(element);
      if (!(attribute in original)) original[attribute] = element.getAttribute(attribute);
      const value = tr(original[attribute], element.getAttribute(`data-en-${attribute}`));
      if (value === null) element.removeAttribute(attribute);
      else element.setAttribute(attribute, value);
    }
  }
  for (const button of document.querySelectorAll("[data-language-button]")) {
    button.setAttribute("aria-pressed", String(button.dataset.languageButton === language));
    if (!boundButtons.has(button)) {
      button.addEventListener("click", () => setLanguage(button.dataset.languageButton));
      boundButtons.add(button);
    }
  }
}

export function setLanguage(next) {
  if (!["ja", "en"].includes(next)) return;
  const changed = next !== language;
  language = next;
  try { globalThis.localStorage?.setItem(STORAGE_KEY, language); } catch {}
  if (!changed) return;
  translateDocument();
  for (const callback of listeners) callback(language);
}

translateDocument();
