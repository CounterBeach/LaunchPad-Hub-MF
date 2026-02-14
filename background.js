// background.js
// Забираем фавиконку и отдаём её как dataURL, чтобы newtab мог взять пиксели без CORS.

browser.runtime.onMessage.addListener(async (msg) => {
  if (!msg || msg.type !== "LP_FETCH_ICON") return;

  const iconUrl = msg.iconUrl;
  if (!iconUrl) return { ok: false };

  try {
    const res = await fetch(iconUrl);
    const blob = await res.blob();

    const dataUrl = await blobToDataUrl(blob);
    return { ok: true, dataUrl };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
