let RECIPES = [];
let activeIngredients = new Set();
let searchTerm = "";
let sortedByKcal = false;
let currentView = "all"; // all | want | staple
let homeStock = [];      // 🏠 いま家にあるもの（pantry.json・CORIN管理／買い物リストからも自動除外）
let freshStock = [];     // 🧾 最近買ったもの（下記2ソースを合成／数日で自動フェード）
const FRESH_DAYS = 6;    // 買ってから何日「手持ち」とみなすか（生鮮の消費想定）
let jsonBuys = [];       // recent-buys.json（CORINがレシートから追記）
const BUYS_KEY = "recipe-site-buys"; // 📸 サイトで手動追加した買ったもの（携帯・localStorage）
const loadBuys = () => { try { return JSON.parse(localStorage.getItem(BUYS_KEY)) || []; } catch { return []; } };
const saveBuys = (a) => localStorage.setItem(BUYS_KEY, JSON.stringify(a));
const withinFresh = (d) => (Date.now() - new Date(d).getTime()) / 86400000 <= FRESH_DAYS;
// recent-buys.json（CORIN）＋localStorage（サイト手動追加）を合成し、FRESH_DAYS以内だけ手持ちに。
function computeFresh() {
  const all = [...jsonBuys, ...loadBuys()].filter(b => b && b.item && b.date && withinFresh(b.date));
  freshStock = [...new Set(all.map(b => b.item))];
}

// ---------- storage ----------
const CART_KEY = "recipe-site-cart";     // Map<ingredient, [recipe titles]>
const COOKED_KEY = "recipe-site-cooked"; // Map<recipeId, count>  ← 本命
const WANT_KEY = "recipe-site-want";     // [recipeId]（作りたいストック）
const PANTRY_KEY = "recipe-site-pantry"; // [ingredient]（常備品＝買い物リストから外す）

// 常備品の初期リスト（1回作れば以降ずっと買い物リストから自動で外れる。使いながら育てられる）
const DEFAULT_PANTRY = [
  "塩", "こしょう", "塩こしょう", "砂糖", "醤油", "みそ", "味噌", "酢", "みりん",
  "料理酒", "酒", "サラダ油", "油", "オリーブオイル", "ごま油",
  "マヨネーズ", "ケチャップ", "めんつゆ", "白だし", "和風だし", "だし", "コンソメ",
  "にんにく", "しょうが", "片栗粉", "小麦粉", "バター", "はちみつ"
];

function loadMap(key) {
  try { return new Map(JSON.parse(localStorage.getItem(key) || "[]")); } catch { return new Map(); }
}
function loadSet(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return new Set(v && v.length ? v : (fallback || []));
  } catch { return new Set(fallback || []); }
}

let cart = loadMap(CART_KEY);
let cooked = loadMap(COOKED_KEY);
let want = loadSet(WANT_KEY, []);
let pantry = loadSet(PANTRY_KEY, DEFAULT_PANTRY);

const saveCart = () => localStorage.setItem(CART_KEY, JSON.stringify([...cart]));
const saveCooked = () => localStorage.setItem(COOKED_KEY, JSON.stringify([...cooked]));
const saveWant = () => localStorage.setItem(WANT_KEY, JSON.stringify([...want]));
const savePantry = () => localStorage.setItem(PANTRY_KEY, JSON.stringify([...pantry]));

const STAPLE_THRESHOLD = 3; // 3回作ったら「マイ定番」に昇格
const cookedCount = (id) => cooked.get(id) || 0;
const isStaple = (id) => cookedCount(id) >= STAPLE_THRESHOLD;
const isPantry = (ing) => pantry.has(ing);

