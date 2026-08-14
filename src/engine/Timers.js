/**
 * Timers - a cancellable registry for every deferred callback in the game.
 *
 * Raw setTimeout/setInterval calls survive a restart and keep firing into a
 * world that no longer exists (banners reappearing, monsters despawning after
 * the new run started, radio lines on run 2). Every system routes its timers
 * through one of these registries so `clearAll()` on restart is guaranteed to
 * catch them.
 */
export class TimerRegistry {
  constructor() {
    this.timeouts = new Set();
    this.intervals = new Set();
  }

  /** setTimeout that auto-unregisters when it fires. */
  setTimeout(fn, ms) {
    const id = setTimeout(() => {
      this.timeouts.delete(id);
      fn();
    }, ms);
    this.timeouts.add(id);
    return id;
  }

  setInterval(fn, ms) {
    const id = setInterval(fn, ms);
    this.intervals.add(id);
    return id;
  }

  clearTimeout(id) {
    if (id == null) return;
    clearTimeout(id);
    this.timeouts.delete(id);
  }

  clearInterval(id) {
    if (id == null) return;
    clearInterval(id);
    this.intervals.delete(id);
  }

  clearAll() {
    for (const id of this.timeouts) clearTimeout(id);
    for (const id of this.intervals) clearInterval(id);
    this.timeouts.clear();
    this.intervals.clear();
  }
}
