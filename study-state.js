import { CHAPTERS, getChapter, normalizeSoundSettings } from "./chapters.js";

// Stable chapter IDs retain the old III/IV settings when those chapters move.
// Removed chapters and sound options never return through persisted state.
export function migrateStudy(saved) {
  const input = saved && typeof saved === "object" ? saved : {};
  const stored = input.settings && typeof input.settings === "object" ? input.settings : {};
  const settings = Object.fromEntries(CHAPTERS.map(chapter => [chapter.id,
    normalizeSoundSettings({ ...chapter, ...stored[chapter.id], chapterId: chapter.id })]));
  return { version: 2, chapterId: getChapter(input.chapterId).id, settings };
}
