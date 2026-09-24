import { getLanguage, onLanguageChange } from "./i18n.js";

// One-way observations keep the installation model independent of browser audio.
export function initSpatialIntegration(readAnalysis) {
  const frame = document.getElementById("spatial-study-frame");
  const section = document.getElementById("spatial-study");
  if (!frame || !section) return;
  let ready = false, visible = false, loaded = false;
  const send = message => frame.contentWindow?.postMessage(message, location.origin);
  const sendVisibility = () => send({ type: "core-spatial-visibility", visible: visible && !document.hidden });
  const sendLanguage = () => send({ type: "core-spatial-language", language: getLanguage() });
  const start = () => {
    if (loaded) return;
    loaded = true;
    frame.src = `./spatial/index.html?embedded=1&lang=${getLanguage()}`;
  };
  const preload = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) { start(); preload.disconnect(); }
  }, { rootMargin: "500px" });
  const visibility = new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting);
    if (ready) sendVisibility();
  });
  preload.observe(frame);
  visibility.observe(frame);
  window.addEventListener("message", event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || !event.data) return;
    if (event.data.type === "core-spatial-ready") {
      ready = true;
      section.classList.add("is-loaded");
      frame.setAttribute("aria-busy", "false");
      sendLanguage();
      sendVisibility();
    }
    if (event.data.type === "core-spatial-resize") {
      const height = event.data.height;
      if (typeof height === "number" && Number.isFinite(height) && height >= 300 && height <= 24000) frame.style.height = `${Math.ceil(height)}px`;
    }
  });
  onLanguageChange(sendLanguage);
  document.addEventListener("visibilitychange", sendVisibility);
  const timer = setInterval(() => {
    if (ready && visible && !document.hidden) send({ type: "core-analysis", payload: readAnalysis() });
  }, 250);
  window.addEventListener("pagehide", event => {
    if (event.persisted) return;
    clearInterval(timer);
    preload.disconnect();
    visibility.disconnect();
  });
}