// 「作れる」判定：レシピ材料のうち手持ち（常備品＋家の在庫＋買ったもの）に無いもの＝不足。
const MAX_MISSING = 3; // 不足これ以下を「作れる」タブに出す
const STOCK_ALIAS = { "お酢": ["酢"], "麺つゆ": ["めんつゆ"], "ポン酢": ["ぽん酢"] };
const owns = (ing) => isPantry(ing) || freshStock.includes(ing); // 常備品・家の在庫・最近買ったもの
const missingOf = (r) => r.ingredients.filter(i => !owns(i));

// ---------- actions（本命：作りたい♡・作った✓） ----------
function toggleWant(id) {
  if (want.has(id)) want.delete(id); else want.add(id);
  saveWant();
}

function addCooked(id) {
  const before = cookedCount(id);
  cooked.set(id, before + 1);
  saveCooked();
  return before + 1; // 新しい回数
}

function removeCooked(id) {
  const c = cookedCount(id);
  if (c <= 1) cooked.delete(id); else cooked.set(id, c - 1);
  saveCooked();
}

// ---------- 買い物リスト（常備品を自動で除外） ----------
function addRecipeToCart(recipe) {
  let added = 0;
  recipe.ingredients.forEach(ing => {
    if (isPantry(ing)) return; // 常備品は入れない
    const sources = cart.get(ing) || [];
    if (!sources.includes(recipe.title)) sources.push(recipe.title);
    cart.set(ing, sources);
    added++;
  });
  saveCart();
  updateCartCount();
  return added;
}

function removeFromCart(ing) {
  cart.delete(ing);
  saveCart();
  updateCartCount();
  renderCart();
}

function updateCartCount() {
  document.getElementById("cart-count").textContent = cart.size;
}

function toast(msg) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2200);
}

// ---------- 買い物リストモーダル ----------
function renderCart() {
  const items = [...cart.entries()];
  const rows = items.length
    ? items.map(([ing, sources]) => `
      <div class="cart-item-row">
        <span>${ing}<span class="cart-source"> — ${sources.join("・")}</span></span>
        <div class="cart-item-btns">
          <button data-ing="${ing}" class="cart-tostaple" title="これは常備品（今後リストから外す）">🧂常備品に</button>
          <button data-ing="${ing}" class="cart-remove">✕</button>
        </div>
      </div>`).join("")
    : `<p class="empty-hint">まだ空っぽ。「♡作りたい」タブか各レシピから材料を足してね（塩・油とかの常備品は自動で外してるよ）</p>`;

  document.getElementById("cart-content").innerHTML = `
    <button class="modal-close" id="cart-close">✕</button>
    <h2>🛒 買い物リスト</h2>
    ${rows}
    ${items.length ? `
      <div class="cart-actions">
        <button id="cart-line" class="btn-line">📤 LINEで送る</button>
        <button id="cart-copy">📋 コピー</button>
        <button id="cart-clear" class="btn-ghost">全部消す</button>
      </div>` : ""}
  `;
  document.getElementById("cart-close").onclick = () =>
    document.getElementById("cart-overlay").classList.remove("open");

  document.querySelectorAll(".cart-remove").forEach(btn => {
    btn.onclick = () => removeFromCart(btn.dataset.ing);
  });
  document.querySelectorAll(".cart-tostaple").forEach(btn => {
    btn.onclick = () => {
      pantry.add(btn.dataset.ing); // 常備品リストに昇格＝次から自動で外れる（育つ）
      savePantry();
      removeFromCart(btn.dataset.ing);
      toast(`「${btn.dataset.ing}」を常備品に登録。次から買い物リストに出ないよ`);
    };
  });

  if (items.length) {
    const listText = () => "🛒今日の買い物\n" + items.map(([ing]) => "・" + ing).join("\n");
    document.getElementById("cart-line").onclick = () => {
      const url = "https://line.me/R/msg/text/?" + encodeURIComponent(listText());
      window.open(url, "_blank");
    };
    document.getElementById("cart-copy").onclick = () => {
      navigator.clipboard.writeText(items.map(([ing]) => ing).join("\n"));
      const btn = document.getElementById("cart-copy");
      btn.textContent = "✓ コピーした";
      setTimeout(() => { btn.textContent = "📋 コピー"; }, 1500);
    };
    document.getElementById("cart-clear").onclick = () => {
      cart.clear(); saveCart(); updateCartCount(); renderCart();
    };
  }
}

