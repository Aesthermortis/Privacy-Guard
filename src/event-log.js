export const EventLog = (() => {
  const events = [];
  const LIMIT = 80;
  function push(evt) {
    events.push({ time: Date.now(), ...evt });
    if (events.length > LIMIT) {
      events.shift();
    }
  }
  function list() {
    return events.slice().reverse();
  }
  return { push, list };
})();
