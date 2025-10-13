/**
 * Injects a <style> tag with the provided CSS unless another instance with the same id exists.
 * @param {string} id Identifier applied to the injected <style> element.
 * @param {string} cssText Raw CSS rules to append to the document.
 * @returns {void}
 */
export function injectCSS(id, cssText) {
  try {
    if (document.querySelector(`#${id}`)) {
      return;
    }
    const style = document.createElement("style");
    style.id = id;
    style.textContent = cssText;
    document.documentElement.append(style);
  } catch {
    /* ignore */
  }
}
