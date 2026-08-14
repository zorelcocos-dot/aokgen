import * as THREE from 'three';
import { AnimatedSprite } from '../entities/AnimatedSprite.js';
import { HatchlingEntity } from '../entities/HatchlingEntity.js';
import { MonsterEntity } from '../entities/MonsterEntity.js';
import { DoorSystem } from '../engine/DoorSystem.js';

/**
 * QuestManager - Organic horror narrative progression
 * No giant "PHASE 1" spam. Objectives evolve via discoveries.
 * Story: Stranded motorist -> abandoned restaurant -> unraveling.
 */

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
    this.itemsTexture = options.itemsTexture;
    this.story = options.storyManager;
    this.eventManager = options.eventManager;

    this.currentStep = 0; // 0 car, 1 arrival, 2 lobby, 3 keycard, 4 freezer, 5 blackout, 6 generator, 7 colonel, 8 escape
    this.gameWon = false;
    this.gameOver = false;

    this.punchedIn = false;
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

    this.objectiveTarget = null;
    this.objectiveTime = 0;
    this.objectiveWorldPosition = new THREE.Vector3();

    this.initDoorSystem(options.colliders);
    this.initInteractiveItems();
    this.createObjectiveMarker();
    this.updateHUD();
  }

  initDoorSystem(extraColliders = []) {
    this.doorSystem = new DoorSystem(this.scene, this.audio);

    // Office door (requires office key) - aesthetic sliding? Use swing
    this.doorSystem.createDoor({
      name: 'office_main',
      x: -14, y: 1.15, z: 11,
      rotation: 0,
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
      x: -15, y: 1.15, z: -22,
      rotation: Math.PI / 2,
      type: 'bathroom',
      locked: false,
      lockedMessage: '',
      anomaly: false
    });

    // Storage door (southwest) - unlocked but creaky
    this.doorSystem.createDoor({
      name: 'storage_door',
      x: -18, y: 1.15, z: 22,
      rotation: 0,
      type: 'office',
      locked: false,
      anomaly: true
    });

    // Generator room door - free, autoClose for tension
    this.doorSystem.createDoor({
      name: 'generator_door',
      x: 3, y: 1.15, z: 26,
      rotation: 0,
      type: 'metal',
      locked: false,
      autoClose: true,
      autoCloseDelay: 8,
      anomaly: true
    });

    // Freezer door using custom handling (keep compatibility but also have door system)
    // We'll keep freezerDoorMesh as special

    // Entrances: Front entrance door? Actually gap already but we add invisible interaction to indicate need?
    this.doorSystem.createDoor({
      name: 'front_entrance',
      x: 0, y: 1.15, z: -30,
      rotation: 0,
      type: 'office',
      locked: false,
      hasWindow: false,
      interactive: false // no collider needed
    });

    // Add door meshes to player's collider list + interactables
    for (const door of this.doorSystem.doors.values()) {
      if (door.mesh) {
        // Already added to scene via doorSystem
        // Add to propFactory interactables if interactive
        if (door.mesh.userData?.type) {
          this.levelBuilder.propFactory.interactables.push(door.hingeGroup);
          this.levelBuilder.propFactory.interactables.push(door.mesh);
        }
      }
    }

    // Hook collider refresh
    if (this.player) {
      this.player.questManager = this;
    }
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
    this.keycardMesh = pf.createKeyCard(22, 0.85, -18.2);

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
    pf.createDocument(20, 1.1, 6.5, {
      docId: 'meat_manifest',
      title: 'Delivery Manifest',
      flat: false
    });

    // Generator log on generator body
    pf.createDocument(1.2, 1.0, 28.2, {
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
    pf.createDocument(22.4, 0.75, -17.8, {
      docId: 'child_drawing',
      title: 'Crayon Drawing',
      flat: true,
      important: true
    });

    // Grinder receipt secret - behind generator hidden wall (will be revealed after fuel)
    pf.createDocument(0, 0.95, 34.0, {
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

    // Safe in office - contains car key + fuel? secret ending fuel
    this.safeMesh = pf.createSafe(-24.8, 0.85, 16);
    // Car key will spawn inside safe after colonel defeated, but also hidden before?
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

  updateHUD() {
    const titleEl = document.getElementById('task-title');
    const descEl = document.getElementById('task-description');
    if (!descEl) return;

    // Organic titles, not "PHASE 1"
    const titles = [
      'STRANDED',
      'SHELTER',
      'THE TIME CARD',
      'SOMETHING IN THE BALL PIT',
      'VAULT #4',
      'OVERLOAD',
      'GENERATOR',
      'THE MAN IN WHITE',
      'ESCAPE'
    ];

    const objectiveText = this.story ? this.story.getObjectiveText(this.currentStep) : 'Survive.';

    // Update based on step, but with lore context
    if (titleEl) {
      titleEl.textContent = titles[Math.min(this.currentStep, titles.length - 1)] || 'UNKNOWN';
    }

    switch (this.currentStep) {
      case 0:
        if (this.player.position.z < -36) {
          descEl.innerHTML = objectiveText;
        } else {
          descEl.innerHTML = 'Find shelter from the storm. Lights ahead.';
        }
        break;
      case 1:
        if (!this.punchedIn) {
          descEl.innerHTML = 'The timeclock shows <b>03:14 AM</b> - someone never left. Clock in?';
        } else if (!this.player.inventory.hasOfficeKey) {
          descEl.innerHTML = 'Manager\'s office locked. Look for his key - kitchen board maybe?';
        } else if (!this.officeUnlocked) {
          descEl.innerHTML = 'You have office key. That door west side.';
        } else if (!this.player.inventory.hasKeycard) {
          descEl.innerHTML = 'Employee records say keycard in PlayPlace ball pit. Child hid it.';
        } else {
          descEl.innerHTML = objectiveText;
        }
        break;
      case 2:
        if (!this.player.inventory.hasMop) {
          descEl.innerHTML = 'Floor is slick with grease. Find a mop near counter.';
        } else if (this.greaseCleanedCount < this.totalGreaseSpills) {
          descEl.innerHTML = `Clean the spills to get to freezer - ${this.greaseCleanedCount}/${this.totalGreaseSpills}`;
        } else {
          descEl.innerHTML = 'Floor clean. Meat vault might hold answers.';
        }
        break;
      case 3:
        descEl.innerHTML = this.player.inventory.hasKeycard ? 'Use keycard on freezer vault east side.' : 'Search ball pit thoroughly.';
        break;
      case 4:
        descEl.innerHTML = `Collect meat bags and see what's cooking. <span class="dim">(${this.player.inventory.mysteryMeatCount}/${this.totalMysteryMeat})</span>`;
        break;
      case 5:
        descEl.innerHTML = `Main breaker fried. Find diesel - janitor closet and storage. <span class="dim">(${this.generatorFuelCount}/${this.requiredFuel})</span>`;
        break;
      case 6:
        descEl.innerHTML = 'Generator room south. Refuel it.';
        break;
      case 7:
        descEl.innerHTML = '<span style="color:#f87171">He is here.</span> Stun with oil or cleaver. Take his green key.';
        break;
      case 8:
        descEl.innerHTML = 'Get to the car. Get out.';
        break;
    }
  }

  handleInteraction(data, object) {
    if (!data || this.gameWon || this.gameOver) return;

    // --- Documents ---
    if (data.type === 'document') {
      if (data.docId) {
        const doc = this.story ? this.story.discoverClue(data.docId) : null;
        this.showDocument(data.docId, doc);
        if (data.docId === 'colonel_note') {
          this.story.secretFound = true;
        }
        this.player.inventory.documents.add(data.docId);
        this.updateHUD();
      }
      return;
    }

    // --- Timecard punch ---
    if (data.type === 'punch_clock' && !this.punchedIn) {
      this.punchedIn = true;
      data.punched = true;
      this.audio?.playTimecardPunch();
      this.showBanner('PUNCHED IN 03:14 AM - SHIFT STARTED', 2600);
      this.player.showNotification('Clocked in. Something is wrong.');
      this.story?.discoverClue('timecard_0314');
      this.story?.progressBeat('FIRST_CLUE');
      if (this.currentStep === 0) this.currentStep = 1;
      this.updateHUD();
      // Reveal office key prompt if not found
      object.userData.punched = true;
      return;
    }

    // --- Mop pickup ---
    if (data.type === 'mop_pickup' && !this.player.inventory.hasMop) {
      if (!this.punchedIn) {
        this.punchedIn = true;
        if (this.punchClockMesh) this.punchClockMesh.userData.punched = true;
        this.audio?.playTimecardPunch();
      }
      this.player.inventory.hasMop = true;
      object.visible = false;
      this.removeInteractable(object);
      this.player.selectSlot('mop');
      const mopSlot = document.getElementById('slot-mop');
      if (mopSlot) mopSlot.style.opacity = '1';
      this.audio?.playMopSlosh();
      this.showBanner('INDUSTRIAL MOP EQUIPPED', 2000);
      this.player.showNotification('Mop acquired - can clean grease & swat hatchlings');
      this.updateHUD();
      return;
    }

    // --- Key pickups ---
    if (data.type === 'office_key_pickup' && !this.player.inventory.hasOfficeKey) {
      this.player.inventory.hasOfficeKey = true;
      this.player.inventory.keys.add('office_key');
      object.visible = false;
      this.removeInteractable(object);
      this.audio?.playAccessGranted();
      this.showBanner('OFFICE KEY', 2000);
      this.player.showNotification('+ Office key');
      this.updateHUD();
      return;
    }

    if (data.type === 'keycard_pickup' && !this.player.inventory.hasKeycard) {
      this.player.inventory.hasKeycard = true;
      this.player.inventory.keys.add('freezer_keycard');
      this.player.inventory.keys.add('yellow_keycard');
      object.visible = false;
      this.removeInteractable(object);
      this.audio?.playAccessGranted();
      this.showBanner('YELLOW KEYCARD - FREEZER VAULT #4', 2600);
      this.player.showNotification('+ Freezer keycard - child hid it well');
      this.story?.discoverClue('child_drawing');
      if (this.currentStep <= 2) this.currentStep = 3;
      this.updateHUD();
      return;
    }

    if (data.type === 'oil_pitcher_pickup' && !this.player.inventory.hasOil) {
      this.player.inventory.hasOil = true;
      object.visible = false;
      this.removeInteractable(object);
      this.player.selectSlot('oil');
      const oilSlot = document.getElementById('slot-oil');
      if (oilSlot) oilSlot.style.opacity = '1';
      this.audio?.playAccessGranted();
      this.showBanner('BOILING OIL PITCHER', 2000);
      this.player.showNotification('+ Boiling oil - stuns monster');
      this.updateHUD();
      return;
    }

    if (data.type === 'car_key_pickup' && !this.player.inventory.hasCarKey) {
      this.player.inventory.hasCarKey = true;
      this.player.inventory.keys.add('car_key');
      object.visible = false;
      this.removeInteractable(object);
      this.audio?.playAccessGranted();
      this.showBanner('CAR KEY - ESCAPE', 2400);
      this.player.showNotification('+ Car key');
      this.updateHUD();
      return;
    }

    // --- Health / battery ---
    if (data.type === 'soda_pickup') {
      this.player.heal(32);
      object.visible = false;
      this.removeInteractable(object);
      return;
    }

    if (data.type === 'battery_pickup') {
      this.player.rechargeBattery(44);
      object.visible = false;
      this.removeInteractable(object);
      return;
    }

    // --- Fuel ---
    if (data.type === 'fuel_can_pickup') {
      this.player.inventory.fuelCount = (this.player.inventory.fuelCount || 0) + 1;
      this.player.inventory.items.set('fuel_' + Date.now(), { type: 'fuel' });
      object.visible = false;
      this.removeInteractable(object);
      this.audio?.playAccessGranted();
      this.player.showNotification(`+ Diesel can ${this.player.inventory.fuelCount}/${this.requiredFuel}`);
      this.updateHUD();
      return;
    }

    // --- Meat ---
    if (data.type === 'meat_pickup') {
      this.player.inventory.mysteryMeatCount++;
      object.visible = false;
      this.removeInteractable(object);
      this.audio?.playAccessGranted();
      this.player.showNotification(`+ Meat bag ${this.player.inventory.mysteryMeatCount}/${this.totalMysteryMeat} - it's warm`);
      this.updateHUD();
      return;
    }

    // --- Doors (Office etc already handled by DoorSystem, but we intercept for logic) ---
    if (data.type === 'door') {
      const name = data.doorName;
      // For office door, need to track unlocked state
      if (name === 'office_main') {
        const result = this.doorSystem.tryInteract(name, this.player.inventory, this.lighting);
        if (result?.unlocked) {
          this.officeUnlocked = true;
          this.player.showNotification(result.message);
          if (this.currentStep < 3) this.currentStep = 3;
        } else {
          this.player.showNotification(result?.message || 'Locked');
        }
        // Sync collider refresh
        const entry = this.player.colliderBounds.find(c => c.object === object || c.object === this.doorSystem.getDoor(name)?.mesh);
        if (entry) entry.box.setFromObject(this.doorSystem.getDoor(name).mesh);
        this.updateHUD();
        return;
      } else {
        // Other doors (janitor, storage, generator)
        const result = this.doorSystem.tryInteract(name, this.player.inventory, this.lighting);
        if (result) this.player.showNotification(result.message);
        return;
      }
    }

    // --- Freezer vault door ---
    if (data.type === 'freezer_door' && !data.isOpen) {
      if (this.player.inventory.hasKeycard) {
        data.isLocked = false;
        data.isOpen = true;
        this.freezerUnlocked = true;
        this.audio?.playAccessGranted();
        this.showBanner('VAULT #4 UNLOCKED - COLD STORAGE', 2600);
        // Open animation: slide door
        object.position.x += 1.8;
        // Remove collider
        if (this.player) {
          const cIdx = this.player.colliders.indexOf(object);
          if (cIdx !== -1) this.player.colliders.splice(cIdx, 1);
          if (this.player.colliderBounds) {
            const bIdx = this.player.colliderBounds.findIndex(b => b.object === object);
            if (bIdx !== -1) this.player.colliderBounds.splice(bIdx, 1);
          }
        }
        this.removeInteractable(object);
        if (this.currentStep === 3) this.currentStep = 4;
        this.updateHUD();
      } else {
        this.showBanner('VAULT LOCKED - NEEDS YELLOW KEYCARD', 2400);
      }
      return;
    }

    // --- Fryer station ---
    if (data.type === 'fryer_station') {
      const loaded = data.loadedCount || 0;
      const max = data.maxMeat || this.totalMysteryMeat;
      if (this.player.inventory.mysteryMeatCount > 0 && loaded < max) {
        data.loadedCount = loaded + 1;
        data.hasMeat = data.loadedCount >= max;
        this.mysteryMeatLoaded++;
        this.player.inventory.mysteryMeatCount--;
        this.audio?.playHotOilSplash();
        this.player.showNotification(`+ Loaded meat into fryer (${this.mysteryMeatLoaded}/${this.totalMysteryMeat})`);

        if (this.mysteryMeatLoaded >= this.totalMysteryMeat) {
          this.triggerBlackoutOutbreak();
        }
        this.updateHUD();
      } else if (loaded >= max) {
        this.player.showNotification('Fryer already overloaded');
      } else {
        this.player.showNotification('Needs meat bags from freezer');
      }
      return;
    }

    // --- Generator ---
    if (data.type === 'generator') {
      if (this.currentStep < 5) {
        this.showBanner('Generator inactive - no need yet', 2000);
        return;
      }
      if (this.player.inventory.fuelCount > 0) {
        data.fuelCount = (data.fuelCount || 0) + 1;
        this.generatorFuelCount = data.fuelCount;
        this.player.inventory.fuelCount--;
        this.audio?.playBreakerRestore();
        this.player.showNotification(`+ Generator refueled ${data.fuelCount}/${data.requiredFuel}`);

        if (data.fuelCount >= data.requiredFuel) {
          data.fueled = true;
          this.generatorPowered = true;
          this.lighting.setPower(true);
          this.audio?.setGeneratorHum(true);
          this.showBanner('⚡ POWER RESTORED - HE IS HERE', 3200);
          this.triggerColonelBoss();
        }
        this.updateHUD();
      } else {
        this.showBanner('NEEDS DIESEL - CHECK JANITOR CLOSET + STORAGE', 2600);
      }
      return;
    }

    // --- Phone ---
    if (data.type === 'phone') {
      this.audio?.playRadioStatic(0.4);
      this.showBanner('LINE DEAD... THEN BREATHING', 2800);
      this.player.showNotification('Phone dead. Use radio in car?');
      return;
    }

    // --- CCTV ---
    if (data.type === 'cctv_monitor') {
      this.story?.watchCCTV(data.camId);
      this.showCCTVFeed(data.camId);
      return;
    }

    // --- Safe ---
    if (data.type === 'safe' && !data.isOpen) {
      if (this.currentStep >= 7) {
        data.isOpen = true;
        this.showBanner('SAFE OPEN - CAR KEY INSIDE', 2600);
        // Spawn car key
        const carKey = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 0.08, 0.26),
          new THREE.MeshStandardMaterial({ color: 0x111111 })
        );
        carKey.position.copy(this.carKeySpawnPos);
        carKey.userData = { type: 'car_key_pickup' };
        this.scene.add(carKey);
        this.levelBuilder.propFactory.interactables.push(carKey);
      } else {
        this.showBanner('SAFE LOCKED - COMBO SCRATCHED, NEEDS POWER?', 2400);
      }
      return;
    }

    // --- Car ---
    if (data.type === 'car') {
      if (this.currentStep >= 8 && this.player.inventory.hasCarKey) {
        this.triggerVictory();
      } else if (this.currentStep < 1) {
        this.showBanner('Car dead. Battery low, fuel leaking. Need shelter.', 3000);
        this.currentStep = 1;
        this.updateHUD();
      } else if (!this.player.inventory.hasCarKey) {
        this.showBanner('Need car key. Maybe in office safe?', 2600);
      } else {
        this.showBanner('Get to driver door and escape.', 2000);
      }
      return;
    }

    // --- Shutter key / drive-thru ---
    if (data.type === 'shutter_key_pickup' && this.currentStep >= 7) {
      this.player.inventory.hasShutterKey = true;
      this.player.inventory.keys.add('drive_thru_key');
      object.visible = false;
      this.removeInteractable(object);
      this.audio?.playAccessGranted();
      this.showBanner('GREEN KEY - DRIVE-THRU', 2400);
      this.player.showNotification('+ Drive-thru key');
      if (this.currentStep === 7) this.currentStep = 8;
      this.updateHUD();
      return;
    }

    if (data.type === 'drive_thru_window') {
      if (this.currentStep === 8 && this.player.inventory.hasShutterKey) {
        if (object.position) object.position.z += 1.6;
        this.audio?.playAccessGranted();
        // Actually escape via car, not this window? Keep both
        this.showBanner('Use car to escape!', 2400);
        this.updateHUD();
      } else if (this.currentStep >= 8) {
        // Allow escape via window as alternative
        if (this.player.inventory.hasShutterKey || this.colonel?.isDead) {
          this.triggerVictory();
        } else {
          this.showBanner('Locked - green key needed', 2000);
        }
      } else {
        this.showBanner('Locked from inside. Green key somewhere.', 2000);
      }
      return;
    }
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
        if (this.greaseCleanedCount >= this.totalGreaseSpills && this.currentStep <= 2) {
          this.showBanner('FLOOR CLEAN - FREEZER ACCESSIBLE', 2400);
          this.currentStep = 3;
        }
        this.updateHUD();
      }
    }
  }

  triggerBlackoutOutbreak() {
    this.currentStep = 5;
    this.lighting.setPower(false);
    this.story?.progressBeat('BLACKOUT');
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
          colliders: this.player?.colliders
        });
        this.hatchlings.push(h);
      });
    }

    // Oil pitcher on prep island
    const pitchMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.12 });
    const pitcher = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.48, 16), pitchMat);
    pitcher.position.set(0, 1.32, 10);
    pitcher.userData = { type: 'oil_pitcher_pickup' };
    this.scene.add(pitcher);
    this.levelBuilder.propFactory.interactables.push(pitcher);
    this.player.showNotification('⚠ BOILING OIL PITCHER - PREP TABLE', 2800);

    this.updateHUD();
    if (this.eventManager) this.eventManager.triggerFlickerBurst(1.2, 1.8);
  }

  triggerColonelBoss() {
    this.currentStep = 7;
    this.story?.progressBeat('COLONEL');

    if (this.colonelTexture) {
      this.colonel = new MonsterEntity({
        scene: this.scene,
        texture: this.colonelTexture,
        audio: this.audio,
        type: 'colonel',
        colliders: this.player?.colliders
      });
      this.colonel.spawn(new THREE.Vector3(0, 0, -5));
      this.colonel.returnPos.set(0, 0, -5);
    }

    // Drive-thru key on front counter (manager dropped)
    const keyMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.2, emissive: 0x116a33, emissiveIntensity: 0.42 });
    const shutterKey = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.42), keyMat);
    shutterKey.position.set(2.1, 1.32, -4.5);
    shutterKey.userData = { type: 'shutter_key_pickup' };
    this.scene.add(shutterKey);
    this.levelBuilder.propFactory.interactables.push(shutterKey);

    // Reveal secret note behind portrait (now visible)
    if (this.secretNote) {
      this.secretNote.visible = true;
    }

    this.updateHUD();
  }

  // Document modal
  showDocument(docId, docData) {
    const modal = document.getElementById('document-modal');
    const titleEl = document.getElementById('doc-title');
    const contentEl = document.getElementById('doc-content');
    const typeEl = document.getElementById('doc-type');
    if (!modal || !docData) return;

    // Fallback fetch from story docs
    const fullDoc = this.story?.documents?.get(docId);
    const display = docData.content ? docData : fullDoc;
    if (!display) return;

    if (titleEl) titleEl.textContent = display.title || docId;
    if (typeEl) typeEl.textContent = display.type || 'NOTE';
    if (contentEl) contentEl.textContent = display.content || '';

    modal.classList.add('visible');
    this.audio?.playPaperRead();

    // Pause game while reading?
    this._docOpen = true;
    setTimeout(() => {
      const close = () => {
        modal.classList.remove('visible');
        this._docOpen = false;
        document.removeEventListener('keydown', escHandler);
        modal.removeEventListener('click', close);
      };
      const escHandler = (e) => {
        if (e.code === 'Escape' || e.code === 'KeyE') close();
      };
      document.addEventListener('keydown', escHandler);
      modal.addEventListener('click', close, { once: true });
    }, 120);

    // For quest tracking
    this.showBanner(`FOUND: ${display.title}`, 2400);
  }

  showCCTVFeed(camId) {
    const modal = document.getElementById('cctv-modal');
    const titleEl = document.getElementById('cctv-title');
    const feed = this.story?.cctvFeeds?.find(f => f.id === camId);
    if (!modal) return;

    if (titleEl && feed) titleEl.textContent = feed.name + (feed.disturbance ? ' [!]' : '');
    modal.classList.add('visible');
    this.audio?.playCCTVGlitch();

    // Random disturbance: after 2 sec show figure
    if (feed?.disturbance && Math.random() < 0.7) {
      setTimeout(() => {
        const anomaly = document.getElementById('cctv-anomaly');
        if (anomaly) {
          anomaly.classList.add('active');
          setTimeout(() => anomaly.classList.remove('active'), 800);
        }
      }, 1300 + Math.random() * 800);
    }

    setTimeout(() => {
      const close = () => {
        modal.classList.remove('visible');
        modal.removeEventListener('click', close);
      };
      modal.addEventListener('click', close, { once: true });
    }, 250);
  }

  createObjectiveMarker() {
    const markerGeo = new THREE.SphereGeometry(0.14, 8, 8);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0 });
    this.objectiveMarker = new THREE.Mesh(markerGeo, markerMat);
    this.scene.add(this.objectiveMarker);
  }

  update(delta, playerPos) {
    if (this.gameOver || this.gameWon) return;

    // Door system update
    if (this.doorSystem) {
      const changed = this.doorSystem.update(delta);
      if (changed) {
        // Refresh collider bounds for doors
        // This is handled in PlayerController collidesAt refreshing each frame for door type
      }
    }

    // Zone detection for audio + lighting
    if (this.lighting && this.audio && playerPos) {
      const newZone = this.lighting.getCurrentZone(playerPos);
      if (newZone !== this.lighting.zone) {
        this.lighting.zone = newZone;
        this.audio.setAmbienceZone(newZone);
      }
    }

    // Objective marker - only show faintly, not always, to avoid handholding
    this.objectiveTime += delta * 1.8;
    let targetMesh = null;

    if (this.currentStep === 1) {
      if (!this.punchedIn) targetMesh = this.punchClockMesh;
      else if (!this.player.inventory.hasOfficeKey) {
        // Find office key mesh via scanning interactables
        targetMesh = this.scene.children.find(c => c.userData?.type === 'office_key_pickup') ||
                     this.levelBuilder.propFactory.interactables.find(i => i.userData?.type === 'office_key_pickup');
      } else if (!this.officeUnlocked) {
        targetMesh = this.doorSystem.getDoor('office_main')?.hingeGroup;
      } else if (!this.player.inventory.hasKeycard) {
        targetMesh = this.keycardMesh;
      }
    } else if (this.currentStep === 2) {
      if (!this.player.inventory.hasMop) targetMesh = this.levelBuilder.mopBucket;
    } else if (this.currentStep === 3) {
      // freezer door (custom mesh)
      const freezerDoor = this.scene.children.find(o => o.userData?.type === 'freezer_door' && !o.userData.isOpen) ||
                          this.levelBuilder.propFactory.interactables.find(o => o.userData?.type === 'freezer_door');
      targetMesh = this.player.inventory.hasKeycard ? freezerDoor : this.keycardMesh;
    } else if (this.currentStep === 4) {
      if (this.player.inventory.mysteryMeatCount > 0) {
        targetMesh = this.levelBuilder.fryerStation;
      } else {
        targetMesh = this.meatMeshes.find(m => m.visible);
      }
    } else if (this.currentStep === 5 || this.currentStep === 6) {
      // Show nearest fuel can if needed
      if (this.player.inventory.fuelCount < this.requiredFuel) {
        targetMesh = this.levelBuilder.propFactory.interactables.find(c => c.userData?.type === 'fuel_can_pickup' && c.visible);
      } else {
        targetMesh = this.levelBuilder.generatorMesh;
      }
    } else if (this.currentStep === 7) {
      // If colonel exists, show him vaguely? Actually show his drop
      targetMesh = this.levelBuilder.propFactory.interactables.find(o => o.userData?.type === 'shutter_key_pickup' && o.visible);
    } else if (this.currentStep === 8) {
      targetMesh = this.scene.getObjectByName('car') || this.levelBuilder.carGroup;
    }

    if (targetMesh && targetMesh.visible !== false) {
      if (targetMesh.getWorldPosition) targetMesh.getWorldPosition(this.objectiveWorldPosition);
      else if (targetMesh.position) this.objectiveWorldPosition.copy(targetMesh.position);
      this.objectiveMarker.visible = true;
      this.objectiveMarker.position.set(
        this.objectiveWorldPosition.x,
        this.objectiveWorldPosition.y + 1.4 + Math.sin(this.objectiveTime) * 0.18,
        this.objectiveWorldPosition.z
      );
      this.objectiveMarker.material.opacity = 0.12 + Math.sin(this.objectiveTime) * 0.06;
      this.objectiveMarker.scale.setScalar(0.9 + Math.sin(this.objectiveTime * 1.3) * 0.15);
    } else {
      this.objectiveMarker.visible = false;
    }

    // Update hatchlings
    if (this.hatchlings.length > 0) {
      this.hatchlings.forEach(h => {
        h.update(delta, playerPos, this.player.camera, (dmg) => {
          if (!this.player.isHiding) this.player.takeDamage(dmg);
        });
      });
      // Cleanup dead
      this.hatchlings = this.hatchlings.filter(h => !h.isDead || h.mesh.parent);
    }

    // Update colonel
    if (this.colonel) {
      this.colonel.update(delta, playerPos, this.player.camera, this.lighting.flashlightOn, this.player.noiseLevel, this.player.isHiding);
      if (this.colonel.mesh.visible && this.colonel.state === 'CHASE') {
        const cDist = playerPos.distanceTo(this.colonel.mesh.position);
        if (cDist < 1.5 && !this.player.isHiding) {
          this.player.takeDamage(34);
          this.colonel.stun(2.1);
        }
      }
    }

    // Update monster attack distance
    if (this.monster && this.monster.mesh.visible && this.monster.state === 'CHASE') {
      const dist = playerPos.distanceTo(this.monster.mesh.position);
      if (dist < 1.45 && !this.player.isHiding) {
        this.player.takeDamage(38);
        this.monster.stun(2.6);
      }
    }

    // Car proximity for final escape hint
    if (this.currentStep === 0) {
      const carDist = playerPos.distanceTo(this.levelBuilder.carGroup.position);
      if (carDist < 12) {
        // Player near car outside
        // Keep objective as shelter
      }
      if (playerPos.z > -30) {
        this.currentStep = 1;
        this.updateHUD();
      }
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
    setTimeout(() => banner.style.display = 'none', duration + 200);
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

  triggerVictory(secret = false) {
    if (this.gameWon) return;
    this.gameWon = true;
    if (this.player) this.player.isLocked = false;
    const winScreen = document.getElementById('win-screen');
    const endingTitle = document.getElementById('ending-title');
    const endingDesc = document.getElementById('ending-desc');
    const secretExtra = document.getElementById('secret-extra');

    if (secretExtra) secretExtra.style.display = this.story?.secretFound ? 'block' : 'none';

    if (endingTitle) {
      if (secret || this.story?.isForestOfSecrets()) {
        endingTitle.textContent = 'YOU KNOW TOO MUCH';
        this.story.endingType = 'secret';
      } else {
        endingTitle.textContent = 'ESCAPED';
        this.story.endingType = 'normal';
      }
    }

    if (endingDesc) {
      if (this.story?.endingType === 'secret') {
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
    if (document.exitPointerLock) document.exitPointerLock();
    this.audio?.playRadioStatic(0.3);
  }

  triggerGameOver() {
    this.gameOver = true;
    if (this.player) this.player.isLocked = false;
    this.audio?.playJumpscareStinger(0.85);
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
    if (document.exitPointerLock) document.exitPointerLock();
  }
}
