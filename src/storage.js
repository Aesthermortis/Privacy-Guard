export const STORAGE = {
  PREFIX: "PG_OVERRIDES::",
  keyFor(hostname) {
    return `${this.PREFIX}${hostname}`;
  },
  get(hostname) {
    try {
      const raw = localStorage.getItem(this.keyFor(hostname));
      if (!raw) {
        return null;
      }
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  set(hostname, obj) {
    try {
      localStorage.setItem(this.keyFor(hostname), JSON.stringify(obj));
    } catch {
      /* ignore */
    }
  },
  remove(hostname) {
    try {
      localStorage.removeItem(this.keyFor(hostname));
    } catch {
      /* ignore */
    }
  },
};
