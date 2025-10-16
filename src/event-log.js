/** Maintains a bounded in-memory log of timestamped events. */
export const EventLog = (() => {
  const events = [];
  const LIMIT = 80;

  /**
   * Adds a new event entry and evicts the oldest one when exceeding the limit.
   * @param {Record<string, unknown>} evt Event payload to record.
   * @returns {void}
   */
  function push(evt) {
    events.push({ time: Date.now(), ...evt });
    if (events.length > LIMIT) {
      events.shift();
    }
  }

  /**
   * Retrieves the logged events in reverse chronological order.
   * @returns {Record<string, unknown>[]} Copied array of stored events.
   */
  function list() {
    return events.toReversed();
  }
  return { push, list };
})();
