const TRUSTED_POLICY_NAME = "privacy-guard#ui-html";
let trustedHtmlPolicy = null;
let triedCreatingPolicy = false;

/**
 * Ensures Trusted Types markup when the browser enforces TrustedHTML.
 * Falls back to raw strings when Trusted Types are unavailable.
 * @param {string} markup HTML markup to sanitize.
 * @returns {string | TrustedHTML} Trusted-aware markup.
 */
function createTrustedHtml(markup) {
  if (typeof markup !== "string") {
    return markup;
  }
  const trustedTypesApi = globalThis.trustedTypes;
  if (!trustedTypesApi) {
    return markup;
  }
  if (!trustedHtmlPolicy && !triedCreatingPolicy) {
    triedCreatingPolicy = true;
    try {
      trustedHtmlPolicy = trustedTypesApi.createPolicy(TRUSTED_POLICY_NAME, {
        createHTML(value) {
          return value;
        },
      });
    } catch {
      try {
        trustedHtmlPolicy = trustedTypesApi.createPolicy("default", {
          createHTML(value) {
            return value;
          },
          createScript(value) {
            return value;
          },
          createScriptURL(value) {
            return value;
          },
        });
      } catch {
        trustedHtmlPolicy = null;
      }
    }
  }
  if (trustedHtmlPolicy && typeof trustedHtmlPolicy.createHTML === "function") {
    try {
      return trustedHtmlPolicy.createHTML(markup);
    } catch {
      return markup;
    }
  }
  return markup;
}

/**
 * Safely renders HTML markup into the provided container without using Trusted Type sinks.
 * @param {Element | ShadowRoot | null | undefined} container Target container to populate.
 * @param {string} html HTML markup to inject.
 * @returns {void}
 */
export function renderHTML(container, html) {
  if (!container || typeof html !== "string") {
    return;
  }

  try {
    const ownerDocument =
      container instanceof ShadowRoot
        ? container.host && container.host.ownerDocument
        : container.ownerDocument;
    const targetDocument = ownerDocument || document;
    while (container.firstChild) {
      container.firstChild.remove();
    }
    const parser = new DOMParser();
    const safeMarkup = createTrustedHtml(html);
    const parsed = parser.parseFromString(
      /** @type {string | TrustedHTML} */ (safeMarkup),
      "text/html",
    );
    const fragment = targetDocument.createDocumentFragment();
    const nodes = [...parsed.body.childNodes];
    fragment.append(...nodes);
    container.append(fragment);
  } catch {
    /* ignore */
  }
}
