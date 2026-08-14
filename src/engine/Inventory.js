/**
 * Inventory - single source of truth for everything the player carries.
 *
 * All item state lives in one counted Map. Nothing else in the codebase is
 * allowed to keep a parallel "hasX" boolean; the legacy accessors below are
 * thin read-only views onto the same map so old call sites stay correct.
 *
 * Counters can never go negative and pickups can never duplicate a unique item.
 */

// Items that can only ever exist once in the player's hands.
const UNIQUE_ITEMS = new Set([
  'office_key',
  'freezer_keycard',
  'drive_thru_key',
  'car_key',
  'mop',
  'spatula',
  'oil'
]);

export class Inventory {
  constructor() {
    this.counts = new Map();
    /** Document ids the player has physically read (mirrors StoryManager clues). */
    this.documents = new Set();
    this.onChange = null;
  }

  // --- core API -----------------------------------------------------------

  countItem(id) {
    return this.counts.get(id) || 0;
  }

  hasItem(id) {
    return this.countItem(id) > 0;
  }

  /** Returns true when the item was actually added (false for duplicate uniques). */
  addItem(id, amount = 1) {
    if (!id || amount <= 0) return false;
    const current = this.countItem(id);
    if (UNIQUE_ITEMS.has(id)) {
      if (current > 0) return false;
      this.counts.set(id, 1);
    } else {
      this.counts.set(id, current + amount);
    }
    this._changed(id);
    return true;
  }

  /** Removes up to `amount`; never goes below zero. Returns true if anything left. */
  removeItem(id, amount = 1) {
    if (!id || amount <= 0) return false;
    const current = this.countItem(id);
    if (current <= 0) return false;
    const next = Math.max(0, current - amount);
    if (next === 0) this.counts.delete(id);
    else this.counts.set(id, next);
    this._changed(id);
    return true;
  }

  /** Strict consume: only succeeds when the full amount is available. */
  consumeItem(id, amount = 1) {
    if (this.countItem(id) < amount) return false;
    return this.removeItem(id, amount);
  }

  /** DoorSystem contract. */
  hasKey(id) {
    return this.hasItem(id);
  }

  addDocument(docId) {
    if (!docId || this.documents.has(docId)) return false;
    this.documents.add(docId);
    return true;
  }

  clear() {
    this.counts.clear();
    this.documents.clear();
    this._changed(null);
  }

  _changed(id) {
    if (this.onChange) this.onChange(id, this);
  }

  // --- legacy read-only views (kept so prompts/HUD stay one-liners) --------

  get hasMop() { return this.hasItem('mop'); }
  get hasSpatula() { return this.hasItem('spatula'); }
  get hasOil() { return this.hasItem('oil'); }
  get hasOfficeKey() { return this.hasItem('office_key'); }
  get hasKeycard() { return this.hasItem('freezer_keycard'); }
  get hasShutterKey() { return this.hasItem('drive_thru_key'); }
  get hasCarKey() { return this.hasItem('car_key'); }
  get mysteryMeatCount() { return this.countItem('meat'); }
  get fuelCount() { return this.countItem('fuel'); }
}
