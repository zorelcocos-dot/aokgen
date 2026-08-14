import * as THREE from 'three';
import { HatchlingEntity } from '../entities/HatchlingEntity.js';
import { MonsterEntity } from '../entities/MonsterEntity.js';
import { DoorSystem } from '../engine/DoorSystem.js';
import { TimerRegistry } from '../engine/Timers.js';

/**
 * QuestManager - organic horror narrative progression.
 *
 * Progression is a strictly forward-only ladder of named steps. Nothing
 * assigns `currentStep` directly; every advance goes through setStep(), which
 * refuses to move backwards, and evaluateProgress(), which walks the ladder
 * upward for as long as canAdvanceToStep() is satisfied.
 *
 * That combination is what makes out-of-order exploration safe: if the player
 * pockets the keycard before ever punching in, punching in later fast-forwards
 * through every step whose prerequisites are already met instead of dropping
 * them back to an earlier objective or soft-locking.
 */

/** Canonical progression ladder. Order matters - these are compared with <, >. */
export const STEP = {
  INTRO: 0,       // still in the car on the shoulder of Route 17
  ARRIVAL: 1,     // out of the car, approaching Store #09
  RESTAURANT: 2,  // inside, clocked in, exploring the dining room
  OFFICE: 3,      // manager's office open
  FREEZER: 4,     // keycard in hand, vault #4 ahead
  MEAT: 5,        // vault open, collecting what is inside
  BLACKOUT: 6,    // the fryers did something, the grid is gone
  GENERATOR: 7,   // diesel gathered, generator room south
  COLONEL: 8,     // power back, he is here
  ESCAPE: 9,      // green key taken, get to the car
  ENDING: 10
};

const STEP_NAMES = Object.keys(STEP);

export class QuestManager {
  constructor(options) {
    this.scene = options.scene;
    this.audio = options.audio;
    this.lighting = options.lighting;
    this.levelBuilder = options.levelBuilder;
    this.monster = options.monster;
    this.player = options.player;
    this.propsTexture = options.propsTexture;
    this.colonelTexture = options.colonelTexture;
    this.hatchlingTexture = options.hatchlingTexture;
    this.story = options.storyManager;
    this.eventManager = options.eventManager;
    /** Back-reference used to hand one-shot signals to the event context. */
    this.game = options.game || null;

    this.currentStep = STEP.INTRO;
    this.gameWon = false;
    this.gameOver = false;

    // One-shot latches. Every irreversible world event checks its latch first
    // so it can never fire twice (double blackout, two colonels, two car keys).
    this.blackoutTriggered = false;
    this.colonelSpawned = false;
    this.carKeySpawned = false;
    this.safeOpened = false;
    this.hasExitedCar = false;

    this.punchedIn = false;
    /** Ambient-event counters read by EventManager's context. */
    this.portraitStares = 0;
    this._staring = false;
    this.greaseCleanedCount = 0;
    this.totalGreaseSpills = this.levelBuilder?.greaseSpills?.length ?? 3;

    this.mysteryMeatLoaded = 0;
    this.totalMysteryMeat = 2;

    this.generatorFuelCount = 0;
    this.requiredFuel = 2;

    this.officeUnlocked = false;
    this.freezerUnlocked = false;
    this.generatorPowered = false;

    this.meatMeshes = [];
    this.hatchlings = [];
    this.colonel = null;
    this.doorSystem = null;
    /** Everything spawned at runtime, so a restart can remove all of it. */
    this.spawnedObjects = [];

    this.objectiveTarget = null;
    this.objectiveTime = 0;
    this.objectiveWorldPosition = new THREE.Vector3();
    this._resolvedTarget = null;
    this._targetTimer = 0;
    this.completedObjectives = new Set();
    this._firedBeats = new Set();

    /** Deferred callbacks (banners, modals) - cleared wholesale on restart. */
    this.timers = new TimerRegistry();
    /** Live [target, event, handler] list for modal listeners. */
    this._modalListeners = [];

    this.initDoorSystem(options.colliders);
    this.initInteractiveItems();
    this.createObjectiveMarker();
    this.updateHUD();
  }

  // ---------------------------------------------------------------- progression

  /**
   * Prerequisites for entering a step. Pure predicate - no side effects, so it
   * is safe to poll. A step is reachable only when every earlier step's
   * requirement is also satisfied, which evaluateProgress() guarantees by
   * walking the ladder one rung at a time.
   */
  canAdvanceToStep(step) {
    const inv = this.player.inventory;
    switch (step) {
      case STEP.ARRIVAL:    return this.hasExitedCar;
      case STEP.RESTAURANT: return this.punchedIn;
      case STEP.OFFICE:     return this.officeUnlocked;
      case STEP.FREEZER:    return inv.hasItem('freezer_keycard');
      case STEP.MEAT:       return this.freezerUnlocked;
      case STEP.BLACKOUT:   return this.blackoutTriggered;
      case STEP.GENERATOR:  return this.generatorPowered || inv.countItem('fuel') >= this.requiredFuel;
      case STEP.COLONEL:    return this.generatorPowered;
      case STEP.ESCAPE:     return inv.hasItem('drive_thru_key');
      case STEP.ENDING:     return this.gameWon;
      default:              return false;
    }
  }

  /**
   * Forward-only step assignment. Returns true if the step actually changed.
   * This is the ONLY place `currentStep` is written.
   *
   * Unforced advances are validated twice: one rung at a time, and only when
   * that rung's prerequisites are actually satisfied. That means no caller -
   * not even a future one - can jump the ladder and strand the objectives
   * behind it; skipping is exclusively the `force` path (intro seed, ending).
   */
  setStep(step, force = false) {
    if (step <= this.currentStep) return false;
    if (!force) {
      if (this.gameOver || this.gameWon) return false;
      if (step !== this.currentStep + 1) return false;
      if (!this.canAdvanceToStep(step)) return false;
    }
    this.currentStep = step;
    this.triggerStoryBeat(step);
    this.updateHUD();
    return true;
  }

  /**
   * Climbs the ladder as far as the world state allows. Called after every
   * event that could satisfy a prerequisite.
   */
  evaluateProgress() {
    let advanced = false;
    while (this.currentStep < STEP.ENDING && this.canAdvanceToStep(this.currentStep + 1)) {
      if (!this.setStep(this.currentStep + 1)) break;
      advanced = true;
    }
    if (!advanced) this.updateHUD();
    return advanced;
  }

  /**
   * Marks a named objective done and re-evaluates progression. Everything that
   * completes a beat funnels through here so the HUD and the marker can never
   * drift out of sync with world state.
   */
  completeObjective(name) {
    this.completedObjectives.add(name);
    this.refreshObjectiveTarget();
    this.evaluateProgress();
  }