document.getElementById("cart-button").addEventListener("click", () => {
  renderCart();
  document.getElementById("cart-overlay").classList.add("open");
});
document.getElementById("cart-overlay").addEventListener("click", (e) => {
  if (e.target.id === "cart-overlay") e.currentTarget.classList.remove("open");
});

// ---------- init ----------
async function init() {
  const res = await fetch("data.json");
  RECIPES = await res.json();
  try {
    const pres = await fetch("pantry.json");
    if (pres.ok) {
      homeStock = await pres.json();
      // 家にあるもの＝買い物リストから外す＋「作れる」判定の持ち物に加える。
      // レシピ側の表記（酢・めんつゆ）に寄せた別名も入れて突き合わせ精度を上げる。
      homeStock.forEach(i => { pantry.add(i); (STOCK_ALIAS[i] || []).forEach(a => pantry.add(a)); });
    }
  } catch { /* pantry.json が無くても動く */ }
  try {
    const bres = await fetch("recent-buys.json");
    if (bres.ok) jsonBuys = await bres.json();
  } catch { /* recent-buys.json が無くても動く */ }
  computeFresh(); // recent-buys.json ＋ サイト手動追加(localStorage) を合成
  updateCartCount();
  renderPantryBar();
  renderTabs();
  renderChips();
  renderGrid();
}

// ---------- 🏠 いま家にあるもの ----------
function renderPantryBar() {
  const el = document.getElementById("pantry-bar");
  if (!el) return;
  if (!homeStock.length && !freshStock.length) { el.innerHTML = ""; return; }
  let html = "";
  if (homeStock.length) {
    html += `<span class="pantry-bar-label">🏠 いま家にあるもの</span>` +
      homeStock.map(i => `<span class="pantry-pill">${i}</span>`).join("");
  }
  if (freshStock.length) {
    html += `<span class="pantry-break"></span>` +
      `<span class="pantry-bar-label fresh">🧾 最近買ったもの</span>` +
      freshStock.map(i => `<span class="pantry-pill fresh">${i}</span>`).join("");
  }
  html += `<span class="pantry-bar-hint">レシート貼ってくれたら🧾に反映するよ</span>`;
  el.innerHTML = html;
}

// ---------- タブ（すべて / 作りたい / マイ定番） ----------
function renderTabs() {
  const wantN = RECIPES.filter(r => want.has(r.id)).length;
  const stapleN = RECIPES.filter(r => isStaple(r.id)).length;
  const cookableN = RECIPES.filter(r => missingOf(r).length <= MAX_MISSING).length;
  document.querySelectorAll(".tab").forEach(tab => {
    const v = tab.dataset.view;
    tab.classList.toggle("active", v === currentView);
    if (v === "want") tab.innerHTML = `♡ 作りたい <span class="tab-n">${wantN}</span>`;
    if (v === "staple") tab.innerHTML = `⭐ マイ定番 <span class="tab-n">${stapleN}</span>`;
    if (v === "cookable") tab.innerHTML = `🍳 作れる <span class="tab-n">${cookableN}</span>`;
  });
}

let chipsExpanded = false;

function ingredientCounts() {
  const counts = new Map();
  RECIPES.forEach(r => r.ingredients.forEach(i => counts.set(i, (counts.get(i) || 0) + 1)));
  return counts;
}

function makeChip(ing) {
  const chip = document.createElement("span");
  chip.className = "chip" + (activeIngredients.has(ing) ? " active" : "");
  chip.textContent = ing;
  chip.onclick = () => {
    if (activeIngredients.has(ing)) activeIngredients.delete(ing);
    else activeIngredients.add(ing);
    renderChips();
    renderGrid();
  };
  return chip;
}

