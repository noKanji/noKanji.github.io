


import { getProgress, saveProgress, toggleFavorite, exportProgress, importProgress, clearProgress, cacheLearningData, readCachedLearningData } from "./storage.js";
import { scheduleReview, isDue, isDifficult, buildReviewQueue, RESULTS } from "./scheduler.js";
import { normalizeCardData } from "./data.js";

const state = { cards: [], route: "library", session: null, randomId: null, usingCache: false };
const $ = id => document.getElementById(id);
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const has = value => value !== null && value !== undefined && String(value).trim() !== "";

function normalizeItem(source) {
  const card = normalizeCardData(source);
  if (!card) return null;
  card.progress = getProgress(card.id);
  return card;
}

function normalizeItems(items) {
  const seen = new Set();
  return items.reduce((list, source) => {
    const card = normalizeItem(source);
    if (!card) return list;
    if (seen.has(card.id)) { console.warn(`Дублирующийся id «${card.id}» пропущен.`); return list; }
    seen.add(card.id); list.push(card); return list;
  }, []);
}

function validImageUrl(value) {
  if (!value) return null;
  try { const url = new URL(value, location.href); return url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "localhost") ? url.href : null; }
  catch { return null; }
}

async function loadCards(force = false) {
  showView("loading");
  const configured = CONFIG.API_URL && CONFIG.API_URL !== "PASTE_GOOGLE_APPS_SCRIPT_URL_HERE";
  try {
    if (!configured) throw new Error("Укажите URL Google Apps Script в config.js.");
    const response = await fetch(CONFIG.API_URL, { cache: force ? "reload" : "no-cache", redirect: "follow" });
    if (!response.ok) throw new Error(`API вернул код ${response.status}.`);
    const payload = await response.json();
    if (!payload?.success || !Array.isArray(payload.items)) throw new Error(payload?.error || "API вернул неверный формат данных.");
    state.cards = normalizeItems(payload.items); state.usingCache = false; cacheLearningData(payload.items);
    setBanner("");
  } catch (error) {
    const cached = readCachedLearningData();
    if (cached) {
      state.cards = normalizeItems(cached.items); state.usingCache = true;
      setBanner(`Источник временно недоступен. Показана сохранённая версия от ${formatDate(cached.savedAt)}.`);
      console.warn(error);
    } else {
      state.cards = []; setBanner(error.message, true);
    }
  }
  populateFilters(); routeTo("library");
}

function setBanner(message, isError = false) {
  const banner = $("offline-banner"); banner.hidden = !message; banner.textContent = message;
  banner.style.borderColor = isError ? "#d2aaa6" : "";
}

function showView(name) {
  document.querySelectorAll(".view").forEach(view => view.classList.toggle("active", view.id === `${name}-view`));
}

