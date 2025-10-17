// Simple accessible toggle switch (no checkbox). Exports a factory.
/**
 * Builds an accessible Privacy Guard switch.
 * @param {{ id: string, label: string, description?: string, initial?: boolean, onChange?: (state: boolean) => void }} options - Switch configuration.
 * @returns {{ element: HTMLButtonElement, setState: (state: boolean) => void }} - DOM node and state controller.
 */
export function createPgSwitch({ id, label, description = "", initial = false, onChange }) {
  const btn = document.createElement("button");
  btn.id = id;
  btn.className = "pg-switch";
  btn.type = "button";
  btn.setAttribute("role", "switch");
  btn.setAttribute("aria-checked", String(!!initial));

  const track = document.createElement("span");
  track.className = "pg-switch__track";

  const thumb = document.createElement("span");
  thumb.className = "pg-switch__thumb";
  track.append(thumb);

  const textWrap = document.createElement("span");
  textWrap.className = "pg-switch__text";

  const text = document.createElement("span");
  text.className = "pg-switch__label";
  text.textContent = label;
  textWrap.append(text);

  if (description) {
    const hint = document.createElement("span");
    hint.className = "pg-switch__description";
    hint.textContent = description;
    textWrap.append(hint);
  }

  btn.append(track);
  btn.append(textWrap);

  /**
   * Updates the switch state and notifies listeners when it changes.
   * @param {boolean} on - Next on/off value.
   * @returns {void}
   */
  function setState(on) {
    const isOn = !!on;
    const prev = btn.getAttribute("aria-checked") === "true";
    if (prev !== isOn) {
      btn.setAttribute("aria-checked", String(isOn));
    }
    btn.classList.toggle("pg-switch--on", isOn);
    if (prev === isOn || typeof onChange !== "function") {
      return;
    }
    try {
      onChange(isOn);
    } catch {
      /* ignore */
    }
  }

  /**
   * Flips the current switch state based on user interaction.
   * @returns {void}
   */
  function toggle() {
    setState(btn.getAttribute("aria-checked") !== "true");
  }

  btn.addEventListener("click", toggle);
  btn.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      toggle();
    }
    if (e.key === "ArrowLeft") {
      setState(false);
    }
    if (e.key === "ArrowRight") {
      setState(true);
    }
  });

  if (initial) {
    btn.classList.add("pg-switch--on");
  }

  return { element: btn, setState };
}
