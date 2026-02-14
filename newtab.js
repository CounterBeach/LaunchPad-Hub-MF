const MAX_CUSTOM_TABS = 5;

const tabsRow = document.getElementById("tabsRow");
const grid = document.getElementById("grid");
const searchInput = document.getElementById("searchInput");

let state = {
  activeTabId: null,
  customTabs: [], // [{id, title, links:[{title,url}]}]
};

// ---------- storage ----------
async function loadState() {
  const data = await browser.storage.local.get(["activeTabId", "customTabs"]);
  state.customTabs = Array.isArray(data.customTabs) ? data.customTabs : [];
  if (state.customTabs.length > MAX_CUSTOM_TABS) {
    state.customTabs = state.customTabs.slice(0, MAX_CUSTOM_TABS);
  }

  // если activeTabId не задан или таба уже нет — выбираем первый
  const savedActive =
    typeof data.activeTabId === "string" ? data.activeTabId : null;
  const exists =
    savedActive && state.customTabs.some((t) => t.id === savedActive);

  if (exists) {
    state.activeTabId = savedActive;
  } else {
    state.activeTabId = state.customTabs[0]?.id || null;
  }
}

async function saveState() {
  await browser.storage.local.set({
    activeTabId: state.activeTabId,
    customTabs: state.customTabs,
  });
}

// ---------- helpers ----------
function isProbablyUrl(text) {
  return /^https?:\/\//i.test(text) || text.includes(".");
}

function normalizeUrl(text) {
  if (/^https?:\/\//i.test(text)) return text;
  return "https://" + text;
}

function makeId() {
  return "tab:" + Date.now();
}

function closeAllMenus() {
  document.querySelectorAll(".menu").forEach((m) => m.remove());
}

//-------------
function closeAllLinkMenus() {
  document.querySelectorAll(".linkMenu").forEach((m) => m.remove());
}

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

// Берём иконку через сервис (обычно работает стабильно)
function faviconUrl(url) {
  try {
    const u = new URL(url);
    return u.origin + "/favicon.ico";
  } catch {
    return "";
  }
}

// Цвет по иконке: простой “средний цвет”
async function dominantColorFromDataUrl(dataUrl) {
  try {
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = dataUrl;
    });

    const c = document.createElement("canvas");
    c.width = 24;
    c.height = 24;

    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, 24, 24);

    const data = ctx.getImageData(0, 0, 24, 24).data;

    let r = 0,
      g = 0,
      b = 0,
      count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 20) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count++;
    }

    if (!count) return null;

    r = Math.round((r / count) * 0.55);
    g = Math.round((g / count) * 0.55);
    b = Math.round((b / count) * 0.55);

    return `rgb(${r}, ${g}, ${b})`;
  } catch {
    return null;
  }
}

async function fetchIconDataUrl(iconUrl) {
  try {
    const resp = await browser.runtime.sendMessage({
      type: "LP_FETCH_ICON",
      iconUrl,
    });
    if (resp && resp.ok) return resp.dataUrl;
    return null;
  } catch {
    return null;
  }
}

// ---------- search ----------
searchInput.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const q = searchInput.value.trim();
  if (!q) return;

  if (isProbablyUrl(q)) location.href = normalizeUrl(q);
  else
    location.href = "https://www.google.com/search?q=" + encodeURIComponent(q);
});

// ---------- tabs UI ----------
function renderTabs() {
  tabsRow.innerHTML = "";
  closeAllMenus();

  // если табов нет — показываем только "+"
  for (const t of state.customTabs) {
    tabsRow.appendChild(makeTabButton(t));
  }

  if (state.customTabs.length < MAX_CUSTOM_TABS) {
    const add = document.createElement("div");
    add.className = "tabBtn addBtn";
    add.textContent = "+";
    add.title = "Создать таб";
    add.addEventListener("click", onCreateTab);
    tabsRow.appendChild(add);
  }
}

function makeTabButton(tab) {
  const btn = document.createElement("div");
  btn.className = "tabBtn" + (state.activeTabId === tab.id ? " active" : "");
  btn.addEventListener("click", async () => {
    state.activeTabId = tab.id;
    await saveState();
    renderTabs();
    renderGrid();
  });

  const text = document.createElement("div");
  text.className = "tabTitle";
  text.textContent = tab.title || "Без названия";
  btn.appendChild(text);

  // бургер-меню
  const burger = document.createElement("div");
  burger.className = "burger";
  burger.textContent = "☰";
  burger.title = "Меню";
  burger.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu(btn, tab.id);
  });
  btn.appendChild(burger);

  btn.setAttribute("data-tab-id", tab.id);
  btn.draggable = true;

  return btn;
}