function routeTo(route) {
  state.route = route;
  document.querySelectorAll(".bottom-nav button").forEach(button => button.classList.toggle("active", button.dataset.route === route));
  if (route === "library") { showView("library"); renderLibrary(); }
  else if (route === "learn") startSession("learn", state.cards.filter(card => card.progress.status === "new"));
  else if (route === "review") startSession("review", buildReviewQueue(state.cards));
  else if (route === "random") { showView("random"); renderRandom(); }
  else if (route === "hard") { showView("hard"); renderHard(); }
  window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

function populateSelect(select, values, firstLabel) {
  const current = select.value; select.replaceChildren(new Option(firstLabel, ""));
  [...new Set(values.filter(has))].sort((a,b) => a.localeCompare(b, "ru")).forEach(value => select.add(new Option(value, value)));
  select.value = [...select.options].some(option => option.value === current) ? current : "";
}

function populateFilters() {
  const jlpt = state.cards.map(card => card.jlpt), lessons = state.cards.map(card => card.lesson);
  populateSelect($("jlpt-filter"), jlpt, "Все JLPT"); populateSelect($("lesson-filter"), lessons, "Все уроки");
  populateSelect($("random-jlpt"), jlpt, "Любой JLPT"); populateSelect($("random-lesson"), lessons, "Любой урок");
}

function statusFor(card) {
  if (isDifficult(card.progress)) return ["hard", "Сложная"];
  if (card.progress.favorite) return ["favorite", "Избранная"];
  if (card.progress.status === "learning") return ["learning", "Изучается"];
  return ["new", "Новая"];
}

function createMiniCard(card) {
  const [status, label] = statusFor(card);
  const button = el("button", "mini-card"); button.type = "button"; button.setAttribute("aria-label", `${card.kanji}: ${card.meaning || "без значения"}`);
  const dot = el("span", `status-dot ${status}`); dot.title = label; dot.setAttribute("aria-hidden", "true");
  button.append(dot, el("span", "mini-kanji", card.kanji), el("strong", "", card.meaning || "Без значения"));
  if (card.onyomi) button.append(el("small", "", `Он: ${card.onyomi}`));
  if (card.kunyomi) button.append(el("small", "", `Кун: ${card.kunyomi}`));
  if (card.lesson || card.jlpt) button.append(el("em", "", [card.lesson, card.jlpt].filter(has).join(" · ")));
  button.addEventListener("click", () => openCard(card)); return button;
}

function filteredCards() {
  const query = $("search-input").value.trim().toLocaleLowerCase("ru");
  const jlpt = $("jlpt-filter").value, lesson = $("lesson-filter").value, status = $("status-filter").value;
  const searchFields = ["kanji","meaning","meaning_extra","onyomi","kunyomi","lesson","jlpt"];
  return state.cards.filter(card => {
    const matchesQuery = !query || searchFields.some(field => card[field].toLocaleLowerCase("ru").includes(query));
    const matchesStatus = !status || (status === "hard" ? isDifficult(card.progress) : status === "favorite" ? card.progress.favorite : card.progress.status === status);
    return matchesQuery && (!jlpt || card.jlpt === jlpt) && (!lesson || card.lesson === lesson) && matchesStatus;
  });
}

function renderLibrary() {
  const due = state.cards.filter(card => isDue(card.progress)).length;
  const values = [[state.cards.length,"Всего"],[state.cards.filter(c=>c.progress.status==="learning").length,"Изучаемые"],[due,"На сегодня"],[state.cards.filter(c=>isDifficult(c.progress)).length,"Сложные"]];
  $("stats").replaceChildren(...values.map(([value,label]) => { const node=el("div","stat"); node.append(el("strong","",String(value)),el("span","",label)); return node; }));
  const cards = filteredCards(); $("library-grid").replaceChildren(...cards.map(createMiniCard));
  const empty = $("library-empty"); empty.hidden = cards.length > 0;
  if (!cards.length) empty.textContent = state.cards.length ? "По этим условиям ничего не найдено." : "В таблице пока нет активных карточек. Добавьте первую строку на лист Kanji.";
}

function addInfoSection(parent, title, pairs) {
  const visible = pairs.filter(([,value]) => has(value)); if (!visible.length) return;
  const section = el("section", "card-section"), grid = el("div", "info-grid"); section.append(el("h4", "", title));
  visible.forEach(([label,value]) => { const pair=el("div","info-pair"); pair.append(el("span","",label),el("strong","",value)); grid.append(pair); }); section.append(grid); parent.append(section);
}

function addExamples(parent, title, items, sentence = false) {
  const visible = items.filter(item => has(item.main)); if (!visible.length) return;
  const section=el("details","card-section card-details"), list=el("div",sentence?"sentence-list":"word-strip"); section.append(el("summary","",title));
  visible.forEach(item => { const row=el("div",sentence?"sentence":"word-row"); row.append(el("span","word-main",item.main)); if(item.reading)row.append(el("span","reading",item.reading)); if(item.translation)row.append(el("span","translation",item.translation)); list.append(row); }); section.append(list); parent.append(section);
}

function createFullCard(card, { interactive = true } = {}) {
  const root=el("article","full-card"), hero=el("header","kanji-hero"); hero.append(el("div","kanji-glyph",card.kanji),el("h3","",card.meaning||"Без значения")); if(card.meaning_extra)hero.append(el("p","",card.meaning_extra)); root.append(hero);
  addInfoSection(root,"Чтения",[["Онъёми",card.onyomi],["Кунъёми",card.kunyomi]]); addInfoSection(root,"Строение",[["Компоненты",card.components],["Количество черт",card.stroke_count]]);
  addExamples(root,"Примеры слов",card.wordItems);
  const imageUrl=validImageUrl(card.image_url);
  if(imageUrl){const section=el("details","card-section card-details"),figure=el("figure","mnemonic-figure"),frame=el("div","image-frame"); section.append(el("summary","","Мнемоника и происхождение")); frame.append(el("span","","Загрузка изображения…")); const img=el("img"); img.src=imageUrl; img.alt=`Мнемоника и происхождение: ${card.kanji}`; img.loading="lazy"; img.width=1200; img.height=900; img.addEventListener("load",()=>frame.classList.add("loaded")); img.addEventListener("error",()=>{frame.classList.add("failed");frame.firstChild.textContent="Изображение временно недоступно."}); frame.append(img); figure.append(frame); section.append(figure); root.append(section)}
  addExamples(root,"Примеры предложений",card.exampleItems,true);
  const footer=el("section","card-section"),tags=el("div","card-meta"); [[card.lesson],[card.jlpt],[card.date_added?`Добавлено: ${formatDate(card.date_added)}`:""]].filter(([v])=>has(v)).forEach(([v])=>tags.append(el("span","tag",v))); footer.append(tags);
  if(interactive){const fav=el("button","secondary-button favorite-button",card.progress.favorite?"★ В избранном":"☆ В избранное"); fav.type="button"; fav.addEventListener("click",()=>{card.progress=toggleFavorite(card.id);fav.textContent=card.progress.favorite?"★ В избранном":"☆ В избранное";renderLibrary()});footer.append(fav)}
  const progress=el("p","progress-copy",progressText(card.progress)); footer.append(progress); root.append(footer); return root;
}

function progressText(progress) {
  if (!progress.reviews) return "Карточка ещё не изучалась.";
  const rate = Math.round((progress.correct / progress.reviews) * 100);
  return `Повторений: ${progress.reviews} · Успешность: ${rate}% · Следующее: ${formatDate(progress.nextReview)}`;
}

function openCard(card) { $("dialog-content").replaceChildren(createFullCard(card)); $("dialog-title").textContent=`${card.kanji} · ${card.meaning||"Карточка"}`; openDialog($("card-dialog")); }
function openDialog(dialog){document.body.style.overflow="hidden";dialog.showModal();}
function closeDialog(dialog){dialog.close();document.body.style.overflow="";}

function startSession(mode, cards) {
  showView("session");
  state.session={mode,queue:[...cards],index:0,revealed:false,locked:false,stats:{again:0,hard:0,good:0,easy:0}};
  $("session-title").textContent=mode==="learn"?"Учить":mode==="hard"?"Сложные":"Повторить";
  $("session-kicker").textContent=mode==="learn"?"Новые карточки":"Учебная сессия"; renderSession();
}

function renderSession() {
  const session=state.session, content=$("session-content");
  if(!session||session.index>=session.queue.length){renderCompletion();return}
  const card=session.queue[session.index]; $("session-progress").textContent=`${session.index+1} из ${session.queue.length}`;
  if(!session.revealed){const prompt=el("div","study-prompt");prompt.append(el("div","study-kanji",card.kanji),el("p","","Назовите значение и чтение"));const reveal=el("button","primary-button","Показать карточку");reveal.type="button";reveal.addEventListener("click",()=>{session.revealed=true;renderSession()});prompt.append(reveal);content.replaceChildren(prompt);return}
  const ratings=el("div","rating-buttons"); Object.entries(RESULTS).forEach(([result,meta])=>{const button=el("button","",meta.label);button.type="button";button.dataset.result=result;button.addEventListener("click",()=>rateCard(card,result));ratings.append(button)});content.replaceChildren(createFullCard(card),ratings);
}

function rateCard(card,result){const session=state.session;if(session.locked)return;session.locked=true;document.querySelectorAll(".rating-buttons button").forEach(b=>b.disabled=true);card.progress=scheduleReview(card.progress,result);saveProgress(card.progress);session.stats[result]+=1;showToast(`Сохранено: ${RESULTS[result].label}`);setTimeout(()=>{session.index+=1;session.revealed=false;session.locked=false;renderSession()},420)}

function renderCompletion(){const session=state.session;$("session-progress").textContent="";const box=el("div","completion");box.append(el("h3","","Повторение завершено"),el("p","",`Просмотрено: ${session.queue.length}`));const stats=el("div","completion-stats");Object.entries(RESULTS).forEach(([key,meta])=>stats.append(el("span","",`${meta.label}: ${session.stats[key]}`)));const back=el("button","primary-button","В библиотеку");back.type="button";back.addEventListener("click",()=>routeTo("library"));box.append(stats,back);$("session-content").replaceChildren(box)}

function randomPool(){const scope=$("random-scope").value,jlpt=$("random-jlpt").value,lesson=$("random-lesson").value;return state.cards.filter(card=>(scope==="all"||(scope==="learning"&&card.progress.status==="learning")||(scope==="new"&&card.progress.status==="new")||(scope==="hard"&&isDifficult(card.progress))||(scope==="favorite"&&card.progress.favorite))&&(!jlpt||card.jlpt===jlpt)&&(!lesson||card.lesson===lesson))}
function renderRandom(){const pool=randomPool();if(!pool.length){$("random-content").replaceChildren(el("div","empty-state","По выбранным условиям карточек нет."));state.randomId=null;return}const candidates=pool.length>1?pool.filter(c=>c.id!==state.randomId):pool;const card=candidates[Math.floor(Math.random()*candidates.length)];state.randomId=card.id;$("random-content").replaceChildren(createFullCard(card))}
function renderHard(){const cards=state.cards.filter(card=>isDifficult(card.progress));$("hard-grid").replaceChildren(...cards.map(createMiniCard));$("hard-empty").hidden=cards.length>0;$("practice-hard").disabled=!cards.length}
function formatDate(value){if(!value)return"не назначено";const date=new Date(value);return Number.isNaN(date.getTime())?String(value):new Intl.DateTimeFormat("ru-RU",{dateStyle:"medium",timeStyle:value.includes?.("T")?"short":undefined}).format(date)}
function showToast(message){const toast=$("toast");toast.textContent=message;toast.hidden=false;clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.hidden=true,1500)}

