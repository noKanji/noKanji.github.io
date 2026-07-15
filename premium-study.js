const CARD_TITLES = {
  words: "Примеры слов",
  examples: "Примеры предложений",
  mnemonic: "Мнемоника и происхождение"
};

function directDetails(card) {
  return [...card.children].filter(node => node.matches?.("details.card-details"));
}

function detailByTitle(card, title) {
  return directDetails(card).find(section => section.querySelector("summary")?.textContent.trim() === title);
}

function readingFromCard(card) {
  const pairs = [...card.querySelectorAll(":scope > .card-section .info-pair")];
  const pair = pairs.find(node => node.querySelector("span")?.textContent.trim() === "Кунъёми");
  return pair?.querySelector("strong")?.textContent.trim().split(/[、,・]/)[0] || "";
}

function enhanceHero(card) {
  const hero = card.querySelector(":scope > .kanji-hero");
  if (!hero || hero.querySelector(".hero-reading")) return;
  const glyph = hero.querySelector(".kanji-glyph");
  const meaning = hero.querySelector("h3");
  const extra = hero.querySelector("p");
  const reading = readingFromCard(card);
  if (reading) {
    const line = document.createElement("span");
    line.className = "hero-reading";
    line.textContent = reading;
    glyph.after(line);
  }
  if (meaning && extra?.textContent.trim()) {
    const extraParts = extra.textContent.split(",").map(value => value.trim()).filter(Boolean);
    const shortExtra = extraParts.at(-1);
    if (shortExtra) meaning.textContent = `${meaning.textContent.trim()} · ${shortExtra}`;
  }
}

function enhanceDetails(card) {
  const words = detailByTitle(card, CARD_TITLES.words);
  const examples = detailByTitle(card, CARD_TITLES.examples);
  const mnemonic = detailByTitle(card, CARD_TITLES.mnemonic);

  directDetails(card).forEach(section => { section.open = true; });
  if (words) words.classList.add("premium-words");
  if (examples) {
    examples.classList.add("premium-examples");
    examples.querySelector("summary").textContent = "Примеры";
  }
  if (mnemonic) {
    mnemonic.classList.add("premium-mnemonic");
    mnemonic.querySelector("summary").textContent = "Мнемоника";
  }
  if (words && examples) words.after(examples);
  if (examples && mnemonic) examples.after(mnemonic);
}

function enhanceCard(card) {
  if (!(card instanceof HTMLElement) || card.dataset.premiumReady === "true") return;
  card.classList.add("premium-card");
  enhanceHero(card);
  enhanceDetails(card);
  const footer = [...card.children].find(node => node.matches?.("section.card-section:last-child"));
  footer?.classList.add("card-footer");
  card.dataset.premiumReady = "true";
}

function addStageBar(content) {
  const card = [...content.children].find(node => node.matches?.(".full-card"));
  const existing = content.querySelector(":scope > .card-stage-bar");
  if (!card) { existing?.remove(); return; }
  if (existing) return;

  const progress = document.getElementById("session-progress")?.textContent.trim();
  const bar = document.createElement("div");
  bar.className = "card-stage-bar";
  const label = document.createElement("span");
  label.textContent = progress ? `Карточка ${progress}` : "Карточка";
  const close = document.createElement("button");
  close.className = "card-stage-close";
  close.type = "button";
  close.setAttribute("aria-label", "Закрыть карточку");
  close.textContent = "×";
  close.addEventListener("click", () => document.getElementById("session-exit")?.click());
  bar.append(label, close);
  content.prepend(bar);
}

function enhanceInterface(root = document) {
  root.querySelectorAll?.(".full-card").forEach(enhanceCard);
  const sessionContent = document.getElementById("session-content");
  if (sessionContent) addStageBar(sessionContent);
  const dialog = document.getElementById("card-dialog");
  if (dialog?.open && dialog.querySelector(".full-card")) {
    const title = document.getElementById("dialog-title");
    if (title && title.textContent !== "Карточка") title.textContent = "Карточка";
  }
}

const premiumObserver = new MutationObserver(records => {
  records.forEach(record => record.addedNodes.forEach(node => {
    if (!(node instanceof HTMLElement)) return;
    if (node.matches(".full-card")) enhanceCard(node);
    node.querySelectorAll?.(".full-card").forEach(enhanceCard);
  }));
  enhanceInterface();
});

premiumObserver.observe(document.body, { childList: true, subtree: true });
enhanceInterface();
