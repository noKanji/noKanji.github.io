import { defaultProgress } from "./scheduler.js";

const PROGRESS_KEY = "kanji-trainer-progress-v1";
const DATA_CACHE_KEY = "kanji-trainer-data-cache-v1";

function safeParse(raw, fallback) {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch (error) {
    console.warn("Повреждённые локальные данные проигнорированы.", error);
    return fallback;
  }
}

export function readAllProgress() {
  const value = safeParse(localStorage.getItem(PROGRESS_KEY), {});
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function getProgress(id) {
  const saved = readAllProgress()[id];
  return { ...defaultProgress(id), ...(saved && typeof saved === "object" ? saved : {}), id: String(id) };
}

export function saveProgress(progress) {
  const all = readAllProgress();
  all[progress.id] = { ...defaultProgress(progress.id), ...progress };
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
  return all[progress.id];
}

export function toggleFavorite(id) {
  const progress = getProgress(id);
  progress.favorite = !progress.favorite;
  return saveProgress(progress);
}

export function clearProgress() { localStorage.removeItem(PROGRESS_KEY); }

export function exportProgress() {
  const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), progress: readAllProgress() }, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `kanji-progress-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export async function importProgress(file) {
  const parsed = safeParse(await file.text(), null);
  const source = parsed?.progress ?? parsed;
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("Файл не содержит корректного прогресса.");
  const clean = {};
  Object.entries(source).forEach(([id, value]) => {
    if (!id || !value || typeof value !== "object") return;
    clean[id] = { ...defaultProgress(id), ...value, id: String(id) };
  });
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(clean));
  return clean;
}

export function cacheLearningData(items) {
  localStorage.setItem(DATA_CACHE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), items }));
}

export function readCachedLearningData() {
  const cached = safeParse(localStorage.getItem(DATA_CACHE_KEY), null);
  return cached?.items && Array.isArray(cached.items) ? cached : null;
}