  /**
   * Fires the StoryManager beat that belongs to a step, exactly once.
   * StoryManager ignores repeats too, but latching here keeps the audio and
   * banner side effects single-shot as well.
   */
  triggerStoryBeat(step) {
    const beat = {
      [STEP.INTRO]: 'INTRO',
      [STEP.ARRIVAL]: 'ARRIVAL',
      [STEP.RESTAURANT]: 'FIRST_CLUE',
      [STEP.FREEZER]: 'FREEZER',
      [STEP.BLACKOUT]: 'BLACKOUT',
      [STEP.GENERATOR]: 'GENERATOR',
      [STEP.COLONEL]: 'COLONEL',
      [STEP.ESCAPE]: 'ESCAPE',
      [STEP.ENDING]: 'ENDING'
    }[step];
    if (!beat || this._firedBeats.has(beat)) return;
    this._firedBeats.add(beat);
    this.story?.progressBeat(beat);
  }

  initDoorSystem(extraColliders = []) {
    this.doorSystem = new DoorSystem(this.scene, this.audio);

    // Office door (requires office key) - aesthetic sliding? Use swing
    this.doorSystem.createDoor({
      name: 'office_main',
      // Hinged at z=10.4, leaf spans the 1.2m doorway to z=11.6.
      x: -14, y: 1.15, z: 10.4,
      rotation: 0,
      width: 0.12, height: 2.3, depth: 1.2,
      type: 'office',
      locked: true,
      keyId: 'office_key',
      lockedMessage: 'Locked - office key needed. Maybe in kitchen?',
      unlockMessage: 'Office unlocked.',
      hasWindow: true,
      anomaly: true
    });

    // Janitor closet in restroom (free)
    this.doorSystem.createDoor({
      name: 'janitor_closet',
      // Fills the 1.2m doorway cut into the restroom/janitor divider at z=-24.
      x: -23.1, y: 1.15, z: -24,
      rotation: Math.PI / 2,
      width: 0.12, height: 2.3, depth: 1.2,
      type: 'bathroom',
      locked: false,
      lockedMessage: '',
      anomaly: false
    });

    // Storage door (southwest) - unlocked but creaky
    this.doorSystem.createDoor({
      name: 'storage_door',
      // Fills the doorway in the storage room's north wall (x -18.6..-17.4).
      // The wall runs along X, so the leaf must sweep along X too.
      x: -18.6, y: 1.15, z: 22,
      rotation: Math.PI / 2,
      width: 0.12, height: 2.3, depth: 1.2,
      type: 'office',
      locked: false,
      anomaly: true
    });

    // Generator room door - free, autoClose for tension
    this.doorSystem.createDoor({
      name: 'generator_door',
      // Fills the doorway in the kitchen/basement divider (x -2..-0.8).
      x: -2, y: 1.15, z: 22,
      rotation: Math.PI / 2,
      width: 0.12, height: 2.3, depth: 1.2,
      type: 'metal',
      locked: false,
      autoClose: true,
      autoCloseDelay: 8,
      anomaly: true
    });

    // Freezer vault - heavy sliding slab, opened with the yellow keycard.
    // Reuses the PBR freezer-door material LevelBuilder already generates.
    this.doorSystem.createDoor({
      name: 'freezer_vault',
      x: 14, y: 1.5, z: 11,
      width: 0.22, height: 3.0, depth: 2.2,
      kinematics: 'slide',
      slideAxis: new THREE.Vector3(1, 0, 0),
      slideDistance: 1.8,
      slideSpeed: 0.55,
      material: this.levelBuilder.materials?.freezerDoor,
      locked: true,
      keyId: 'freezer_keycard',
      consumeKey: false,
      lockedMessage: 'VAULT LOCKED - needs the yellow keycard.',
      unlockMessage: 'VAULT #4 UNLOCKED - COLD STORAGE',
      openLabel: 'Open vault',
      closeLabel: 'Close vault',
      frame: false,
      handle: false,
      anomaly: false
    });

    // Drive-thru window - slides open once, never closes again (escape route).
    this.doorSystem.createDoor({
      name: 'drive_thru_window',
      x: -30, y: 2.0, z: 5.0,
      width: 0.08, height: 1.9, depth: 1.9,
      kinematics: 'slide',
      slideAxis: new THREE.Vector3(0, 0, 1),
      slideDistance: 1.6,
      slideSpeed: 0.9,
      material: this.levelBuilder.materials?.glass,
      locked: true,
      keyId: 'drive_thru_key',
      consumeKey: false,
      oneWay: true,
      lockedMessage: 'Locked from the inside - a green key would open it.',
      unlockMessage: 'The drive-thru window slides open. Cold air outside.',
      openLabel: 'Unlock drive-thru window',
      frame: false,
      handle: false,
      anomaly: false
    });

    // Front entrance: visual only, the doorway itself is an open gap.
    this.doorSystem.createDoor({
      name: 'front_entrance',
      x: 0, y: 1.15, z: -30,
      rotation: 0,
      type: 'office',
      locked: false,
      hasWindow: false,
      interactive: false // no collider needed
    });

    // Register door leaves as interactables exactly once (the hinge group is
    // not pushed - raycast walks up to it via the leaf's parent chain).
    for (const door of this.doorSystem.doors.values()) {
      if (door.interactive && door.mesh) {
        this.levelBuilder.propFactory.interactables.push(door.mesh);
      }
    }

    if (this.player) this.player.questManager = this;
  }