function toggleMenu(parentBtn, tabId) {
  const existed = parentBtn.querySelector(".menu");
  closeAllMenus();
  if (existed) return;

  const menu = document.createElement("div");
  menu.className = "menu";

  const rename = document.createElement("div");
  rename.className = "menuItem";
  rename.textContent = "Переименовать";
  rename.addEventListener("click", async () => {
    const tab = state.customTabs.find((t) => t.id === tabId);
    if (!tab) return;

    const name = prompt("Новое имя таба:", tab.title || "");
    if (!name) return;

    tab.title = name.trim();
    await saveState();
    renderTabs();
  });

  const clearLinks = document.createElement("div");
  clearLinks.className = "menuItem";
  clearLinks.textContent = "Удалить все ссылки";
  clearLinks.addEventListener("click", async () => {
    const tab = state.customTabs.find((t) => t.id === tabId);
    if (!tab) return;

    const tabName = tab.title || "Без названия";
    const ok = confirm(
      `Вы уверены, что хотите удалить все ссылки в табе "${tabName}"?`
    );
    if (!ok) return;

    tab.links = [];
    await saveState();
    closeAllMenus();

    // если этот таб сейчас открыт — обновим сетку
    if (state.activeTabId === tabId) renderGrid();
  });

  const del = document.createElement("div");
  del.className = "menuItem";
  del.textContent = "Удалить";
  del.addEventListener("click", async () => {
    const ok = confirm("Удалить этот таб?");
    if (!ok) return;

    state.customTabs = state.customTabs.filter((t) => t.id !== tabId);

    if (state.activeTabId === tabId) {
      state.activeTabId = state.customTabs[0]?.id || null;
    }

    await saveState();
    renderTabs();
    renderGrid();
  });

  menu.appendChild(rename);
  menu.appendChild(clearLinks);
  menu.appendChild(del);
  parentBtn.appendChild(menu);

  // закрытие по клику вне меню
  setTimeout(() => {
    const onDocClick = (e) => {
      if (!menu.contains(e.target)) {
        closeAllMenus();
        document.removeEventListener("click", onDocClick);
      }
    };
    document.addEventListener("click", onDocClick);
  }, 0);
}

async function onCreateTab() {
  const name = prompt("Имя нового таба:");
  if (!name) return;

  const tab = {
    id: makeId(),
    title: name.trim(),
    links: [],
  };

  state.customTabs.push(tab);
  state.activeTabId = tab.id;

  await saveState();
  renderTabs();
  renderGrid();
}

// ---------- grid ----------
function renderGrid() {
  /*const sideBtn = document.getElementById("sideAddBtn");
  if (sideBtn) sideBtn.style.display = state.activeTabId ? "block" : "none";*/

  // убрать старые кнопки управления, если они есть
  document.querySelectorAll(".lpToolbarWrap").forEach((n) => n.remove());

  grid.innerHTML = "";
  closeAllMenus();

  if (!state.activeTabId) {
    const p = document.createElement("div");
    p.className = "empty";
    p.textContent = "Табов пока нет. Нажми “+” и создай первый.";
    grid.appendChild(p);
    return;
  }

  const tab = state.customTabs.find((t) => t.id === state.activeTabId);
  if (!tab) return;

  // панель управления табом
  /*const wrap = document.createElement("div");
  wrap.className = "lpToolbarWrap";
  wrap.style.marginTop = "18px";

  const row = document.createElement("div");
  row.className = "toolbarRow";

  const addLinkBtn = document.createElement("button");
  addLinkBtn.className = "smallBtn";
  addLinkBtn.textContent = "+ Добавить ссылку";
  addLinkBtn.addEventListener("click", async () => {
    const title = prompt("Название ссылки:");
    if (!title) return;
    const url = prompt("URL (пример: https://example.com):");
    if (!url) return;

    tab.links.push({ title: title.trim(), url: normalizeUrl(url.trim()) });
    await saveState();
    renderGrid();
  });

  const clearBtn = document.createElement("button");
  clearBtn.className = "smallBtn";
  clearBtn.textContent = "Очистить";
  clearBtn.addEventListener("click", async () => {
    const ok = confirm("Удалить все ссылки в этом табе?");
    if (!ok) return;
    tab.links = [];
    await saveState();
    renderGrid();
  });

  row.appendChild(addLinkBtn);
  row.appendChild(clearBtn);
  wrap.appendChild(row);

  grid.parentElement.insertBefore(wrap, grid);*/

  /*if (!tab.links.length) {
    const p = document.createElement("div");
    p.className = "empty";
    p.textContent = "В этом табе пока нет ссылок. Нажми “+ Добавить ссылку”.";
    grid.appendChild(p);
    return;
  }*/
  if (!tab.links.length) {
    grid.appendChild(makeAddCard(addLinkToActiveTab));
    return;
  }

  for (let i = 0; i < tab.links.length; i++) {
    const l = tab.links[i];

    const card = makeLinkCard(l, {
      onEdit: async () => {
        const newTitle = prompt("Название:", l.title || "");
        if (!newTitle) return;

        const newUrl = prompt("URL:", l.url || "");
        if (!newUrl) return;

        tab.links[i] = {
          title: newTitle.trim(),
          url: normalizeUrl(newUrl.trim()),
        };

        await saveState();
        renderGrid();
      },
      onRemove: async () => {
        const ok = confirm("Удалить ссылку?");
        if (!ok) return;

        tab.links.splice(i, 1);
        await saveState();
        renderGrid();
      },
    });

    grid.appendChild(card);
  }
  
  grid.appendChild(makeAddCard(addLinkToActiveTab));

}

