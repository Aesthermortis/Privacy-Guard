export function injectCSS(id, cssText) {
  try {
    if (document.getElementById(id)) {
      return;
    }
    const style = document.createElement("style");
    style.id = id;
    style.textContent = cssText;
    document.documentElement.appendChild(style);
  } catch {
    /* ignore */
  }
}