function renderChips() {
  const el = document.getElementById("chips");
  el.innerHTML = "";
  const counts = ingredientCounts();
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"));
  const POPULAR_THRESHOLD = RECIPES.length > 20 ? 3 : 2;
  const popular = sorted.filter(([, n]) => n >= POPULAR_THRESHOLD).map(([ing]) => ing);
  const rest = sorted.filter(([, n]) => n < POPULAR_THRESHOLD).map(([ing]) => ing);

  const alwaysShow = [...activeIngredients].filter(ing => !popular.includes(ing));
  popular.concat(alwaysShow).forEach(ing => el.appendChild(makeChip(ing)));

  if (rest.filter(ing => !alwaysShow.includes(ing)).length > 0) {
    const toggle = document.createElement("span");
    toggle.className = "chip chip-toggle";
    toggle.textContent = chipsExpanded ? "− 閉じる" : `+ もっと見る（${rest.length}）`;
    toggle.onclick = () => { chipsExpanded = !chipsExpanded; renderChips(); };
    el.appendChild(toggle);
    if (chipsExpanded) {
      rest.forEach(ing => { if (!alwaysShow.includes(ing)) el.appendChild(makeChip(ing)); });
    }
  }
}

function matches(r) {
  if (currentView === "want" && !want.has(r.id)) return false;
  if (currentView === "staple" && !isStaple(r.id)) return false;
  if (currentView === "cookable" && missingOf(r).length > MAX_MISSING) return false;
  if (activeIngredients.size > 0) {
    for (const ing of activeIngredients) {
      if (!r.ingredients.includes(ing)) return false;
    }
  }
  if (searchTerm) {
    const hay = [r.title, ...r.ingredients, ...r.tags].join(" ").toLowerCase();
    if (!hay.includes(searchTerm.toLowerCase())) return false;
  }
  return true;
}

function mediaThumbHtml(r) {
  const m = r.media;
  if (m.type === "video") return `<video src="${m.file}" muted preload="metadata"></video><span class="play-badge">▶</span>`;
  if (m.type === "image") return `<img src="${m.file}" alt="${r.title}">`;
  if (m.type === "youtube") return `<img src="${m.thumb}" alt="${r.title}"><span class="play-badge">▶</span>`;
  return "";
}

function kcalLevel(kcal) {
  if (kcal < 200) return "low";
  if (kcal < 400) return "mid";
  return "high";
}

function kcalBadgeHtml(r) {
  if (r.nutrition && r.nutrition.calories_kcal != null) {
    const kcal = r.nutrition.calories_kcal;
    return `<span class="kcal-badge ${kcalLevel(kcal)}">🔥 ${kcal}kcal</span>`;
  }
  return `<span class="kcal-badge unknown">kcal不明</span>`;
}

function cardActionsHtml(r) {
  const wanted = want.has(r.id);
  const c = cookedCount(r.id);
  return `
    <div class="card-actions">
      <button class="act-want ${wanted ? "on" : ""}" data-act="want" data-id="${r.id}" title="作りたい">${wanted ? "♥" : "♡"}</button>
      <button class="act-cook ${c > 0 ? "on" : ""}" data-act="cook" data-id="${r.id}" title="作った">✓ 作った${c > 0 ? ` <b>${c}</b>` : ""}</button>
    </div>`;
}

function cookableTagHtml(r) {
  const miss = missingOf(r);
  if (miss.length === 0) return `<p class="cookable-tag ok">✅ 今すぐ作れる</p>`;
  return `<p class="cookable-tag near">🔸 あと${miss.length}品：${miss.join(" / ")}</p>`;
}