/*function ensureSideAddButton() {
  // не создаём дважды
  if (document.getElementById("sideAddBtn")) return;

  const btn = document.createElement("button");
  btn.id = "sideAddBtn";
  btn.textContent = "+";
  btn.title = "Добавить ссылку";
  btn.className = "sideAddBtn";

  btn.addEventListener("click", async () => {
    if (!state.activeTabId) return;

    const tab = state.customTabs.find((t) => t.id === state.activeTabId);
    if (!tab) return;

    const title = prompt("Название ссылки:");
    if (!title) return;

    const url = prompt("URL (пример: https://example.com):");
    if (!url) return;

    tab.links.push({ title: title.trim(), url: normalizeUrl(url.trim()) });
    await saveState();
    renderGrid();
  });

  document.body.appendChild(btn);
}*/

function makeAddCard(onAdd) {
  const card = document.createElement("div");
  card.className = "card addCard";
  card.style.background = "var(--panel)";

  card.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onAdd && onAdd();
  });

  const top = document.createElement("div");
  top.className = "cardTop";

  const plus = document.createElement("div");
  plus.className = "plus";
  plus.textContent = "+";

  const text = document.createElement("div");
  text.className = "addText";
  text.textContent = "Новая вкладка";

  top.appendChild(plus);
  top.appendChild(text);
  card.appendChild(top);

  return card;
}

async function addLinkToActiveTab() {
  if (!state.activeTabId) return;

  const tab = state.customTabs.find((t) => t.id === state.activeTabId);
  if (!tab) return;

  const title = prompt("Название ссылки:");
  if (!title) return;

  const url = prompt("URL (пример: https://example.com):");
  if (!url) return;

  tab.links.push({ title: title.trim(), url: normalizeUrl(url.trim()) });
  await saveState();
  renderGrid();
}

function makeLinkCard(link, { onEdit, onRemove }) {
  const card = document.createElement("div");
  card.className = "card";
  card.style.background = "var(--panel)";

  // клик по карточке — открыть
  card.addEventListener("click", () => {
    location.href = link.url;
  });

  const top = document.createElement("div");
  top.className = "cardTop";

  const iconWrap = document.createElement("div");
  iconWrap.className = "cardIcon";

  const img = document.createElement("img");
  const icon = faviconUrl(link.url);

  img.src = icon;
  img.alt = "";
  iconWrap.appendChild(img);

  // получаем dataURL через background и считаем цвет
  if (icon) {
    fetchIconDataUrl(icon).then(async (dataUrl) => {
      console.log("ICON URL:", icon);
      console.log("DATA URL OK:", !!dataUrl);

      if (!dataUrl) return;

      img.src = dataUrl;

      const color = await dominantColorFromDataUrl(dataUrl);
      console.log("COLOR:", color);

      if (color) card.style.background = color;
    });
  }

  const title = document.createElement("div");
  title.className = "cardTitle";
  title.textContent = link.title || link.url;

  top.appendChild(iconWrap);
  top.appendChild(title);

  // бургер
  const burger = document.createElement("div");
  burger.className = "linkBurger";
  burger.textContent = "☰";
  burger.title = "Меню";
  burger.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleLinkMenu(card, onEdit, onRemove);
  });

  card.appendChild(burger);
  card.appendChild(top);

  return card;
}

function toggleLinkMenu(cardEl, onEdit, onRemove) {
  const existed = cardEl.querySelector(".linkMenu");
  closeAllLinkMenus();
  if (existed) return;

  const menu = document.createElement("div");
  menu.className = "linkMenu";

  const edit = document.createElement("div");
  edit.className = "linkMenuItem";
  edit.textContent = "Изменить";
  edit.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeAllLinkMenus();
    onEdit && onEdit();
  });

  const del = document.createElement("div");
  del.className = "linkMenuItem";
  del.textContent = "Удалить";
  del.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeAllLinkMenus();
    onRemove && onRemove();
  });

  menu.appendChild(edit);
  menu.appendChild(del);
  cardEl.appendChild(menu);

  setTimeout(() => {
    const onDocClick = (e) => {
      if (!menu.contains(e.target)) {
        closeAllLinkMenus();
        document.removeEventListener("click", onDocClick);
      }
    };
    document.addEventListener("click", onDocClick);
  }, 0);
}

// ---------- init ----------
async function init() {
  await loadState();
  await saveState(); // чтобы структура в storage точно появилась
  renderTabs();
  /*ensureSideAddButton();*/
  lpInitTabsDnD({ containerEl: tabsRow, getState, saveAndRerender });
  renderGrid();
}

init().catch((err) => {
  console.error(err);
  grid.textContent = "Ошибка: " + String(err);
});

function getState() {
  return state;
}

async function saveAndRerender() {
  await saveState();
  renderTabs();
  renderGrid();
}