  initInteractiveItems() {
    const pf = this.levelBuilder.propFactory;

    // --- STAGE 0: CAR ---
    // Already car exists in LevelBuilder, but we need car key & fuel optional?

    // Timecard machine (front counter)
    const clockGeo = new THREE.BoxGeometry(0.34, 0.48, 0.22);
    const clockMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45 });
    this.punchClockMesh = new THREE.Mesh(clockGeo, clockMat);
    this.punchClockMesh.position.set(-2, 1.42, -4.5);
    this.punchClockMesh.userData = { type: 'punch_clock', punched: false };
    this.scene.add(this.punchClockMesh);
    pf.interactables.push(this.punchClockMesh);

    // Office Key - in kitchen, on magnet board near fryer (logical: manager leaves key at kitchen)
    pf.createOfficeKey(0.3, 1.08, 10.2);

    // Yellow Keycard - hidden in ball pit
    // On the pit rim, not sunk inside the pit's solid collider (which the
    // player cannot enter and cannot reach past with a 3.8m interact ray).
    this.keycardMesh = pf.createKeyCard(20.4, 1.02, -13.4);

    // Meat bags in freezer vault - 2
    const meatMat = new THREE.MeshStandardMaterial({ color: 0x7a1a28, roughness: 0.58 });
    const meat1 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.44), meatMat);
    meat1.position.set(20, 0.22, 7);
    meat1.userData = { type: 'meat_pickup' };
    this.scene.add(meat1);
    pf.interactables.push(meat1);
    const meat2 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.44), meatMat);
    meat2.position.set(24.5, 0.22, 14);
    meat2.userData = { type: 'meat_pickup' };
    this.scene.add(meat2);
    pf.interactables.push(meat2);
    this.meatMeshes.push(meat1, meat2);

    // Documents - place logically

    // Document timecard extra? Actually punch clock handles that doc, but add physical readable version
    pf.createDocument(-1.6, 1.4, -4.3, {
      docId: 'timecard_0314',
      title: 'Timecard - 03:14',
      flat: false
    });

    pf.createClipboard(-0.4, 2.05, -1.2, 'schedule_clipboard');

    // Emergency broadcast transcript. StoryManager counts 11 clues and the HUD
    // reads "CLUES x/11", but this one had no pickup anywhere in the level, so
    // a full clue sweep (and the honest 11/11 ending) was impossible. It sits
    // by the dispatch radio on the office desk, which is where the transcript
    // in its own text says it was printed.
    pf.createDocument(-22.6, 0.88, 9.6, {
      docId: 'radio_transcript',
      title: 'Emergency Broadcast Transcript',
      flat: true,
      rotation: -0.35
    });

    // Incident report in office desk
    pf.createDocument(-21.7, 0.88, 10.2, {
      docId: 'incident_report',
      title: 'Incident Report',
      flat: true,
      rotation: 0.2
    });

    // Employee photo on office wall
    pf.createPhotoFrame(-29.65, 2.0, 14, 'employee_photo', '/assets/employee_hands.jpg');

    // Meat manifest inside freezer on shelf
    // Leaning on the freezer shelf, not inside the slab (x 19.85..20.15).
    pf.createDocument(20.45, 1.1, 6.5, {
      docId: 'meat_manifest',
      title: 'Delivery Manifest',
      flat: false
    });

    // Generator log on generator body
    // Clipped to the generator's front face; the body proxy ends at z=26.8.
    pf.createDocument(1.2, 1.0, 26.45, {
      docId: 'generator_log',
      title: 'Generator Log',
      flat: false
    });

    // CCTV note on monitor wall
    pf.createDocument(-29.65, 1.7, 7.4, {
      docId: 'cctv_note',
      title: 'Post-it CCTV',
      flat: false
    });

    // Child drawing in ball pit (hidden)
    pf.createDocument(19.2, 1.0, -13.5, {
      docId: 'child_drawing',
      title: 'Crayon Drawing',
      flat: true,
      important: true
    });

    // Grinder receipt secret - behind generator hidden wall (will be revealed after fuel)
    // In the pocket in front of the false wall (slab spans z 33.61..33.99).
    pf.createDocument(0, 0.95, 33.35, {
      docId: 'grinder_receipt',
      title: 'Grinder Receipt',
      flat: false
    });

    // Colonel note secret behind portrait (will only be interactable after portrait trigger)
    const secretNote = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.52, 0.36),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    secretNote.position.set(0, 2.5, -29.5);
    secretNote.userData = { type: 'document', docId: 'colonel_note', docTitle: 'Letter behind frame', content: '' };
    secretNote.name = 'colonel_secret_note';
    this.scene.add(secretNote);
    pf.interactables.push(secretNote);
    this.secretNote = secretNote;
    secretNote.visible = false;

    // Soda (health) - dining booth tables
    pf.createSodaCan(-8, 0.96, -22.2);
    pf.createSodaCan(8, 0.96, -14.2);
    pf.createSodaCan(-22, 0.95, 8.4); // office desk

    // Batteries - service counter, dining booth, kitchen island, south crate hidden
    pf.createBatteryPickup(-1.8, 1.35, -4.5);
    pf.createBatteryPickup(-8, 0.96, -8.2);
    pf.createBatteryPickup(0, 1.08, 10.0);
    pf.createBatteryPickup(12, 1.0, 30.8);

    // Fuel cans - janitor closet restroom + storage
    pf.createFuelCan(-22.8, 0.28, -27.5); // janitor closet west restroom
    pf.createFuelCan(-22.2, 0.38, 23.8); // storage

    // Office safe. Its keypad is dead until the generator runs, and opening it
    // is the only way the single car key ever enters the world.
    this.safeMesh = pf.createSafe(-24.8, 0.85, 16);
    this.carKeySpawnPos = new THREE.Vector3(-24.8, 0.9, 16.6);

    // Phone in office - dead but interactive for story
    pf.createPhone(-20.8, 0.88, 10.4);

    // Hiding spots already added in LevelBuilder, but ensure interactables contain them
  }

  createObjectiveMarker() {
    // Subtle objective marker - not giant yellow wireframe, but faint light mote
    const markerGeo = new THREE.SphereGeometry(0.16, 8, 8);
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.0 // will fade in
    });
    this.objectiveMarker = new THREE.Mesh(markerGeo, markerMat);
    this.scene.add(this.objectiveMarker);
    this.objectiveMarker.visible = false;
  }

  /**
   * Objective panel. Driven entirely by STEP + the inventory, and only
   * touches the DOM when the text actually changed - this runs on every
   * progression event, not per frame, but the guard keeps restarts cheap.
   */
  updateHUD() {
    const titleEl = document.getElementById('task-title');
    const descEl = document.getElementById('task-description');
    if (!descEl) return;

    const inv = this.player.inventory;
    let title = STEP_NAMES[this.currentStep] || 'SURVIVE';
    let desc = this.story?.getObjectiveText(this.currentStep) || 'Survive the night.';

    switch (this.currentStep) {
      case STEP.INTRO:
        title = 'STRANDED';
        desc = 'The car is dead. There are lights on inside the restaurant.';
        break;

      case STEP.ARRIVAL:
        title = 'THE NIGHT SHIFT';
        desc = this.punchedIn
          ? 'You are on the clock. Look around - something is off about this place.'
          : 'The timeclock still reads <b>03:14 AM</b>. Someone never punched out. Clock in?';
        break;

      case STEP.RESTAURANT:
        title = 'THE MANAGER\'S OFFICE';
        if (!inv.hasItem('office_key')) desc = 'The office is locked. The manager kept his key near the kitchen.';
        else if (!this.officeUnlocked) desc = 'You have the office key. The door is on the west side.';
        else desc = 'Search the office. Records, cameras, anything that explains tonight.';
        break;

      case STEP.OFFICE:
        title = 'VAULT #4';
        desc = inv.hasItem('freezer_keycard')
          ? 'You have the keycard. The walk-in freezer is on the east wall.'
          : 'The records mention a keycard lost in the PlayPlace ball pit.';
        break;

      case STEP.FREEZER:
        title = 'VAULT #4';
        desc = this.freezerUnlocked
          ? 'The vault is open. Whatever is in there, look at it properly.'
          : 'Swipe the keycard on the freezer vault, east side of the kitchen.';
        break;

      case STEP.MEAT: {
        const got = inv.countItem('meat');
        title = 'WHAT\'S IN THE MEAT';
        desc = got > 0
          ? `Load the fryers and find out what they have been serving. <span class="dim">(${this.mysteryMeatLoaded}/${this.totalMysteryMeat})</span>`
          : `Collect the marked bags from the vault. <span class="dim">(${this.mysteryMeatLoaded}/${this.totalMysteryMeat})</span>`;
        break;
      }

      case STEP.BLACKOUT: {
        const fuel = inv.countItem('fuel');
        title = 'BLACKOUT';
        desc = fuel < this.requiredFuel
          ? `The breaker is gone. Find diesel - janitor closet, storage room. <span class="dim">(${fuel}/${this.requiredFuel})</span>`
          : 'You have the fuel. The generator is in the south room.';
        break;
      }

      case STEP.GENERATOR:
        title = 'GENERATOR';
        desc = this.generatorPowered
          ? 'Power is back. It did not come back alone.'
          : `Refuel and start the generator. <span class="dim">(${this.generatorFuelCount}/${this.requiredFuel})</span>`;
        break;

      case STEP.COLONEL:
        title = 'THE MAN IN WHITE';
        desc = inv.hasItem('drive_thru_key')
          ? 'You have his key. The drive-thru window is your way out.'
          : '<span style="color:#f87171">He is walking.</span> Stun him with boiling oil and take the green key.';
        break;

      case STEP.ESCAPE:
        title = 'ESCAPE';
        if (!inv.hasItem('car_key')) {
          desc = this.carKeySpawned
            ? 'The car key is in the office safe. Take it.'
            : 'You need your car key. The manager locked it in the office safe.';
        } else {
          desc = 'Out through the drive-thru window. Get to the car and drive.';
        }
        break;

      case STEP.ENDING:
        title = 'OUT';
        desc = 'Drive.';
        break;
    }

    if (titleEl && titleEl.textContent !== title) titleEl.textContent = title;
    if (descEl.innerHTML !== desc) descEl.innerHTML = desc;
  }

  /**
   * Single dispatch point for every world interaction.
   *
   * Each branch is responsible for exactly one thing and then calls
   * completeObjective() / evaluateProgress(); no branch writes `currentStep`
   * directly and no branch moves a door by hand.
   */
  handleInteraction(data, object) {
    if (!data || this.gameWon || this.gameOver) return;
    const inv = this.player.inventory;
    // Any interaction can invalidate the objective (pickup, door, spawn), so
    // the marker re-resolves on the very next frame instead of the next tick.
    this.refreshObjectiveTarget();

    switch (data.type) {
      // ------------------------------------------------------------ documents
      case 'document': {
        if (!data.docId) return;
        // StoryManager.discoveredClues is the single clue tally; the inventory
        // copy is only a record of what the player physically carries.
        const doc = this.story?.discoverClue(data.docId) || null;
        this.showDocument(data.docId, doc);
        inv.addDocument(data.docId);
        if (data.docId === 'colonel_note' && this.story) this.story.secretFound = true;
        this.updateHUD();
        return;
      }

      // ------------------------------------------------------------- clock in
      case 'punch_clock': {
        if (this.punchedIn) return;
        this.punchedIn = true;
        data.punched = true;
        this.audio?.playTimecardPunch();
        this.showBanner('PUNCHED IN 03:14 AM - SHIFT STARTED', 2600);
        this.player.showNotification('Clocked in. Something is wrong.');
        // The timecard itself is a readable document on the counter - the
        // player has to actually read it to score the clue.
        this.completeObjective('punch_in');
        return;
      }

      // -------------------------------------------------------------- pickups
      case 'mop_pickup': {
        if (!inv.addItem('mop')) return;
        this.consumePickup(object);
        this.player.selectSlot('mop');
        this.audio?.playMopSlosh();
        this.showBanner('INDUSTRIAL MOP EQUIPPED', 2000);
        this.player.showNotification('Mop acquired - cleans grease, swats hatchlings');
        this.completeObjective('mop');
        return;
      }

      case 'office_key_pickup': {
        if (!inv.addItem('office_key')) return;
        this.consumePickup(object);
        this.audio?.playAccessGranted();
        this.showBanner('OFFICE KEY', 2000);
        this.player.showNotification('+ Office key');
        this.completeObjective('office_key');
        return;
      }

      case 'keycard_pickup': {
        if (!inv.addItem('freezer_keycard')) return;
        this.consumePickup(object);
        this.audio?.playAccessGranted();
        this.showBanner('YELLOW KEYCARD - FREEZER VAULT #4', 2600);
        this.player.showNotification('+ Freezer keycard - the child hid it well');
        this.completeObjective('keycard');
        return;
      }

      case 'oil_pitcher_pickup': {
        if (!inv.addItem('oil')) return;
        this.consumePickup(object);
        this.player.selectSlot('oil');
        this.audio?.playAccessGranted();
        this.showBanner('BOILING OIL PITCHER', 2000);
        this.player.showNotification('+ Boiling oil - stuns him');
        this.completeObjective('oil');
        return;
      }

      case 'shutter_key_pickup': {
        if (!inv.addItem('drive_thru_key')) return;
        this.consumePickup(object);
        this.audio?.playAccessGranted();
        this.showBanner('GREEN KEY - DRIVE-THRU', 2400);
        this.player.showNotification('+ Drive-thru key');
        this.completeObjective('shutter_key');
        return;
      }

      case 'car_key_pickup': {
        if (!inv.addItem('car_key')) return;
        this.consumePickup(object);
        this.audio?.playAccessGranted();
        this.showBanner('CAR KEY - ESCAPE', 2400);
        this.player.showNotification('+ Car key');
        this.completeObjective('car_key');
        return;
      }

      case 'fuel_can_pickup': {
        inv.addItem('fuel');
        this.consumePickup(object);
        this.audio?.playAccessGranted();
        this.player.showNotification(
          `+ Diesel can ${Math.min(inv.countItem('fuel'), this.requiredFuel)}/${this.requiredFuel}`
        );
        this.completeObjective('fuel');
        return;
      }

      case 'meat_pickup': {
        inv.addItem('meat');
        this.consumePickup(object);
        this.audio?.playAccessGranted();
        this.player.showNotification(
          `+ Meat bag ${inv.countItem('meat')}/${this.totalMysteryMeat} - it is still warm`
        );
        this.updateHUD();
        return;
      }

      // ------------------------------------------------------------- consumed
      case 'soda_pickup': {
        this.player.heal(32);
        this.consumePickup(object);
        return;
      }

      case 'battery_pickup': {
        this.player.rechargeBattery(44);
        this.consumePickup(object);
        return;
      }

      // ----------------------------------------------------------------- doors
      case 'door': {
        this.handleDoorInteraction(data.doorName);
        return;
      }

      // ----------------------------------------------------------------- fryer
      case 'fryer_station': {
        const max = data.maxMeat || this.totalMysteryMeat;
        const loaded = data.loadedCount || 0;
        if (loaded >= max) {
          this.player.showNotification('The fryers cannot take any more.');
          return;
        }
        if (!inv.consumeItem('meat')) {
          this.player.showNotification('Needs meat bags from the vault.');
          return;
        }
        data.loadedCount = loaded + 1;
        data.hasMeat = data.loadedCount >= max;
        this.mysteryMeatLoaded = data.loadedCount;
        this.audio?.playHotOilSplash();
        this.player.showNotification(`Meat in the fryer (${this.mysteryMeatLoaded}/${max})`);
        if (this.mysteryMeatLoaded >= max) this.triggerBlackoutOutbreak();
        this.updateHUD();
        return;
      }

      // ------------------------------------------------------------- generator
      case 'generator': {
        if (this.currentStep < STEP.BLACKOUT) {
          this.showBanner('The generator is cold. No reason to touch it yet.', 2000);
          return;
        }
        if (data.fueled) {
          this.player.showNotification('The generator is already running.');
          return;
        }
        if (!inv.consumeItem('fuel')) {
          this.showBanner('NEEDS DIESEL - JANITOR CLOSET AND STORAGE', 2600);
          return;
        }
        data.fuelCount = Math.min((data.fuelCount || 0) + 1, data.requiredFuel);
        this.generatorFuelCount = data.fuelCount;
        this.audio?.playBreakerRestore();
        this.player.showNotification(`Generator refuelled ${data.fuelCount}/${data.requiredFuel}`);
        if (data.fuelCount >= data.requiredFuel) {
          data.fueled = true;
          this.generatorPowered = true;
          this.lighting.setPower(true);
          this.audio?.setGeneratorHum(true);
          this.showBanner('POWER RESTORED - HE IS HERE', 3200);
          if (this.game) this.game._pendingGeneratorEvent = true;
          this.triggerColonelBoss();
        }
        this.evaluateProgress();
        return;
      }

      // --------------------------------------------------------------- fixtures
      // The breaker panels are interactable and prompt "[E] Reset breaker", but
      // nothing handled them - the prompt was a lie. They now answer honestly
      // and point at the generator, which is what the blackout is about.
      case 'breaker': {
        if (!this.blackoutTriggered) {
          this.player.showNotification('Every breaker is closed. The grid is fine. For now.');
          return;
        }
        if (this.generatorPowered) {
          this.player.showNotification('Green across the panel. The generator is carrying the store.');
          return;
        }
        data.isTripped = true;
        data.indicator?.color.setHex(0xef4444);
        this.audio?.playDoorLocked(null, 0.3);
        this.showBanner('BUS BAR SLAGGED - MAINS ARE GONE', 2600);
        this.player.showNotification('The lever moves and nothing happens. You need the generator.');
        return;
      }

      case 'phone': {
        this.audio?.playRadioStatic(0.4);
        this.showBanner('LINE DEAD... THEN BREATHING', 2800);
        this.player.showNotification('The phone is dead.');
        return;
      }

      case 'cctv_monitor': {
        this.story?.watchCCTV(data.camId);
        this.showCCTVFeed(data.camId);
        return;
      }

      case 'safe': {
        if (this.safeOpened) {
          this.player.showNotification('The safe is empty.');
          return;
        }
        if (!this.generatorPowered) {
          this.showBanner('SAFE LOCKED - THE KEYPAD HAS NO POWER', 2400);
          return;
        }
        this.safeOpened = true;
        data.isOpen = true;
        this.spawnCarKey();
        this.showBanner('SAFE OPEN - CAR KEY INSIDE', 2600);
        return;
      }

      // -------------------------------------------------------------- the car
      case 'car': {
        if (this.currentStep >= STEP.ESCAPE && inv.hasItem('car_key')) {
          this.triggerVictory();
        } else if (this.currentStep <= STEP.ARRIVAL) {
          this.showBanner('Dead battery, fuel on the asphalt. You need shelter.', 3000);
        } else if (!inv.hasItem('car_key')) {
          this.showBanner('No key. The manager kept one in the office safe.', 2600);
        } else {
          this.showBanner('Not yet - he is still between you and the road.', 2400);
        }
        return;
      }

      default:
        return;
    }
  }

  /**
   * Doors route through DoorSystem for the physical open/close and only report
   * quest-relevant consequences back here.
   */
  handleDoorInteraction(doorName) {
    if (!doorName) return;
    const result = this.doorSystem.tryInteract(doorName, this.player.inventory, this.lighting);
    if (!result) return;
    if (result.message) this.player.showNotification(result.message);

    if (result.unlocked) {
      if (doorName === 'office_main') {
        this.officeUnlocked = true;
        this.completeObjective('office_door');
      } else if (doorName === 'freezer_vault') {
        this.freezerUnlocked = true;
        this.showBanner('VAULT #4 UNLOCKED - COLD STORAGE', 2600);
        this.completeObjective('freezer_vault');
      } else if (doorName === 'drive_thru_window') {
        this.completeObjective('drive_thru_open');
      }
    }

    // The drive-thru window is the alternate exit: stepping through it once it
    // is open and the escape step is live ends the run.
    if (doorName === 'drive_thru_window' && result.opened && this.currentStep >= STEP.ESCAPE) {
      this.showBanner('The window is open. Go.', 2200);
    }
  }

  /** Puts a previously consumed pickup back into the interactable list. */
  restoreInteractable(object) {
    const list = this.levelBuilder?.propFactory?.interactables;
    if (list && object && !list.includes(object)) list.push(object);
  }

  /** Hides a one-shot pickup and takes it out of every live list. */
  consumePickup(object) {
    if (!object) return;
    object.visible = false;
    this.removeInteractable(object);
  }

  /** Spawns the single car key. Guarded so it can never exist twice. */
  spawnCarKey() {
    if (this.carKeySpawned) return;
    this.carKeySpawned = true;
    const carKey = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.08, 0.26),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 })
    );
    carKey.position.copy(this.carKeySpawnPos);
    carKey.userData = { type: 'car_key_pickup' };
    carKey.name = 'car_key';
    this.scene.add(carKey);
    this.levelBuilder.propFactory.interactables.push(carKey);
    this.spawnedObjects.push(carKey);
  }


  handleMopAction(playerPos) {
    const spills = this.levelBuilder.greaseSpills || [];
    const spill = spills.find(c => {
      if (!c || c.userData.cleaned) return false;
      return playerPos.distanceTo(c.position) < 4.2;
    });

    if (spill) {
      spill.userData.cleanProgress = (spill.userData.cleanProgress || 0) + 0.42;
      if (spill.material) spill.material.opacity = Math.max(0, 0.9 - spill.userData.cleanProgress);
      if (spill.userData.cleanProgress >= 1.0) {
        spill.userData.cleaned = true;
        spill.visible = false;
        this.removeInteractable(spill);
        this.greaseCleanedCount++;
        this.player.showNotification(`Grease cleaned ${this.greaseCleanedCount}/${this.totalGreaseSpills}`);
        if (this.greaseCleanedCount >= this.totalGreaseSpills) {
          this.showBanner('FLOOR CLEAN - THE SMELL IS STILL THERE', 2400);
          this.completeObjective('grease');
        } else {
          this.updateHUD();
        }
      }
    }
  }

  triggerBlackoutOutbreak() {
    if (this.blackoutTriggered) return;
    this.blackoutTriggered = true;
    this.lighting.setPower(false);
    this.audio?.playJumpscareStinger(0.65);
    this.audio?.playMonsterScreech(0.5);
    this.audio?.setGeneratorHum(false);
    this.showBanner('⚠ GRID OVERLOAD - GENERATOR OFFLINE', 3200);

    // Spawn chicken monster in dining hall
    if (this.monster) {
      this.monster.spawn(new THREE.Vector3(0, 0, -12));
    }

    // Spawn hatchlings
    if (this.hatchlingTexture) {
      const positions = [
        new THREE.Vector3(22, 0.45, -18),
        new THREE.Vector3(-22, 0.45, -21),
        new THREE.Vector3(0, 0.45, 10.5),
        new THREE.Vector3(0, 0.45, 27)
      ];
      positions.forEach(pos => {
        const h = new HatchlingEntity({
          scene: this.scene,
          texture: this.hatchlingTexture,
          spawnPos: pos,
          audio: this.audio,
          colliders: this.player?.colliders,
          doorSystem: this.doorSystem
        });
        this.hatchlings.push(h);
      });
    }

    // Oil pitcher on prep island
    const pitchMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.12 });
    const pitcher = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.48, 16), pitchMat);
    pitcher.position.set(0, 1.32, 10);
    pitcher.userData = { type: 'oil_pitcher_pickup' };
    pitcher.name = 'oil_pitcher';
    this.scene.add(pitcher);
    this.levelBuilder.propFactory.interactables.push(pitcher);
    this.spawnedObjects.push(pitcher);
    this.player.showNotification('BOILING OIL PITCHER - PREP TABLE', 2800);

    this.evaluateProgress();
    this.lighting?.triggerFlickerBurst(1.2, 1.8);
  }

  triggerColonelBoss() {
    if (this.colonelSpawned) return;
    this.colonelSpawned = true;

    if (this.colonelTexture) {
      this.colonel = new MonsterEntity({
        scene: this.scene,
        texture: this.colonelTexture,
        audio: this.audio,
        type: 'colonel',
        colliders: this.player?.colliders,
        doorSystem: this.doorSystem
      });
      this.colonel.spawn(new THREE.Vector3(0, 0, -5));
      this.colonel.returnPos.set(0, 0, -5);
    }

    // Drive-thru key on front counter (manager dropped)
    const keyMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.2, emissive: 0x116a33, emissiveIntensity: 0.42 });
    const shutterKey = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.42), keyMat);
    shutterKey.position.set(2.1, 1.32, -4.5);
    shutterKey.userData = { type: 'shutter_key_pickup' };
    shutterKey.name = 'shutter_key';
    this.scene.add(shutterKey);
    this.levelBuilder.propFactory.interactables.push(shutterKey);
    this.spawnedObjects.push(shutterKey);

    // The note behind the portrait is only readable once he has walked out of it.
    if (this.secretNote) this.secretNote.visible = true;

    this.evaluateProgress();
  }

  /**
   * Modal helper. Binds the close listeners immediately (no setTimeout race)
   * and tears every one of them down on close, so reopening a document twenty
   * times leaves exactly zero stale listeners behind.
   */
  openModal(modal, onClose) {
    this.closeModal();
    modal.classList.add('visible');

    const close = () => {
      modal.classList.remove('visible');
      for (const [t, ev, fn] of this._modalListeners) t.removeEventListener(ev, fn);
      this._modalListeners.length = 0;
      this._activeModal = null;
      this._docOpen = false;
      onClose?.();
    };

    const onKey = (e) => {
      if (e.code === 'Escape' || e.code === 'KeyE' || e.code === 'KeyR') {
        e.preventDefault();
        close();
      }
    };
    const onClick = () => close();

    // Bound on the next frame so the very keypress that opened the modal
    // cannot also close it.
    this.timers.setTimeout(() => {
      if (this._activeModal !== modal) return;
      document.addEventListener('keydown', onKey);
      modal.addEventListener('click', onClick);
      this._modalListeners.push([document, 'keydown', onKey], [modal, 'click', onClick]);
    }, 90);

    this._activeModal = modal;
    this._docOpen = true;
    return close;
  }

  /** True only while the CCTV feed is actually on screen. */
  isWatchingCCTV() {
    return this._activeModal?.id === 'cctv-modal';
  }

  /** Force-closes whatever modal is open (restart, death, victory). */
  closeModal() {
    for (const [t, ev, fn] of this._modalListeners) t.removeEventListener(ev, fn);
    this._modalListeners.length = 0;
    this._activeModal?.classList.remove('visible');
    this._activeModal = null;
    this._docOpen = false;
  }

  showDocument(docId, docData) {
    const modal = document.getElementById('document-modal');
    if (!modal) return;

    const fullDoc = this.story?.documents?.get(docId);
    const display = docData?.content ? docData : fullDoc;
    if (!display) return;

    const titleEl = document.getElementById('doc-title');
    const contentEl = document.getElementById('doc-content');
    const typeEl = document.getElementById('doc-type');
    if (titleEl) titleEl.textContent = display.title || docId;
    if (typeEl) typeEl.textContent = display.type || 'NOTE';
    if (contentEl) contentEl.textContent = display.content || '';

    this.openModal(modal);
    this.audio?.playPaperRead();
    this.showBanner(`FOUND: ${display.title}`, 2400);
  }

  showCCTVFeed(camId) {
    const modal = document.getElementById('cctv-modal');
    if (!modal) return;
    const feed = this.story?.cctvFeeds?.find(f => f.id === camId);
    const titleEl = document.getElementById('cctv-title');
    if (titleEl && feed) titleEl.textContent = feed.name + (feed.disturbance ? ' [!]' : '');

    const anomaly = document.getElementById('cctv-anomaly');
    this.openModal(modal, () => anomaly?.classList.remove('active'));
    this.audio?.playCCTVGlitch();

    // Something walks past the lens on the disturbed cameras.
    if (feed?.disturbance && Math.random() < 0.7 && anomaly) {
      this.timers.setTimeout(() => {
        if (!modal.classList.contains('visible')) return;
        anomaly.classList.add('active');
        this.timers.setTimeout(() => anomaly.classList.remove('active'), 800);
      }, 1300 + Math.random() * 800);
    }
  }

  /**
   * Resolves what the objective marker should point at for the current step.
   * Returns null whenever the answer would be "nothing useful" - the marker is
   * a nudge for the current beat only, never a GPS route.
   */
  getObjectiveTarget() {
    const inv = this.player.inventory;
    const pf = this.levelBuilder.propFactory;
    const firstVisible = (type) => pf.interactables.find(
      o => o.userData?.type === type && o.visible !== false
    );

    switch (this.currentStep) {
      case STEP.ARRIVAL:
        return this.punchedIn ? null : this.punchClockMesh;

      case STEP.RESTAURANT:
        if (!inv.hasItem('office_key')) return firstVisible('office_key_pickup');
        if (!this.officeUnlocked) return this.doorSystem.getDoor('office_main')?.mesh;
        return null;

      case STEP.OFFICE:
        return inv.hasItem('freezer_keycard') ? null : this.keycardMesh;

      case STEP.FREEZER:
        return this.freezerUnlocked ? null : this.doorSystem.getDoor('freezer_vault')?.mesh;

      case STEP.MEAT:
        if (inv.countItem('meat') > 0) return this.levelBuilder.fryerStation;
        return this.meatMeshes.find(m => m.visible) || null;

      case STEP.BLACKOUT:
        return inv.countItem('fuel') < this.requiredFuel
          ? firstVisible('fuel_can_pickup')
          : this.levelBuilder.generatorMesh;

      case STEP.GENERATOR:
        return this.generatorPowered ? null : this.levelBuilder.generatorMesh;

      case STEP.COLONEL:
        if (!inv.hasItem('drive_thru_key')) return firstVisible('shutter_key_pickup');
        return null;

      case STEP.ESCAPE:
        if (!inv.hasItem('car_key')) {
          return this.carKeySpawned ? firstVisible('car_key_pickup') : this.safeMesh;
        }
        return this.levelBuilder.carGroup;

      default:
        return null;
    }
  }

  /** Forces the objective marker to re-resolve on the next frame. */
  refreshObjectiveTarget() {
    this._targetTimer = 0;
  }

  update(delta, playerPos) {
    if (this.gameOver || this.gameWon) return;

    // Doors: one update, and the player's cached collision boxes are only
    // invalidated on the frames a door actually moved.
    if (this.doorSystem?.update(delta)) {
      for (const mesh of this.doorSystem.getColliders()) this.player?.refreshCollider(mesh);
    }

    // Zone detection for audio + lighting
    if (this.lighting && this.audio && playerPos) {
      const newZone = this.lighting.getCurrentZone(playerPos);
      if (newZone !== this.lighting.zone) {
        this.lighting.zone = newZone;
        this.audio.setAmbienceZone(newZone);
      }
    }

    // Leaving the car is what starts the shift, not a z-coordinate tripwire.
    if (this.currentStep === STEP.INTRO && this.hasExitedCar) this.evaluateProgress();

    this.updateObjectiveMarker(delta);
    this.updateThreats(delta, playerPos);
    this.updatePortraitGaze(playerPos);
  }

  /**
   * The 'portrait_change' event fires after the player has lingered in front of
   * the Colonel a few separate times. This is the writer for `portraitStares`,
   * which EventManager's context reads - previously nothing incremented it, so
   * the event could never fire.
   */
  updatePortraitGaze(playerPos) {
    if (!playerPos) return;
    const portrait = this._portrait ||
      (this._portrait = this.scene.getObjectByName('cursed_portrait_plane'));
    if (!portrait || !portrait.visible) return;

    const dx = playerPos.x - portrait.position.x;
    const dz = playerPos.z - portrait.position.z;
    const near = dx * dx + dz * dz < 25; // within 5m

    // One stare is counted per approach, not per frame.
    if (near && !this._staring) {
      this._staring = true;
      this.portraitStares++;
    } else if (!near && this._staring) {
      this._staring = false;
    }
  }

  /**
   * Faint floating mote over the current objective. Hidden when unresolved.
   *
   * Resolving the target scans the interactable list, so it is re-resolved on a
   * 4 Hz tick rather than every frame; the bob/pulse still animates per frame.
   * Any objective-changing event calls refreshObjectiveTarget() directly, so
   * the marker never lags behind a pickup by more than the current frame.
   */
  updateObjectiveMarker(delta) {
    this.objectiveTime += delta * 1.8;
    this._targetTimer -= delta;
    if (this._targetTimer <= 0) {
      this._targetTimer = 0.25;
      this._resolvedTarget = this.getObjectiveTarget();
    }
    const target = this._resolvedTarget;

    // A target only counts if it is in the scene graph and actually rendered.
    const usable = target && target.visible !== false && target.parent !== null;
    if (!usable) {
      if (this.objectiveMarker.visible) this.objectiveMarker.visible = false;
      this.objectiveTarget = null;
      return;
    }

    this.objectiveTarget = target;
    target.getWorldPosition(this.objectiveWorldPosition);
    this.objectiveMarker.visible = true;
    this.objectiveMarker.position.set(
      this.objectiveWorldPosition.x,
      this.objectiveWorldPosition.y + 1.4 + Math.sin(this.objectiveTime) * 0.18,
      this.objectiveWorldPosition.z
    );
    this.objectiveMarker.material.opacity = 0.12 + Math.sin(this.objectiveTime) * 0.06;
    this.objectiveMarker.scale.setScalar(0.9 + Math.sin(this.objectiveTime * 1.3) * 0.15);
  }

  /**
   * Hatchlings, the colonel and the chicken monster.
   * Contact damage is proposed here but the player owns the i-frame window, so
   * three attackers in one frame still cost exactly one hit.
   */
  updateThreats(delta, playerPos) {
    const canHit = this.player.canBeDamaged();

    for (let i = this.hatchlings.length - 1; i >= 0; i--) {
      const h = this.hatchlings[i];
      h.update(delta, playerPos, this.player.camera, (dmg) => this.player.takeDamage(dmg));
      if (h.isDead && h.isDisposed) this.hatchlings.splice(i, 1);
    }

    if (this.colonel) {
      this.colonel.update(
        delta, playerPos, this.player.camera,
        this.lighting.flashlightOn, this.player.noiseLevel, this.player.isHiding
      );
      // Contact damage needs a clear path too - standing on the far side of a
      // 0.3m wall is well inside 1.5m, and a hit through it reads as a bug.
      if (canHit && this.colonel.isActive() && this.colonel.state === 'CHASE' &&
          playerPos.distanceTo(this.colonel.mesh.position) < 1.5 &&
          !this.colonel.isOccluded(playerPos)) {
        if (this.player.takeDamage(34)) this.colonel.stun(2.1);
      }
    }

    if (this.monster && canHit && this.monster.isActive() && this.monster.state === 'CHASE' &&
        playerPos.distanceTo(this.monster.mesh.position) < 1.45 &&
        !this.monster.isOccluded(playerPos)) {
      if (this.player.takeDamage(38)) this.monster.stun(2.6);
    }
  }

  showBanner(text, duration = 3000) {
    const banner = document.getElementById('quest-banner');
    if (!banner) return;
    banner.textContent = text;
    banner.style.display = 'block';
    banner.style.animation = 'none';
    void banner.offsetWidth;
    banner.style.animation = `bannerFade ${duration / 1000}s forwards`;
    this.timers.clearTimeout(this._bannerTimer);
    this._bannerTimer = this.timers.setTimeout(() => { banner.style.display = 'none'; }, duration + 200);
  }

  removeInteractable(object) {
    const list = this.levelBuilder?.propFactory?.interactables;
    if (!list) return;
    const idx = list.indexOf(object);
    if (idx !== -1) list.splice(idx, 1);
    if (this.player) {
      this.player.focusedObject = null;
      this.player.lastPrompt = '';
      this.player.raycastTimer = 0;
    }
  }

  /**
   * The single win path. Gated on being at the escape step with the one car
   * key that exists - it cannot fire by walking into the car early.
   */
  triggerVictory(secret = false) {
    if (this.gameWon || this.gameOver) return;
    if (this.currentStep < STEP.ESCAPE || !this.player.inventory.hasItem('car_key')) return;

    this.gameWon = true;
    this.closeModal();
    this.timers.clearAll();
    this.objectiveMarker.visible = false;
    this.player.isLocked = false;
    this.audio?.playVictoryTransition();
    this.setStep(STEP.ENDING, true);   // fires the ENDING beat exactly once
    const winScreen = document.getElementById('win-screen');
    const endingTitle = document.getElementById('ending-title');
    const endingDesc = document.getElementById('ending-desc');
    const secretExtra = document.getElementById('secret-extra');

    if (secretExtra) secretExtra.style.display = this.story?.secretFound ? 'block' : 'none';

    // The ending reflects how much of the story the player actually pieced
    // together: the secret variant needs the full-knowledge threshold, not a
    // lucky pickup.
    const secretEnding = secret || !!this.story?.isForestOfSecrets();
    if (this.story) this.story.endingType = secretEnding ? 'secret' : 'normal';
    if (endingTitle) endingTitle.textContent = secretEnding ? 'YOU KNOW TOO MUCH' : 'ESCAPED';

    if (endingDesc) {
      if (secretEnding) {
        endingDesc.innerHTML = `You escaped Route 17 with ${this.story.getDiscoveredCount()}/${this.story.getTotalClues()} files.<br>
        The radio starts again in the car.<br>
        The suit still hangs in your closet at home.<br><br>
        <i style="color:#f87171">The Colonel found a new manager.</i>`;
      } else {
        endingDesc.innerHTML = `You left Store #09 behind, engine screaming.<br>
        In the rearview, the neon sign finally dies.<br>
        But your jacket smells like grease and feathers.<br><br>
        <i>Some stains don't wash out.</i>`;
      }
    }

    const winClues = document.getElementById('win-clues');
    if (winClues && this.story) winClues.textContent = `Clues ${this.story.getDiscoveredCount()}/${this.story.getTotalClues()}`;
    const winTime = document.getElementById('win-time');
    if (winTime) winTime.textContent = `Final time: ${document.getElementById('clock-display')?.textContent || '03:14 AM'}`;

    if (winScreen) winScreen.style.display = 'flex';
    document.exitPointerLock?.();
  }

  triggerGameOver() {
    if (this.gameOver || this.gameWon) return;
    this.gameOver = true;
    this.closeModal();
    this.timers.clearAll();
    this.objectiveMarker.visible = false;
    this.player.isLocked = false;
    this.audio?.playDeathTransition();
    const jumpscare = document.getElementById('jumpscare-overlay');
    const deathLore = document.getElementById('death-lore');
    if (deathLore) {
      const lines = [
        'You became part of the floor wax.',
        'Colonel smiled. You stopped.',
        'The fryer oil was still bubbling when they found your shoes.',
        'You clocked out at 03:14. Exactly.',
        'The balls in the pit kept moving after you stopped.',
        'Someone has to wear the white suit.'
      ];
      deathLore.textContent = lines[Math.floor(Math.random() * lines.length)];
    }
    if (jumpscare) jumpscare.style.display = 'flex';
    document.exitPointerLock?.();
  }

  /**
   * Full teardown back to the opening state. Everything the run mutated is
   * listed here explicitly - progression flags, latches, spawned props,
   * entities, doors, timers, modals and HUD - so run 2 is indistinguishable
   * from run 1.
   */
  reset() {
    this.timers.clearAll();
    this.closeModal();

    // Progression
    this.currentStep = STEP.INTRO;
    this.gameOver = false;
    this.gameWon = false;
    this.completedObjectives.clear();
    this._firedBeats.clear();

    // Latches
    this.blackoutTriggered = false;
    this.colonelSpawned = false;
    this.carKeySpawned = false;
    this.safeOpened = false;
    this.hasExitedCar = false;
    this.punchedIn = false;
    this.officeUnlocked = false;
    this.freezerUnlocked = false;
    this.generatorPowered = false;
    this.greaseCleanedCount = 0;
    this.mysteryMeatLoaded = 0;
    this.generatorFuelCount = 0;

    // Ending-flavour event counters
    this.portraitStares = 0;
    this._staring = false;

    // Runtime-spawned props (oil pitcher, shutter key, car key, ...)
    for (const obj of this.spawnedObjects) {
      this.removeInteractable(obj);
      obj.parent?.remove(obj);
      obj.geometry?.dispose?.();
      obj.material?.dispose?.();
    }
    this.spawnedObjects.length = 0;

    // Entities
    for (const h of this.hatchlings) h.dispose();
    this.hatchlings.length = 0;
    if (this.colonel) { this.colonel.dispose(); this.colonel = null; }
    this.monster?.reset();

    // World state
    this.doorSystem.reset();
    for (const mesh of this.doorSystem.getColliders()) this.player?.refreshCollider(mesh);
    if (this.secretNote) this.secretNote.visible = false;
    for (const m of this.meatMeshes) { m.visible = true; this.restoreInteractable(m); }

    // Restore every pickup and reset the props that carry per-run state.
    for (const obj of this.levelBuilder.propFactory.interactables) {
      obj.visible = true;
      const d = obj.userData;
      if (!d) continue;
      if (d.type === 'punch_clock') d.punched = false;
      if (d.type === 'grease_spill') { d.cleaned = false; obj.visible = true; }
      if (d.type === 'fryer_station') { d.loadedCount = 0; d.hasMeat = false; }
      if (d.type === 'generator') { d.fueled = false; d.fuelCount = 0; }
      if (d.type === 'safe') d.isOpen = false;
    }
    for (const spill of this.levelBuilder.greaseSpills || []) spill.visible = true;

    // UI
    this.objectiveMarker.visible = false;
    this.objectiveTarget = null;
    this._resolvedTarget = null;
    this._targetTimer = 0;
    const banner = document.getElementById('quest-banner');
    if (banner) banner.style.display = 'none';
    this.updateHUD();
  }
}
