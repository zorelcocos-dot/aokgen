import * as THREE from 'three';
import { AnimatedSprite } from '../entities/AnimatedSprite.js';
import { HatchlingEntity } from '../entities/HatchlingEntity.js';
import { MonsterEntity } from '../entities/MonsterEntity.js';

/**
 * QuestManager orchestrates the expanded 6-Phase Graveyard Shift horror campaign:
 * - Phase 1: Punch In at Timecard & Mop 3 Toxic Grease Spills (Dining & Kitchen)
 * - Phase 2: Explore Cursed PlayPlace Ball Pit & Retrieve Manager's Yellow Keycard
 * - Phase 3: Unlock Deep Meat Vault, Retrieve 2 Frozen Mystery Meat Packages & Load Fryers
 * - Phase 4: Total Blackout & Outbreak! Find 2 Diesel Fuel Cans & Power the Emergency Generator
 * - Phase 5: Colonel Stalker Boss Battle! Use Boiling Oil Pitcher & Melee Cleaver to grab Drive-Thru Key
 * - Phase 6: Unlock West Drive-Thru Window & Escape into Stormy Night!
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

    this.currentStep = 1; // 1 to 6
    this.gameWon = false;
    this.gameOver = false;
    this.punchedIn = false;
    this.greaseCleanedCount = 0;
    this.totalGreaseSpills = options.levelBuilder?.greaseSpills?.length ?? 3;
    this.mysteryMeatLoaded = 0;
    this.totalMysteryMeat = 2;
    this.generatorFueled = false;
    this.generatorFuelCount = 0;
    this.requiredFuel = 2;
    this.outbreakTriggered = false;
    this.bossTriggered = false;
    this.meatMeshes = [];
    this.fuelCanMeshes = [];
    this.oilPitcher = null;
    this.shutterKey = null;
    this.objectiveMarker = null;
    this.objectiveTarget = null;
    this.objectiveTime = 0;
    this.objectiveWorldPosition = new THREE.Vector3();
    this.freezerTrigger = new THREE.Vector3(22, 1.7, 11);

    this.hatchlings = [];
    this.colonel = null;

    this.initInteractiveItems();
    this.createObjectiveMarker();
    this.updateHUD();
  }

  initInteractiveItems() {
    // 1. Timecard Punch Clock (Front register counter: x: -2, y: 1.4, z: -4.5)
    const clockGeo = new THREE.BoxGeometry(0.3, 0.45, 0.2);
    const clockMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 });
    this.punchClockMesh = new THREE.Mesh(clockGeo, clockMat);
    this.punchClockMesh.position.set(-2, 1.4, -4.5);
    this.punchClockMesh.userData = { type: 'punch_clock', punched: false };
    this.scene.add(this.punchClockMesh);
    this.levelBuilder.propFactory.interactables.push(this.punchClockMesh);

    // 2. Yellow Keycard (Hidden in the Cursed PlayPlace Ball Pit: x: 22, y: 0.75, z: -18)
    const keycardMat = new THREE.MeshStandardMaterial({
      color: 0xeab308,
      roughness: 0.2,
      emissive: 0xca8a04,
      emissiveIntensity: 0.95
    });
    this.keycardMesh = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, 0.6), keycardMat);
    this.keycardMesh.position.set(22, 0.75, -18);
    this.keycardMesh.userData = { type: 'keycard_pickup' };
    this.scene.add(this.keycardMesh);
    this.levelBuilder.propFactory.interactables.push(this.keycardMesh);

    // 3. Frozen Mystery Meat Bags inside Freezer Vault (X: 20, Z: 8 and X: 24, Z: 14)
    const meatMat = new THREE.MeshStandardMaterial({ color: 0x881337, roughness: 0.6 });
    const meat1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.4), meatMat);
    meat1.position.set(20, 0.2, 8);
    meat1.userData = { type: 'meat_pickup' };
    this.scene.add(meat1);
    this.levelBuilder.propFactory.interactables.push(meat1);

    const meat2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.4), meatMat);
    meat2.position.set(24, 0.2, 14);
    meat2.userData = { type: 'meat_pickup' };
    this.scene.add(meat2);
    this.levelBuilder.propFactory.interactables.push(meat2);
    this.meatMeshes.push(meat1, meat2);

    // 4. Cola Health Pickups around the map
    const sodaMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.8, roughness: 0.2 });
    const sodaPositions = [
      { x: -8, y: 0.95, z: -22 }, // Dining booth
      { x: 8,  y: 0.95, z: -14 }, // Dining booth
      { x: -22, y: 0.95, z: -22 }, // Restroom sink counter
      { x: -22, y: 0.95, z: 8 }    // Manager office desk
    ];

    sodaPositions.forEach(pos => {
      const soda = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 12), sodaMat);
      soda.position.set(pos.x, pos.y, pos.z);
      soda.userData = { type: 'soda_pickup' };
      this.scene.add(soda);
      this.levelBuilder.propFactory.interactables.push(soda);
    });

    // 5. 9V Flashlight Battery Packs
    const batMat = new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.5, roughness: 0.3 });
    const batPositions = [
      { x: -1.8, y: 1.35, z: -4.5 }, // Service counter
      { x: -8,   y: 0.95, z: -8 },   // Dining booth table
      { x: 0,    y: 1.05, z: 10 },   // Kitchen prep island
      { x: 12,   y: 1.0,  z: 30 }    // South Cellar crate
    ];

    batPositions.forEach(pos => {
      const bat = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.22, 0.12), batMat);
      bat.position.set(pos.x, pos.y, pos.z);
      bat.userData = { type: 'battery_pickup' };
      this.scene.add(bat);
      this.levelBuilder.propFactory.interactables.push(bat);
    });

    // 6. Diesel Fuel Cans for Emergency Generator
    const fuelMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.3,
      metalness: 0.4,
      emissive: 0x991b1b,
      emissiveIntensity: 0.3
    });
    
    // Fuel Can 1: In Restroom
    const fuel1 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, 0.3), fuelMat);
    fuel1.position.set(-24, 0.25, -24);
    fuel1.userData = { type: 'fuel_can_pickup' };
    this.scene.add(fuel1);
    this.levelBuilder.propFactory.interactables.push(fuel1);

    // Fuel Can 2: In Manager's Office
    const fuel2 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, 0.3), fuelMat);
    fuel2.position.set(-24, 0.25, 14);
    fuel2.userData = { type: 'fuel_can_pickup' };
    this.scene.add(fuel2);
    this.levelBuilder.propFactory.interactables.push(fuel2);

    this.fuelCanMeshes.push(fuel1, fuel2);
  }

  updateHUD() {
    const taskEl = document.getElementById('task-description');
    const taskTitleEl = document.getElementById('task-title');
    if (!taskEl) return;

    switch (this.currentStep) {
      case 1:
        if (taskTitleEl) taskTitleEl.textContent = 'PHASE 1: CLOCK-IN & SANITIZATION';
        if (!this.punchedIn) {
          taskEl.innerHTML = '• Punch in at the <b>Timecard Machine [E]</b> on the front register counter';
        } else if (!this.player.inventory.hasMop) {
          taskEl.innerHTML = '• Pick up the <b>Industrial Mop [E]</b> near the front service counter';
        } else {
          taskEl.innerHTML = `• Use <b>Mop [Left Click]</b> to clean rancid toxic grease (${this.greaseCleanedCount}/${this.totalGreaseSpills})`;
        }
        break;
      case 2:
        if (taskTitleEl) taskTitleEl.textContent = 'PHASE 2: PLAYPLACE & MEAT VAULT';
        taskEl.innerHTML = this.player.inventory.hasKeycard
          ? '• Use the <b>Yellow Keycard [E]</b> to unlock the Walk-in Meat Vault on the East side'
          : '• Search the <b>Cursed Ball Pit [E]</b> in the PlayPlace room for the Manager Keycard';
        break;
      case 3:
        if (taskTitleEl) taskTitleEl.textContent = 'PHASE 3: DEEP FRYER OVERLOAD';
        taskEl.innerHTML = `• Collect <b>Mystery Meat Bags [E]</b> (${this.player.inventory.mysteryMeatCount}/${this.totalMysteryMeat}) and drop them into Deep Fryers`;
        break;
      case 4:
        if (taskTitleEl) taskTitleEl.textContent = 'PHASE 4: TOTAL BLACKOUT & GENERATOR RESTORE';
        taskEl.innerHTML = `• <span style="color:#ef4444; font-weight:bold;">SURVIVE:</span> Find 2 <b>Diesel Fuel Cans [E]</b> (${this.generatorFuelCount}/${this.requiredFuel}) and refuel the <b>Emergency Generator</b> in South Cellar!`;
        break;
      case 5:
        if (taskTitleEl) taskTitleEl.textContent = 'PHASE 5: THE COLONEL STALKER BOSS';
        taskEl.innerHTML = '• <span style="color:#ef4444; font-weight:bold;">BOSS BATTLE:</span> Stun the Colonel with <b>Boiling Oil [4]</b> or <b>Cleaver [3]</b> and grab the <b>Drive-Thru Key</b>!';
        break;
      case 6:
        if (taskTitleEl) taskTitleEl.textContent = 'PHASE 6: FINAL ESCAPE!';
        taskEl.innerHTML = '• Run to the <b>West Drive-Thru Window [E]</b>, slide the shutter open and escape!';
        break;
    }
  }

  handleInteraction(data, object) {
    if (!data) return;

    // Timecard punch in
    if (data.type === 'punch_clock' && !this.punchedIn) {
      this.punchedIn = true;
      data.punched = true;
      if (this.audio) this.audio.playTimecardPunch();
      this.showBanner('PUNCHED IN: 03:14 AM - SHIFT COMMENCED');
      this.player.showNotification('+ TIME CLOCK PUNCHED');
      this.updateHUD();
      return;
    }

    // Pick up Mop
    if (data.type === 'mop_pickup' && !this.player.inventory.hasMop) {
      if (!this.punchedIn) {
        this.punchedIn = true;
        if (this.punchClockMesh) this.punchClockMesh.userData.punched = true;
        if (this.audio) this.audio.playTimecardPunch();
      }
      this.player.inventory.hasMop = true;
      object.visible = false;
      this.removeInteractable(object);
      this.player.selectSlot('mop');
      if (this.audio) this.audio.playMopSlosh();
      this.showBanner('EQUIPPED: INDUSTRIAL MOP');
      this.player.showNotification('+ ACQUIRED INDUSTRIAL MOP');
      this.updateHUD();
      return;
    }

    // Pick up Keycard
    if (data.type === 'keycard_pickup' && !this.player.inventory.hasKeycard) {
      this.player.inventory.hasKeycard = true;
      object.visible = false;
      this.removeInteractable(object);
      if (this.audio) this.audio.playAccessGranted();
      this.showBanner('RETRIEVED: FREEZER SECURITY KEYCARD');
      this.player.showNotification('+ ACQUIRED YELLOW KEYCARD');
      if (this.currentStep === 2) this.updateHUD();
      return;
    }

    // Drink Cola
    if (data.type === 'soda_pickup') {
      this.player.heal(35);
      object.visible = false;
      this.removeInteractable(object);
      return;
    }

    // Recharge Battery
    if (data.type === 'battery_pickup') {
      this.player.rechargeBattery(50);
      object.visible = false;
      this.removeInteractable(object);
      return;
    }

    // Pick up Fuel Can
    if (data.type === 'fuel_can_pickup') {
      this.player.inventory.fuelCount = (this.player.inventory.fuelCount || 0) + 1;
      object.visible = false;
      this.removeInteractable(object);
      if (this.audio) this.audio.playAccessGranted();
      this.player.showNotification(`+ ACQUIRED DIESEL FUEL CAN (${this.player.inventory.fuelCount}/${this.requiredFuel})`);
      this.updateHUD();
      return;
    }

    // Pick up Mystery Meat
    if (data.type === 'meat_pickup') {
      this.player.inventory.mysteryMeatCount++;
      object.visible = false;
      this.removeInteractable(object);
      if (this.audio) this.audio.playAccessGranted();
      this.player.showNotification(`+ ACQUIRED MYSTERY MEAT (${this.player.inventory.mysteryMeatCount}/${this.totalMysteryMeat})`);
      this.updateHUD();
      return;
    }

    // Unlock / Open Freezer Door
    if (data.type === 'freezer_door' && !data.isOpen) {
      if (this.player.inventory.hasKeycard) {
        data.isLocked = false;
        data.isOpen = true;
        if (this.audio) this.audio.playAccessGranted();
        this.showBanner('ACCESS GRANTED: MEAT VAULT UNLOCKED');
        object.position.z += 2.2;
        
        // Remove from player colliders so doorway is freely walkable
        if (this.player) {
          const cIdx = this.player.colliders.indexOf(object);
          if (cIdx !== -1) this.player.colliders.splice(cIdx, 1);
          if (this.player.colliderBounds) {
            const bIdx = this.player.colliderBounds.findIndex(b => b.object === object);
            if (bIdx !== -1) this.player.colliderBounds.splice(bIdx, 1);
          }
        }

        this.removeInteractable(object);
        if (this.currentStep === 2) this.currentStep = 3;
        this.updateHUD();
      } else {
        this.showBanner('LOCKED: Requires Yellow Keycard from PlayPlace Ball Pit!');
      }
      return;
    }

    // Drop Mystery Meat into Fryer Station
    if (data.type === 'fryer_station') {
      const loadedCount = data.loadedCount || 0;
      const maxMeat = data.maxMeat || this.totalMysteryMeat;
      if (this.player.inventory.mysteryMeatCount > 0 && loadedCount < maxMeat) {
        data.loadedCount = loadedCount + 1;
        data.hasMeat = data.loadedCount >= maxMeat;
        this.mysteryMeatLoaded++;
        this.player.inventory.mysteryMeatCount--;
        if (this.audio) this.audio.playHotOilSplash();
        this.player.showNotification(`+ LOADED MEAT INTO FRYER (${this.mysteryMeatLoaded}/${this.totalMysteryMeat})`);

        if (this.mysteryMeatLoaded >= this.totalMysteryMeat) {
          this.triggerBlackoutOutbreak();
        }
        this.updateHUD();
      }
      return;
    }

    // Refuel Emergency Diesel Generator in South Cellar
    if (data.type === 'generator' && this.currentStep === 4) {
      if (this.player.inventory.fuelCount > 0) {
        data.fuelCount = (data.fuelCount || 0) + 1;
        this.generatorFuelCount = data.fuelCount;
        this.player.inventory.fuelCount--;
        if (this.audio) this.audio.playBreakerRestore();
        this.player.showNotification(`+ GENERATOR REFUELED (${data.fuelCount}/${this.requiredFuel})`);

        if (data.fuelCount >= this.requiredFuel) {
          data.fueled = true;
          this.lighting.setPower(true);
          this.showBanner('⚡ EMERGENCY POWER ONLINE! THE COLONEL HAS ARRIVED');
          this.triggerColonelBoss();
        }
        this.updateHUD();
      } else {
        this.showBanner('NEEDS FUEL: Find 2 Diesel Fuel Cans (Restroom & Manager Office)');
      }
      return;
    }

    // Pick up Shutter Key
    if (data.type === 'shutter_key_pickup' && this.currentStep === 5) {
      this.player.inventory.hasShutterKey = true;
      object.visible = false;
      this.removeInteractable(object);
      if (this.audio) this.audio.playAccessGranted();
      this.showBanner('RETRIEVED: DRIVE-THRU EMERGENCY KEY');
      this.player.showNotification('+ ACQUIRED DRIVE-THRU KEY');
      this.currentStep = 6;
      this.updateHUD();
      return;
    }

    // Escape through Drive-Thru window
    if (data.type === 'drive_thru_window') {
      if (this.currentStep === 6 && this.player.inventory.hasShutterKey) {
        object.position.z += 1.6;
        if (this.audio) this.audio.playAccessGranted();
        this.triggerVictory();
      } else {
        this.showBanner('LOCKED: Requires Drive-Thru Emergency Key!');
      }
      return;
    }
  }

  handleMopAction(playerPos) {
    if (!this.punchedIn) return;

    const spills = this.levelBuilder.greaseSpills || [this.levelBuilder.greaseSpill].filter(Boolean);
    const spill = spills.find((candidate) => {
      if (!candidate || candidate.userData.cleaned) return false;
      return playerPos.distanceTo(candidate.position) < 4.0;
    });

    if (spill) {
      spill.userData.cleanProgress = (spill.userData.cleanProgress || 0) + 0.4;
      spill.material.opacity = Math.max(0, 0.9 - spill.userData.cleanProgress);

      if (spill.userData.cleanProgress >= 1.0) {
        spill.userData.cleaned = true;
        spill.visible = false;
        this.removeInteractable(spill);
        this.greaseCleanedCount++;
        this.player.showNotification(`+ GREASE SPILL CLEANED (${this.greaseCleanedCount}/${this.totalGreaseSpills})`);
        if (this.greaseCleanedCount >= this.totalGreaseSpills && this.currentStep === 1) {
          this.showBanner('ALL GREASE CLEANED! SEARCH PLAYPLACE FOR KEYCARD');
          this.currentStep = 2;
        }
        this.updateHUD();
      }
    }
  }

  triggerBlackoutOutbreak() {
    this.currentStep = 4;
    this.lighting.setPower(false);

    if (this.audio) {
      this.audio.playJumpscareStinger();
      this.audio.playMonsterScreech();
    }

    this.showBanner('⚠️ TOTAL GRID BLACKOUT! REFUEL SOUTH BASEMENT GENERATOR!');

    // Spawn Mutant Chicken Chimera in Dining Hall
    if (this.monster) {
      this.monster.spawn(new THREE.Vector3(0, 0, -14));
    }

    // Spawn 4 Skittering Spider Hatchlings across expanded zones
    if (this.hatchlingTexture) {
      const h1 = new HatchlingEntity({
        scene: this.scene,
        texture: this.hatchlingTexture,
        spawnPos: new THREE.Vector3(22, 0.45, -18), // PlayPlace
        audio: this.audio
      });
      const h2 = new HatchlingEntity({
        scene: this.scene,
        texture: this.hatchlingTexture,
        spawnPos: new THREE.Vector3(-22, 0.45, -20), // Restrooms
        audio: this.audio
      });
      const h3 = new HatchlingEntity({
        scene: this.scene,
        texture: this.hatchlingTexture,
        spawnPos: new THREE.Vector3(0, 0.45, 10), // Kitchen
        audio: this.audio
      });
      const h4 = new HatchlingEntity({
        scene: this.scene,
        texture: this.hatchlingTexture,
        spawnPos: new THREE.Vector3(0, 0.45, 28), // South Cellar
        audio: this.audio
      });
      this.hatchlings.push(h1, h2, h3, h4);
    }

    // Spawn the Hot Oil Pitcher on the kitchen prep island
    const pitcherMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.1 });
    const pitcher = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.45, 16), pitcherMat);
    pitcher.position.set(0, 1.3, 10);
    pitcher.userData = { type: 'oil_pitcher_pickup' };
    this.scene.add(pitcher);
    this.levelBuilder.propFactory.interactables.push(pitcher);
    this.player.showNotification('⚠️ PICK UP BOILING OIL PITCHER [E] ON PREP TABLE');

    this.updateHUD();
  }

  triggerColonelBoss() {
    this.currentStep = 5;

    // Spawn Colonel Stalker Boss at front order counter
    if (this.colonelTexture) {
      this.colonel = new MonsterEntity({
        scene: this.scene,
        texture: this.colonelTexture,
        audio: this.audio,
        type: 'colonel'
      });
      this.colonel.spawn(new THREE.Vector3(0, 0, -4.5));
    }

    // Spawn Drive-Thru Shutter Key on front register counter
    const keyMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      roughness: 0.2,
      emissive: 0x16a34a,
      emissiveIntensity: 0.5
    });
    const shutterKey = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.4), keyMat);
    shutterKey.position.set(2, 1.3, -4.5);
    shutterKey.userData = { type: 'shutter_key_pickup' };
    this.scene.add(shutterKey);
    this.levelBuilder.propFactory.interactables.push(shutterKey);

    this.updateHUD();
  }

  createObjectiveMarker() {
    const markerGeo = new THREE.ConeGeometry(0.25, 0.6, 8);
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      wireframe: true
    });
    this.objectiveMarker = new THREE.Mesh(markerGeo, markerMat);
    this.objectiveMarker.rotation.x = Math.PI;
    this.scene.add(this.objectiveMarker);
  }

  update(delta, playerPos) {
    if (this.gameOver || this.gameWon) return;

    // Update objective marker floating over current target
    this.objectiveTime += delta * 4;
    let targetMesh = null;

    if (this.currentStep === 1) {
      if (!this.punchedIn) targetMesh = this.punchClockMesh;
      else if (!this.player.inventory.hasMop) targetMesh = this.levelBuilder.mopBucket;
    } else if (this.currentStep === 2) {
      targetMesh = this.player.inventory.hasKeycard ? this.levelBuilder.freezerDoorMesh : this.keycardMesh;
    } else if (this.currentStep === 3) {
      targetMesh = this.player.inventory.mysteryMeatCount > 0 ? this.levelBuilder.fryerStation : this.meatMeshes.find(m => m.visible);
    } else if (this.currentStep === 4) {
      targetMesh = this.fuelCanMeshes.find(f => f.visible);
    } else if (this.currentStep === 6) {
      targetMesh = this.levelBuilder.dtWindow;
    }

    if (targetMesh && targetMesh.visible) {
      targetMesh.getWorldPosition(this.objectiveWorldPosition);
      this.objectiveMarker.visible = true;
      this.objectiveMarker.position.set(
        this.objectiveWorldPosition.x,
        this.objectiveWorldPosition.y + 1.2 + Math.sin(this.objectiveTime) * 0.15,
        this.objectiveWorldPosition.z
      );
      this.objectiveMarker.rotation.y += delta * 2;
    } else {
      this.objectiveMarker.visible = false;
    }

    // Update Hatchling Entities
    if (this.hatchlings && this.hatchlings.length > 0) {
      this.hatchlings.forEach(h => {
        h.update(delta, playerPos, this.player.camera, (damage) => {
          this.player.takeDamage(damage);
        });
      });
    }

    // Update Colonel Stalker Boss
    if (this.colonel) {
      this.colonel.update(
        delta,
        playerPos,
        this.player.camera,
        this.lighting.flashlightOn
      );

      if (this.colonel.mesh.visible && this.colonel.state === 'CHASE') {
        const cDist = playerPos.distanceTo(this.colonel.mesh.position);
        if (cDist < 1.5) {
          this.player.takeDamage(35);
          this.colonel.stun(2.0);
        }
      }
    }

    // Check Chimera Monster attack distance
    if (this.monster && this.monster.mesh.visible && this.monster.state === 'CHASE') {
      const dist = playerPos.distanceTo(this.monster.mesh.position);
      if (dist < 1.4) {
        this.player.takeDamage(40);
        this.monster.stun(2.5);
      }
    }
  }

  showBanner(text) {
    const banner = document.getElementById('quest-banner');
    if (banner) {
      banner.textContent = text;
      banner.style.display = 'block';
      banner.style.animation = 'none';
      void banner.offsetWidth;
      banner.style.animation = 'bannerFade 3s forwards';
    }
  }

  removeInteractable(object) {
    const interactables = this.levelBuilder?.propFactory?.interactables;
    if (!interactables) return;
    const index = interactables.indexOf(object);
    if (index !== -1) interactables.splice(index, 1);
    if (this.player) {
      this.player.focusedObject = null;
      this.player.lastPromptText = '';
      this.player.raycastTimer = 0;
    }
  }

  triggerVictory() {
    this.gameWon = true;
    if (this.player) this.player.isLocked = false;
    const winScreen = document.getElementById('win-screen');
    if (winScreen) winScreen.style.display = 'flex';
    if (document.exitPointerLock) document.exitPointerLock();
  }

  triggerGameOver() {
    this.gameOver = true;
    if (this.player) this.player.isLocked = false;
    if (this.audio) this.audio.playJumpscareStinger();
    const jumpscare = document.getElementById('jumpscare-overlay');
    if (jumpscare) jumpscare.style.display = 'flex';
    if (document.exitPointerLock) document.exitPointerLock();
  }
}