function renderGrid() {
  const grid = document.getElementById("grid");
  let list = RECIPES.filter(matches);

  if (currentView === "cookable") {
    list = list.slice().sort((a, b) => missingOf(a).length - missingOf(b).length);
  } else if (sortedByKcal) {
    list = list.slice().sort((a, b) => {
      const ka = a.nutrition && a.nutrition.calories_kcal != null ? a.nutrition.calories_kcal : Infinity;
      const kb = b.nutrition && b.nutrition.calories_kcal != null ? b.nutrition.calories_kcal : Infinity;
      return ka - kb;
    });
  }

  const countEl = document.getElementById("match-count");
  const isFiltered = activeIngredients.size > 0 || searchTerm || currentView !== "all";
  countEl.textContent = isFiltered ? `${RECIPES.length}件中 ${list.length}件表示` : "";

  if (list.length === 0) {
    const msg = currentView === "want" ? "「♡作りたい」がまだ無い。気になったレシピに♡を押してみて"
      : currentView === "staple" ? `まだ定番なし。同じレシピを${STAPLE_THRESHOLD}回「✓作った」すると、ここに殿堂入りするよ⭐`
      : currentView === "cookable" ? "今の在庫だと「あと少しで作れる」レシピがまだ無いみたい。🧾レシートをCORINに送ると、買った食材で作れるレシピがここに出るよ"
      : "条件に合うレシピが見つからなかった";
    grid.innerHTML = `<div class="empty-state">${msg}</div>`;
    return;
  }

  grid.innerHTML = list.map(r => `
    <div class="card" data-id="${r.id}">
      <div class="card-media">
        ${mediaThumbHtml(r)}
        ${isStaple(r.id) ? `<span class="staple-badge">⭐ 定番</span>` : ""}
      </div>
      <div class="card-body">
        <p class="card-title">${r.title}</p>
        ${kcalBadgeHtml(r)}
        ${currentView === "cookable" ? cookableTagHtml(r) : ""}
        <p class="card-ingredients">${r.ingredients.slice(0, 4).join(" / ")}</p>
        ${cardActionsHtml(r)}
      </div>
    </div>
  `).join("");

  grid.querySelectorAll(".card").forEach(card => {
    card.querySelector(".card-media").onclick = () => openModal(card.dataset.id);
    card.querySelector(".card-title").onclick = () => openModal(card.dataset.id);
  });
  grid.querySelectorAll("[data-act]").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      handleAction(btn.dataset.act, btn.dataset.id);
    };
  });
}

function handleAction(act, id) {
  const r = RECIPES.find(x => x.id === id);
  if (act === "want") {
    toggleWant(id);
    toast(want.has(id) ? `♥ 「${r.title}」を作りたいリストに追加` : `作りたいリストから外した`);
  } else if (act === "cook") {
    const n = addCooked(id);
    if (n === STAPLE_THRESHOLD) toast(`⭐ 「${r.title}」がマイ定番に殿堂入り！（${n}回目）`);
    else toast(`✓ 「${r.title}」作ったね（${n}回目）`);
  }
  renderTabs();
  renderGrid();
}

// ---------- 📸 買ったもの追加（携帯・サーバー不要・localStorage） ----------
function refreshBuys() { computeFresh(); renderPantryBar(); renderTabs(); renderGrid(); }

