/* eslint-env browser */

const constructableSheetIds = new WeakMap();

/**
 * Resolves the node supporting constructable stylesheets for a given target.
 * @param {Document | Element | ShadowRoot} target Node where the stylesheet should apply.
 * @returns {Document | ShadowRoot | null} Root that can adopt stylesheets, otherwise null.
 */
function resolveAdoptionRoot(target) {
  if (target instanceof ShadowRoot || target instanceof Document) {
    return target;
  }
  if (target instanceof Element) {
    const rootNode = target.getRootNode();
    if (rootNode instanceof ShadowRoot || rootNode instanceof Document) {
      return rootNode;
    }
  }
  return null;
}

/**
 * Attempts to apply CSS via constructable stylesheets to bypass strict CSPs.
 * @param {Document | Element | ShadowRoot} target Node where the stylesheet should apply.
 * @param {string} id Identifier for deduplication.
 * @param {string} cssText CSS payload.
 * @returns {boolean} True when the stylesheet was adopted.
 */
function tryConstructableStylesheet(target, id, cssText) {
  const adoptionRoot = resolveAdoptionRoot(target);
  if (
    !adoptionRoot ||
    typeof CSSStyleSheet !== "function" ||
    !("adoptedStyleSheets" in adoptionRoot)
  ) {
    return false;
  }
  try {
    const sheetList = [...(adoptionRoot.adoptedStyleSheets ?? [])];
    if (sheetList.some((sheet) => sheet && constructableSheetIds.get(sheet) === id)) {
      return true;
    }
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(cssText);
    constructableSheetIds.set(sheet, id);
    adoptionRoot.adoptedStyleSheets = [...sheetList, sheet];
    return true;
  } catch {
    return false;
  }
}

/**
 * Injects CSS into the document or shadow root, using constructable stylesheets first,
 * falling back to DOM `<style>` injection and optionally GM_addStyle.
 * @param {string} id Identifier applied to the injected stylesheet.
 * @param {string} cssText Raw CSS rules to append.
 * @param {Document | Element | ShadowRoot} [target] Node where the style should be injected.
 * @param {{nonce?: string, gmFallback?: boolean}} [options] Optional configuration flags.
 * @returns {void}
 */
export function injectCSS(id, cssText, target = document.documentElement, options = {}) {
  let fallbackToGm = false;
  try {
    const { nonce, gmFallback = false } = options ?? {};
    fallbackToGm = gmFallback;
    if (tryConstructableStylesheet(target, id, cssText)) {
      return;
    }
    let root = target instanceof Document ? target.documentElement : target;
    if (!(root instanceof Element || root instanceof ShadowRoot)) {
      return;
    }

    const selectorId = CSS && CSS.escape ? `#${CSS.escape(id)}` : `#${id}`;
    if (root.querySelector(selectorId)) {
      return;
    }

    const ownerDocument =
      root instanceof ShadowRoot
        ? root.host && root.host.ownerDocument
        : root.ownerDocument || document;
    const style = ownerDocument.createElement("style");
    style.id = id;
    if (nonce) {
      style.setAttribute("nonce", nonce);
    }
    style.textContent = cssText;
    root.append(style);
  } catch {
    if (fallbackToGm && typeof globalThis.GM_addStyle === "function") {
      globalThis.GM_addStyle(cssText);
    }
  }
}
