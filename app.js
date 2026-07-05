let RECIPES = [];
let activeIngredients = new Set();
let searchTerm = "";
let sortedByKcal = false;

const CART_KEY = "recipe-site-cart";
function loadCart() {
  try {
    return new Map(JSON.parse(localStorage.getItem(CART_KEY) || "[]"));
  } catch {
    return new Map();
  }
}
function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify([...cart]));
}
let cart = loadCart();

function updateCartCount() {
  document.getElementById("cart-count").textContent = cart.size;
}

function addRecipeToCart(recipe) {
  recipe.ingredients.forEach(ing => {
    const sources = cart.get(ing) || [];
    if (!sources.includes(recipe.title)) sources.push(recipe.title);
    cart.set(ing, sources);
  });
  saveCart(cart);
  updateCartCount();
}

function removeFromCart(ing) {
  cart.delete(ing);
  saveCart(cart);
  updateCartCount();
  renderCart();
}

function renderCart() {
  const items = [...cart.entries()];
  const rows = items.length
    ? items.map(([ing, sources]) => `
      <div class="cart-item-row">
        <span>${ing}<span style="color:#999; font-size:12px;"> — ${sources.join("・")}</span></span>
        <button data-ing="${ing}" class="cart-remove">✕</button>
      </div>`).join("")
    : `<p style="color:#999; font-size:14px;">まだ何も入ってない。レシピの詳細から「買い物リストに追加」してね</p>`;

  document.getElementById("cart-content").innerHTML = `
    <button class="modal-close" id="cart-close">✕</button>
    <h2>🛒 買い物リスト</h2>
    ${rows}
    ${items.length ? `
      <div style="display:flex; gap:8px; margin-top:16px;">
        <button id="cart-copy">📋 コピー</button>
        <button id="cart-clear">すべて削除</button>
      </div>` : ""}
  `;
  document.getElementById("cart-close").onclick = () => document.getElementById("cart-overlay").classList.remove("open");
  document.querySelectorAll(".cart-remove").forEach(btn => {
    btn.onclick = () => removeFromCart(btn.dataset.ing);
  });
  if (items.length) {
    document.getElementById("cart-copy").onclick = () => {
      const text = items.map(([ing]) => ing).join("\n");
      navigator.clipboard.writeText(text);
      const btn = document.getElementById("cart-copy");
      btn.textContent = "✓ コピーした";
      setTimeout(() => { btn.textContent = "📋 コピー"; }, 1500);
    };
    document.getElementById("cart-clear").onclick = () => {
      cart.clear();
      saveCart(cart);
      updateCartCount();
      renderCart();
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

async function init() {
  const res = await fetch("data.json");
  RECIPES = await res.json();
  updateCartCount();
  renderChips();
  renderGrid();
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
    if (activeIngredients.has(ing)) {
      activeIngredients.delete(ing);
    } else {
      activeIngredients.add(ing);
    }
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

  // Always show any already-active ingredient, even if it's in the "rest" bucket.
  const alwaysShow = [...activeIngredients].filter(ing => !popular.includes(ing));
  popular.concat(alwaysShow).forEach(ing => el.appendChild(makeChip(ing)));

  if (rest.filter(ing => !alwaysShow.includes(ing)).length > 0) {
    const toggle = document.createElement("span");
    toggle.className = "chip chip-toggle";
    toggle.textContent = chipsExpanded ? "− 閉じる" : `+ もっと見る（${rest.length}）`;
    toggle.onclick = () => {
      chipsExpanded = !chipsExpanded;
      renderChips();
    };
    el.appendChild(toggle);

    if (chipsExpanded) {
      rest.forEach(ing => {
        if (!alwaysShow.includes(ing)) el.appendChild(makeChip(ing));
      });
    }
  }
}

function matches(r) {
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
  if (m.type === "video") {
    return `<video src="${m.file}" muted preload="metadata"></video><span class="play-badge">▶</span>`;
  }
  if (m.type === "image") {
    return `<img src="${m.file}" alt="${r.title}">`;
  }
  if (m.type === "youtube") {
    return `<img src="${m.thumb}" alt="${r.title}"><span class="play-badge">▶</span>`;
  }
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

function renderGrid() {
  const grid = document.getElementById("grid");
  let list = RECIPES.filter(matches);

  if (sortedByKcal) {
    list = list.slice().sort((a, b) => {
      const ka = a.nutrition && a.nutrition.calories_kcal != null ? a.nutrition.calories_kcal : Infinity;
      const kb = b.nutrition && b.nutrition.calories_kcal != null ? b.nutrition.calories_kcal : Infinity;
      return ka - kb;
    });
  }

  const countEl = document.getElementById("match-count");
  const isFiltered = activeIngredients.size > 0 || searchTerm;
  countEl.textContent = isFiltered ? `${RECIPES.length}件中 ${list.length}件表示` : "";

  if (list.length === 0) {
    grid.innerHTML = `<div class="empty-state">条件に合うレシピが見つからなかった</div>`;
    return;
  }

  grid.innerHTML = list.map(r => `
    <div class="card" data-id="${r.id}">
      <div class="card-media">${mediaThumbHtml(r)}</div>
      <div class="card-body">
        <p class="card-title">${r.title}</p>
        ${kcalBadgeHtml(r)}
        <p class="card-ingredients">${r.ingredients.slice(0, 4).join(" / ")}</p>
      </div>
    </div>
  `).join("");

  grid.querySelectorAll(".card").forEach(card => {
    card.onclick = () => openModal(card.dataset.id);
  });
}

function openModal(id) {
  const r = RECIPES.find(x => x.id === id);
  if (!r) return;

  let mediaHtml = "";
  if (r.media.type === "video") {
    mediaHtml = `<video src="${r.media.file}" controls></video>`;
  } else if (r.media.type === "image") {
    mediaHtml = `<img src="${r.media.file}" alt="${r.title}">`;
  } else if (r.media.type === "youtube") {
    mediaHtml = `<img src="${r.media.thumb}" alt="${r.title}">`;
  }

  let nutritionHtml = "";
  if (r.nutrition && r.nutrition.calories_kcal != null) {
    const n = r.nutrition;
    const items = [`<span class="nutrition-item">🔥 ${n.calories_kcal}kcal</span>`];
    if (n.protein_g != null) items.push(`<span class="nutrition-item">たんぱく質 ${n.protein_g}g</span>`);
    if (n.fat_g != null) items.push(`<span class="nutrition-item">脂質 ${n.fat_g}g</span>`);
    if (n.carbs_g != null) items.push(`<span class="nutrition-item">炭水化物 ${n.carbs_g}g</span>`);
    nutritionHtml = `
      <h3>カロリー・栄養成分</h3>
      <div class="nutrition-row">${items.join("")}</div>`;
  } else {
    nutritionHtml = `<h3>カロリー・栄養成分</h3><p style="font-size:13px;color:#999;">元投稿に記載なし</p>`;
  }

  const stepsHtml = r.steps.length
    ? `<h3>手順</h3><ol>${r.steps.map(s => `<li>${s}</li>`).join("")}</ol>`
    : "";

  const captionHtml = r.caption_excerpt
    ? `<h3>メモ</h3><p style="font-size:13px;color:#666;">${r.caption_excerpt}...</p>`
    : "";

  const sourceLabel = { instagram: "Instagramで見る", youtube: "YouTubeで見る", threads: "Threadsで見る" }[r.source.type] || "元投稿を見る";

  document.getElementById("modal-content").innerHTML = `
    <button class="modal-close" id="modal-close">✕</button>
    <div class="modal-media">${mediaHtml}</div>
    <h2>${r.title}</h2>
    <h3>材料</h3>
    <ul>${r.ingredients.map(i => `<li>${i}</li>`).join("")}</ul>
    <button id="add-to-cart" style="margin-top:8px;">🛒 買い物リストに追加</button>
    ${nutritionHtml}
    ${stepsHtml}
    ${captionHtml}
    <a class="source-link" href="${r.source.url}" target="_blank" rel="noopener">${sourceLabel} ↗</a>
  `;
  document.getElementById("modal-close").onclick = closeModal;
  document.getElementById("add-to-cart").onclick = () => {
    addRecipeToCart(r);
    const btn = document.getElementById("add-to-cart");
    btn.textContent = "✓ 追加した";
    setTimeout(() => { btn.textContent = "🛒 買い物リストに追加"; }, 1200);
  };
  document.getElementById("modal-overlay").classList.add("open");
}

function closeModal() {
  document.getElementById("modal-overlay").classList.remove("open");
}

document.getElementById("modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "modal-overlay") closeModal();
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
  document.getElementById("search").value = "";
  document.getElementById("sort-kcal").textContent = "🔥 低カロリー順";
  document.querySelectorAll(".chip.active").forEach(c => c.classList.remove("active"));
  renderGrid();
});

init();