function openBuysModal() {
  const counts = ingredientCounts();
  const suggestions = [...counts.entries()]
    .filter(([ing]) => !isPantry(ing) && !freshStock.includes(ing))
    .sort((a, b) => b[1] - a[1]).slice(0, 12).map(([ing]) => ing);
  const local = loadBuys();
  const chips = suggestions.length
    ? suggestions.map(s => `<button class="buy-suggest" data-item="${s}">＋${s}</button>`).join("")
    : `<span class="muted">—</span>`;
  const list = local.length
    ? local.map(b => `<li>${b.item}<button class="buy-remove" data-item="${b.item}">使った✓</button></li>`).join("")
    : `<li class="muted">まだ登録なし</li>`;
  document.getElementById("buys-content").innerHTML = `
    <button class="modal-close" id="buys-close">✕</button>
    <h2>📸 買ったもの追加</h2>
    <p class="buys-lead">入れると「🍳 作れる」に反映されるよ（${FRESH_DAYS}日で自動で消える）</p>
    <div class="buy-input-row">
      <input type="text" id="buy-input" placeholder="例：にんじん 豚こま きゅうり" autocomplete="off">
      <button id="buy-add">追加</button>
    </div>
    <p class="buy-suggest-label">よく使う食材からサッと</p>
    <div class="buy-suggests">${chips}</div>
    <h3>いま登録中</h3>
    <ul class="buy-list">${list}</ul>
  `;
  document.getElementById("buys-overlay").classList.add("open");
  document.getElementById("buys-close").onclick = closeBuysModal;
  const input = document.getElementById("buy-input");
  document.getElementById("buy-add").onclick = () => addBuys(input.value);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") addBuys(input.value); });
  document.querySelectorAll(".buy-suggest").forEach(b => b.onclick = () => addBuys(b.dataset.item));
  document.querySelectorAll(".buy-remove").forEach(b => b.onclick = () => removeBuy(b.dataset.item));
}
function closeBuysModal() { document.getElementById("buys-overlay").classList.remove("open"); }
function addBuys(text) {
  const items = (text || "").split(/[\s,、，]+/).map(s => s.trim()).filter(Boolean);
  if (!items.length) return;
  const buys = loadBuys();
  const today = new Date().toISOString().slice(0, 10);
  items.forEach(it => { if (!buys.some(b => b.item === it)) buys.push({ item: it, date: today }); });
  saveBuys(buys);
  refreshBuys();
  toast(`「${items.join("・")}」を追加。🍳作れるに反映したよ`);
  openBuysModal(); // 一覧・候補を更新
}
function removeBuy(item) {
  saveBuys(loadBuys().filter(b => b.item !== item));
  refreshBuys();
  openBuysModal();
}

