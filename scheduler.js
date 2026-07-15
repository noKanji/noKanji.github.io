export const RESULTS = Object.freeze({
  again: { label: "Не помню", tone: "danger" },
  hard: { label: "Трудно", tone: "warning" },
  good: { label: "Помню", tone: "success" },
  easy: { label: "Легко", tone: "primary" }
});

const DAY_MS = 86_400_000;
const TEN_MINUTES_MS = 600_000;

export function defaultProgress(id) {
  return {
    id: String(id), status: "new", favorite: false, difficulty: "normal",
    reviews: 0, correct: 0, mistakes: 0, lastResult: null,
    lastReviewed: null, nextReview: null, intervalDays: 0
  };
}

export function scheduleReview(progress, result, now = new Date()) {
  const current = { ...defaultProgress(progress.id), ...progress };
  const next = { ...current, status: "learning", reviews: current.reviews + 1,
    lastResult: result, lastReviewed: now.toISOString() };
  let intervalDays = Number(current.intervalDays) || 0;
  let delayMs;

  if (result === "again") {
    next.mistakes = current.mistakes + 1;
    next.difficulty = "hard";
    intervalDays = Math.min(intervalDays * 0.25, 0.007);
    delayMs = TEN_MINUTES_MS;
  } else if (result === "hard") {
    next.difficulty = "hard";
    intervalDays = 1;
    delayMs = DAY_MS;
  } else if (result === "good") {
    next.correct = current.correct + 1;
    next.difficulty = current.difficulty === "hard" && next.correct >= 3 ? "normal" : current.difficulty;
    intervalDays = intervalDays > 0 ? Math.max(3, intervalDays * 2) : 3;
    intervalDays = Math.min(90, Math.round(intervalDays));
    delayMs = intervalDays * DAY_MS;
  } else if (result === "easy") {
    next.correct = current.correct + 1;
    next.difficulty = "normal";
    intervalDays = intervalDays > 0 ? Math.max(7, intervalDays * 2.5) : 7;
    intervalDays = Math.min(90, Math.round(intervalDays));
    delayMs = intervalDays * DAY_MS;
  } else {
    throw new Error(`Неизвестный результат: ${result}`);
  }

  next.intervalDays = intervalDays;
  next.nextReview = new Date(now.getTime() + delayMs).toISOString();
  return next;
}

export function isDue(progress, now = new Date()) {
  if (!progress?.nextReview) return false;
  const timestamp = Date.parse(progress.nextReview);
  return Number.isFinite(timestamp) && timestamp <= now.getTime();
}

export function isDifficult(progress) {
  if (!progress) return false;
  const reviews = Number(progress.reviews) || 0;
  const correct = Number(progress.correct) || 0;
  const successRate = reviews ? correct / reviews : 1;
  return progress.difficulty === "hard" || Number(progress.mistakes) >= 2 || (reviews >= 3 && successRate < 0.6);
}

export function buildReviewQueue(cards, now = new Date()) {
  const shuffle = (items) => items.map(value => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort).map(item => item.value);
  return [...cards].filter(card => isDue(card.progress, now)).sort((a, b) => {
    const overdueA = Date.parse(a.progress.nextReview) < now.getTime() - DAY_MS ? 0 : 1;
    const overdueB = Date.parse(b.progress.nextReview) < now.getTime() - DAY_MS ? 0 : 1;
    if (overdueA !== overdueB) return overdueA - overdueB;
    const mistakes = (b.progress.mistakes || 0) - (a.progress.mistakes || 0);
    return mistakes || Math.random() - 0.5;
  });
}