document.querySelectorAll(".bottom-nav button").forEach(button=>button.addEventListener("click",()=>routeTo(button.dataset.route)));
["search-input","jlpt-filter","lesson-filter","status-filter"].forEach(id=>$(id).addEventListener(id==="search-input"?"input":"change",renderLibrary));
["random-scope","random-jlpt","random-lesson"].forEach(id=>$(id).addEventListener("change",renderRandom));
$("random-next").addEventListener("click",renderRandom);$("refresh-button").addEventListener("click",()=>loadCards(true));$("session-exit").addEventListener("click",()=>routeTo("library"));$("practice-hard").addEventListener("click",()=>startSession("hard",state.cards.filter(c=>isDifficult(c.progress))));
$("dialog-close").addEventListener("click",()=>closeDialog($("card-dialog")));$("settings-button").addEventListener("click",()=>openDialog($("settings-dialog")));$("settings-close").addEventListener("click",()=>closeDialog($("settings-dialog")));
[$("card-dialog"),$("settings-dialog")].forEach(dialog=>dialog.addEventListener("close",()=>document.body.style.overflow=""));
document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  const activeDialog = document.querySelector("dialog[open]");
  if (activeDialog) { event.preventDefault(); closeDialog(activeDialog); }
});
$("export-button").addEventListener("click",exportProgress);$("import-input").addEventListener("change",async event=>{try{await importProgress(event.target.files[0]);await loadCards();$("settings-message").textContent="Прогресс импортирован."}catch(error){$("settings-message").textContent=error.message}event.target.value=""});
$("clear-button").addEventListener("click",()=>{if(confirm("Удалить весь локальный прогресс? Это действие нельзя отменить.")){clearProgress();state.cards.forEach(card=>card.progress=getProgress(card.id));renderLibrary();$("settings-message").textContent="Прогресс очищен."}});
window.addEventListener("online",()=>setBanner(state.usingCache?"Соединение восстановлено. Нажмите «Обновить», чтобы получить свежие данные.":""));window.addEventListener("offline",()=>setBanner("Нет сети. Доступна сохранённая версия приложения и ранее загруженные данные."));
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(error=>console.warn("Service Worker не зарегистрирован",error)));
loadCards();