function openModal(id) {
  const r = RECIPES.find(x => x.id === id);
  if (!r) return;

  let mediaHtml = "";
  if (r.media.type === "video") mediaHtml = `<video src="${r.media.file}" controls></video>`;
  else if (r.media.type === "image") mediaHtml = `<img src="${r.media.file}" alt="${r.title}">`;
  else if (r.media.type === "youtube") mediaHtml = `<img src="${r.media.thumb}" alt="${r.title}">`;

  let nutritionHtml = "";
  if (r.nutrition && r.nutrition.calories_kcal != null) {
    const n = r.nutrition;
    const items = [`<span class="nutrition-item">🔥 ${n.calories_kcal}kcal</span>`];
    if (n.protein_g != null) items.push(`<span class="nutrition-item">たんぱく質 ${n.protein_g}g</span>`);
    if (n.fat_g != null) items.push(`<span class="nutrition-item">脂質 ${n.fat_g}g</span>`);
    if (n.carbs_g != null) items.push(`<span class="nutrition-item">炭水化物 ${n.carbs_g}g</span>`);
    nutritionHtml = `<h3>カロリー・栄養成分</h3><div class="nutrition-row">${items.join("")}</div>`;
  } else {
    nutritionHtml = `<h3>カロリー・栄養成分</h3><p class="muted">元投稿に記載なし</p>`;
  }

  const stepsHtml = r.steps.length
    ? `<h3>手順</h3><ol>${r.steps.map(s => `<li>${s}</li>`).join("")}</ol>` : "";
  const captionHtml = r.caption_excerpt
    ? `<h3>メモ</h3><p class="muted">${r.caption_excerpt}...</p>` : "";
  const sourceLabel = { instagram: "Instagramで見る", youtube: "YouTubeで見る", threads: "Threadsで見る" }[r.source.type] || "元投稿を見る";

  const wanted = want.has(r.id);
  const c = cookedCount(r.id);
  const pantryNote = r.ingredients.some(isPantry)
    ? `<p class="pantry-note">🧂 ${r.ingredients.filter(isPantry).join("・")} は常備品として買い物リストから自動で外れるよ</p>` : "";
  // Prefer quantity-annotated list (from a 材料 callout in the note) when present;
  // otherwise fall back to name-only chips. Cart/filtering always use r.ingredients (names).
  const ingredientsListHtml = (r.ingredients_detail && r.ingredients_detail.length)
    ? `<ul>${r.ingredients_detail.map(i => `<li>${i}</li>`).join("")}</ul>`
    : `<ul>${r.ingredients.map(i => `<li class="${isPantry(i) ? "ing-pantry" : ""}">${i}${isPantry(i) ? " <span class=\"ing-tag\">常備</span>" : ""}</li>`).join("")}</ul>`;

  document.getElementById("modal-content").innerHTML = `
    <button class="modal-close" id="modal-close">✕</button>
    <div class="modal-media">${mediaHtml}</div>
    <h2>${r.title} ${isStaple(r.id) ? `<span class="staple-inline">⭐定番</span>` : ""}</h2>
    <div class="modal-actions">
      <button class="act-want ${wanted ? "on" : ""}" id="m-want">${wanted ? "♥ 作りたい" : "♡ 作りたい"}</button>
      <button class="act-cook ${c > 0 ? "on" : ""}" id="m-cook">✓ 作った${c > 0 ? ` <b>${c}回</b>` : ""}</button>
    </div>
    <h3>材料</h3>
    ${ingredientsListHtml}
    ${pantryNote}
    <button id="add-to-cart" class="btn-cart">🛒 材料を買い物リストへ（常備品は除く）</button>
    ${nutritionHtml}
    ${stepsHtml}
    ${captionHtml}
    <a class="source-link" href="${r.source.url}" target="_blank" rel="noopener">${sourceLabel} ↗</a>
  `;
  document.getElementById("modal-close").onclick = closeModal;
  document.getElementById("m-want").onclick = () => { handleAction("want", r.id); openModal(r.id); };
  document.getElementById("m-cook").onclick = () => { handleAction("cook", r.id); openModal(r.id); };
  document.getElementById("add-to-cart").onclick = () => {
    const n = addRecipeToCart(r);
    const btn = document.getElementById("add-to-cart");
    btn.textContent = n > 0 ? `✓ ${n}品を追加した` : "常備品だけだったよ🧂";
    setTimeout(() => { btn.textContent = "🛒 材料を買い物リストへ（常備品は除く）"; }, 1500);
  };
  document.getElementById("modal-overlay").classList.add("open");
}

function closeModal() {
  document.getElementById("modal-overlay").classList.remove("open");
}

document.getElementById("modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "modal-overlay") closeModal();
});

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    currentView = tab.dataset.view;
    renderTabs();
    renderGrid();
  });
});

document.getElementById("search").addEventListener("input", (e) => {
  searchTerm = e.target.value;
  renderGrid();
});

document.getElementById("sort-kcal").addEventListener("click", () => {
  sortedByKcal = !sortedByKcal;
  document.getElementById("sort-kcal").textContent = sortedByKcal ? "🔥 低カロリー順 ✓" : "🔥 低カロリー順";
  renderGrid();
});

document.getElementById("reset-all").addEventListener("click", () => {
  activeIngredients.clear();
  searchTerm = "";
  sortedByKcal = false;
  currentView = "all";
  document.getElementById("search").value = "";
  document.getElementById("sort-kcal").textContent = "🔥 低カロリー順";
  renderTabs();
  renderChips();
  renderGrid();
});

document.getElementById("add-buys-btn").addEventListener("click", openBuysModal);
document.getElementById("buys-overlay").addEventListener("click", (e) => {
  if (e.target.id === "buys-overlay") closeBuysModal();
});

init();
