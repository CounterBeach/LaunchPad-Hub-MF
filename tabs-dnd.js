// tabs-dnd.js
// Drag&Drop для кастомных табов. Инициализируется 1 раз на контейнер.

function lpInitTabsDnD({ containerEl, getState, saveAndRerender }) {
  // защита: не вешаем обработчики повторно
  if (containerEl.__lpDndInited) return;
  containerEl.__lpDndInited = true;

  containerEl.__lpDragId = null;

  containerEl.addEventListener("dragstart", (e) => {
    // если начали тянуть за бургер — игнорируем
    if (e.target.closest(".burger")) return;

    const tabEl = e.target.closest("[data-tab-id]");
    if (!tabEl) return;

    const id = tabEl.getAttribute("data-tab-id");
    containerEl.__lpDragId = id;

    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);

    tabEl.classList.add("dragging");
  });

  containerEl.addEventListener("dragend", (e) => {
    const tabEl = e.target.closest("[data-tab-id]");
    if (tabEl) tabEl.classList.remove("dragging");

    containerEl.__lpDragId = null;
    clearDropHints(containerEl);
  });

  containerEl.addEventListener("dragover", (e) => {
    e.preventDefault();

    const overEl = e.target.closest("[data-tab-id]");
    if (!overEl) return;

    const overId = overEl.getAttribute("data-tab-id");
    const fromId = containerEl.__lpDragId || e.dataTransfer.getData("text/plain");

    if (!fromId || !overId || fromId === overId) return;

    clearDropHints(containerEl);
    overEl.classList.add("drop-hint");
  });

  containerEl.addEventListener("drop", async (e) => {
    e.preventDefault();

    const dropEl = e.target.closest("[data-tab-id]");
    if (!dropEl) return;

    const toId = dropEl.getAttribute("data-tab-id");
    const fromId = containerEl.__lpDragId || e.dataTransfer.getData("text/plain");

    if (!fromId || !toId || fromId === toId) return;

    const s = getState();

    const fromIndex = s.customTabs.findIndex(t => t.id === fromId);
    const toIndex = s.customTabs.findIndex(t => t.id === toId);
    if (fromIndex === -1 || toIndex === -1) return;

    const moved = s.customTabs.splice(fromIndex, 1)[0];
    s.customTabs.splice(toIndex, 0, moved);

    containerEl.__lpDragId = null;
    clearDropHints(containerEl);

    await saveAndRerender();
  });
}

function clearDropHints(containerEl) {
  containerEl.querySelectorAll(".drop-hint").forEach(el => el.classList.remove("drop-hint"));
}
