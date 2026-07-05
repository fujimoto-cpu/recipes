let RECIPES = [];
let activeIngredients = new Set();
let searchTerm = "";
let sortedByKcal = false;

async function init() {
  const res = await fetch("data.json");
  RECIPES = await res.json();
  renderChips();
  renderGrid();
}

function allIngredients() {
  const set = new Set();
  RECIPES.forEach(r => r.ingredients.forEach(i => set.add(i)));
  return [...set].sort();
}

function renderChips() {
  const el = document.getElementById("chips");
  el.innerHTML = "";
  allIngredients().forEach(ing => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = ing;
    chip.onclick = () => {
      if (activeIngredients.has(ing)) {
        activeIngredients.delete(ing);
        chip.classList.remove("active");
      } else {
        activeIngredients.add(ing);
        chip.classList.add("active");
      }
      renderGrid();
    };
    el.appendChild(chip);
  });
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

function kcalBadgeHtml(r) {
  if (r.nutrition && r.nutrition.calories_kcal != null) {
    return `<span class="kcal-badge">🔥 ${r.nutrition.calories_kcal}kcal</span>`;
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
  if (r.nutrition) {
    nutritionHtml = `
      <h3>カロリー・栄養成分</h3>
      <div class="nutrition-row">
        <span class="nutrition-item">🔥 ${r.nutrition.calories_kcal}kcal</span>
        <span class="nutrition-item">たんぱく質 ${r.nutrition.protein_g}g</span>
        <span class="nutrition-item">脂質 ${r.nutrition.fat_g}g</span>
        <span class="nutrition-item">炭水化物 ${r.nutrition.carbs_g}g</span>
      </div>`;
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
    ${nutritionHtml}
    ${stepsHtml}
    ${captionHtml}
    <a class="source-link" href="${r.source.url}" target="_blank" rel="noopener">${sourceLabel} ↗</a>
  `;
  document.getElementById("modal-close").onclick = closeModal;
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
