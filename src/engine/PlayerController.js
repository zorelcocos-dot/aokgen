import * as THREE from 'three';

/**
 * PlayerController - Cinematic polished FPS controller
 * - WASD + mouse look, smooth headbob, footstep surfaces
 * - Noise system for monster AI
 * - Hiding spots, crouch, sprint with stamina
 * - Cinematic camera shake, lens breathing
 * - Polished interaction with highlight + type labels
 * - Battery, health, flashlight battery system
 */

export class PlayerController {
  constructor(camera, domElement, colliders, audio, lighting) {
    this.camera = camera;
    this.domElement = domElement;
    this.colliders = colliders || [];
    this.audio = audio;
    this.lighting = lighting;

    // Movement
    this.walkSpeed = 4.4;
    this.sprintSpeed = 7.8;
    this.crouchSpeed = 2.2;
    this.currentSpeed = this.walkSpeed;

    this.playerHeight = 1.65;
    this.crouchHeight = 0.95;
    this.targetHeight = this.playerHeight;

    // Position
    // Start outside near car for intro, will be teleported after intro
    this.position = new THREE.Vector3(0, this.playerHeight, -42);
    this.velocity = new THREE.Vector3();
    this.worldBounds = { minX: -34, maxX: 34, minZ: -54, maxZ: 38 };
    this.camera.position.copy(this.position);

    // Orientation
    this.pitch = -0.05;
    this.yaw = 0;

    // Vitals
    this.health = 100;
    this.maxHealth = 100;
    this.stamina = 100;
    this.maxStamina = 100;
    this.battery = 100;
    this.maxBattery = 100;
    this.isDead = false;

    // Noise system (for monster AI)
    this.noiseLevel = 0; // 0-1, decays
    this.noiseRadius = 0; // meters
    this.isHiding = false;

    // Headbob
    this.bobTimer = 0;
    this.footstepTimer = 0;
    this.isMoving = false;
    this.isSprinting = false;
    this.isCrouching = false;
    this.screenShakeIntensity = 0;
    this.screenShakeTime = 0;
    this.shakeOffset = new THREE.Vector3();

    // Raycast
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 3.8;
    this.raycastCenter = new THREE.Vector2(0, 0);
    this.focusedObject = null;
    this.lastPrompt = '';
    this.raycastTimer = 0;
    this.colliderBounds = (this.colliders || []).map(o => ({
      object: o,
      box: new THREE.Box3().setFromObject(o)
    }));
    this.moveDir = new THREE.Vector3();
    this.nextPosition = new THREE.Vector3();
    this.collisionPoint = new THREE.Vector3();
    this.lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');

    // Inventory as Map for extensibility + legacy compat
    this.inventory = {
      items: new Map(), // id -> { count, data }
      keys: new Set(),
      hasMop: false,
      hasKeycard: false,
      hasSpatula: true,
      hasOil: false,
      hasShutterKey: false,
      hasOfficeKey: false,
      hasCarKey: false,
      mysteryMeatCount: 0,
      fuelCount: 0,
      sodaCount: 0,
      batteryCount: 0,
      documents: new Set(),

      hasKey: (id) => {
        return this.inventory.keys.has(id) ||
               this.inventory.items.has(id) ||
               this.inventory['has' + id.charAt(0).toUpperCase() + id.slice(1)] ||
               (id === 'office_key' && this.inventory.hasOfficeKey) ||
               (id === 'freezer_keycard' && this.inventory.hasKeycard) ||
               (id === 'drive_thru_key' && this.inventory.hasShutterKey) ||
               (id === 'car_key' && this.inventory.hasCarKey);
      }
    };
    this.activeSlot = 'flashlight';

    // Input
    this.keys = {};
    this.isLocked = false;
    this.isStarted = false;
    this.pointerLockRequested = false;

    this.setupInputs();
  }

  setupInputs() {
    const blocker = document.getElementById('blocker');
    const startBtn = document.getElementById('start-btn');
    this.isStarted = false;
    this.isLocked = false;
    this.pointerLockRequested = false;

    const requestPointerLock = () => {
      if (this.pointerLockRequested || document.pointerLockElement === this.domElement) return;
      if (!this.domElement?.isConnected) return;
      this.pointerLockRequested = true;
      try {
        const p = this.domElement.requestPointerLock?.();
        if (p?.catch) p.catch(() => { this.pointerLockRequested = false; });
      } catch { this.pointerLockRequested = false; }
    };

    const startGame = () => {
      if (this.isDead || this.questManager?.gameWon) return;
      if (this.isStarted) {
        requestPointerLock();
        return;
      }
      this.isStarted = true;
      this.isLocked = true;
      if (blocker) blocker.style.display = 'none';
      if (this.audio) {
        try { this.audio.init(); this.audio.resume(); } catch {}
      }
      if (this.onStart) this.onStart();
      requestPointerLock();
    };

    if (startBtn) {
      startBtn.onclick = (e) => { e.stopPropagation(); e.preventDefault(); startGame(); };
      startBtn.onpointerdown = (e) => { e.stopPropagation(); startGame(); };
    }
    if (blocker) {
      blocker.onclick = (e) => { e.stopPropagation(); startGame(); };
    }

    window.addEventListener('click', (e) => {
      if (!this.isStarted) startGame();
      else if (e.target === this.domElement && !document.pointerLockElement) requestPointerLock();
    });

    window.addEventListener('keydown', (e) => {
      if (!this.isStarted) startGame();
      if (!this.isStarted && blocker?.style.display !== 'none') return;
    });

    document.addEventListener('pointerlockchange', () => {
      const hasLock = document.pointerLockElement === this.domElement;
      if (hasLock) {
        this.isLocked = true;
        this.pointerLockRequested = false;
      } else if (this.isStarted) {
        // Only keep isLocked true if we are still in game (allow mouse to menu)
        this.pointerLockRequested = false;
        // Keep movement enabled even without pointer lock for accessibility
        this.isLocked = true;
      }
    });

    // Mouse look
    window.addEventListener('mousemove', (e) => {
      if (!this.isStarted || !this.isLocked) return;
      const sensitivity = parseFloat(localStorage.getItem('sensitivity') || '0.0025');
      let dx = 0, dy = 0;
      if (document.pointerLockElement === this.domElement) {
        dx = e.movementX || 0;
        dy = e.movementY || 0;
      }
      if (dx !== 0 || dy !== 0) {
        this.yaw -= dx * sensitivity;
        this.pitch -= dy * sensitivity;
        this.pitch = Math.max(-Math.PI / 2.15, Math.min(Math.PI / 2.15, this.pitch));
        this.lookEuler.set(this.pitch, this.yaw, 0, 'YXZ');
        this.camera.quaternion.setFromEuler(this.lookEuler);
      }
    });

    // Keyboard
    window.addEventListener('keydown', (e) => {
      if (!this.isStarted) startGame();
      if (this.isDead) return;
      this.keys[e.code] = true;

      // Flashlight
      if (e.code === 'KeyF') {
        if (this.lighting && this.battery > 0) {
          const isOn = this.lighting.toggleFlashlight();
          if (this.audio) this.audio.playFlashlightClick();
          this.showNotification(isOn ? 'FLASHLIGHT ON' : 'FLASHLIGHT OFF', 1200);
        }
      }

      // Lean? Q E for peeking (optional small effect)
      if (e.code === 'KeyQ') this.isLeaningLeft = true;
      if (e.code === 'KeyE' && !e.ctrlKey) {
        // E is interact, but hold check?
        // We handle interact on keydown (single press)
        if (!this._eDown) {
          this._eDown = true;
          this.interact();
        }
      }

      // Slots
      if (e.code === 'Digit1') this.selectSlot('flashlight');
      if (e.code === 'Digit2' && this.inventory.hasMop) this.selectSlot('mop');
      if (e.code === 'Digit3' && this.inventory.hasSpatula) this.selectSlot('spatula');
      if (e.code === 'Digit4' && this.inventory.hasOil) this.selectSlot('oil');

      if (e.code === 'KeyC') {
        // Toggle crouch in polished way? We'll use hold, but allow toggle with tap
        if (!this._cToggleTime || Date.now() - this._cToggleTime > 280) {
          this._cToggleTime = Date.now();
        }
      }

      // Hiding spot
      if (e.code === 'KeyH' && this.nearHidingSpot) {
        this.toggleHiding();
      }

      // Inventory read (R)
      if (e.code === 'KeyR' && this.focusedObject?.userData?.type === 'document') {
        this.interact();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'KeyE') this._eDown = false;
      if (e.code === 'KeyQ') this.isLeaningLeft = false;
      if (e.code === 'KeyE' && e.ctrlKey) {} // ignore
    });

    window.addEventListener('wheel', (e) => {
      if (!this.isStarted) return;
      const slots = ['flashlight'];
      if (this.inventory.hasMop) slots.push('mop');
      if (this.inventory.hasSpatula) slots.push('spatula');
      if (this.inventory.hasOil) slots.push('oil');
      let curIdx = slots.indexOf(this.activeSlot);
      if (e.deltaY > 0) curIdx = (curIdx + 1) % slots.length;
      else curIdx = (curIdx - 1 + slots.length) % slots.length;
      this.selectSlot(slots[curIdx]);
    });

    window.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.isLocked && this.isStarted && !this.isDead) {
        // Poll focus flashlight (right click is focus)
        this.useItem();
      }
      if (e.button === 2 && this.isLocked && this.isStarted) {
        // Right click = focus beam / stun
        if (this.lighting) {
          this.isFocusBeam = true;
          if (this.lighting.flashlight) {
            this.lighting.flashlight.angle = Math.PI / 12;
            this.lighting.flashlight.intensity *= 1.6;
          }
        }
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) {
        this.isFocusBeam = false;
        if (this.lighting?.flashlight) {
          this.lighting.flashlight.angle = Math.PI / 4.2;
          this.lighting.flashlight.intensity = 4.8;
        }
      }
    });

    // Prevent context menu on right click stun
    this.domElement?.addEventListener('contextmenu', e => e.preventDefault());
  }

  selectSlot(slotName) {
    if (this.activeSlot === slotName) return;
    this.activeSlot = slotName;
    if (this.viewmodel) this.viewmodel.setItem(slotName);
    document.querySelectorAll('.hotbar-slot').forEach(el => el.classList.remove('active'));
    document.getElementById(`slot-${slotName}`)?.classList.add('active');
  }

  useItem() {
    if (!this.viewmodel || this.isDead || this.isHiding) return;
    this.viewmodel.triggerAction((item) => {
      // Noise generation
      this.makeNoise(item === 'oil' ? 0.9 : item === 'spatula' ? 0.7 : item === 'mop' ? 0.5 : 0.1);

      if (item === 'mop') {
        if (this.questManager) this.questManager.handleMopAction(this.camera.position);
        if (this.questManager?.hatchlings) {
          this.questManager.hatchlings.forEach(h => {
            if (!h.isDead && this.position.distanceTo(h.mesh.position) < 2.5) h.takeDamage(30);
          });
        }
      } else if (item === 'spatula') {
        if (this.monster) {
          const dist = this.camera.position.distanceTo(this.monster.mesh.position);
          if (dist < 3.2) {
            this.monster.stun(2.8);
            this.monster.hearNoise(this.position, 1.0);
            if (this.audio) this.audio.playMonsterHit();
          }
        }
        if (this.questManager?.colonel) {
          const cDist = this.camera.position.distanceTo(this.questManager.colonel.mesh.position);
          if (cDist < 3.2) {
            this.questManager.colonel.stun(2.2);
            if (this.audio) this.audio.playMonsterHit();
          }
        }
        if (this.questManager?.hatchlings) {
          this.questManager.hatchlings.forEach(h => {
            if (!h.isDead && this.position.distanceTo(h.mesh.position) < 3.2) h.takeDamage(38);
          });
        }
      } else if (item === 'oil') {
        if (this.audio) this.audio.playHotOilSplash();
        this.showNotification('SCALDING GREASE SPLASH!', 1800);
        if (this.monster && this.position.distanceTo(this.monster.mesh.position) < 6.2) {
          this.monster.stun(4.8);
          this.monster.hearNoise(this.position, 1.0);
          if (this.audio) this.audio.playMonsterScreech();
        }
        if (this.questManager?.colonel && this.position.distanceTo(this.questManager.colonel.mesh.position) < 6.2) {
          this.questManager.colonel.stun(4.2);
          if (this.audio) this.audio.playMonsterScreech();
        }
        if (this.questManager?.hatchlings) {
          this.questManager.hatchlings.forEach(h => {
            if (!h.isDead && this.position.distanceTo(h.mesh.position) < 5.2) h.takeDamage(55);
          });
        }
      }
    });
  }

  makeNoise(level) {
    // level 0-1
    this.noiseLevel = Math.max(this.noiseLevel, level);
    this.noiseRadius = level * 18; // max hearing radius
    // Alert monsters
    if (this.monster) this.monster.hearNoise(this.position, level);
    if (this.questManager?.colonel) this.questManager.colonel.hearNoise(this.position, level);
    if (this.questManager?.hatchlings) {
      this.questManager.hatchlings.forEach(h => {
        if (h.hearNoise) h.hearNoise(this.position, level);
      });
    }
  }

  addScreenShake(intensity, duration) {
    this.screenShakeIntensity = Math.max(this.screenShakeIntensity, intensity);
    this.screenShakeTime = Math.max(this.screenShakeTime, duration);
  }

  takeDamage(amount) {
    if (this.isDead || this.isHiding) return;
    this.health = Math.max(0, this.health - amount);
    if (this.audio) {
      this.audio.playPlayerHurt();
      this.audio.playHeartbeat(1.6);
      if (amount >= 28) this.audio.playJumpscareStinger(0.55);
    }
    const glitch = document.getElementById('damage-glitch-face');
    if (glitch) {
      glitch.classList.add('flash');
      setTimeout(() => glitch.classList.remove('flash'), 320);
    }
    const vign = document.getElementById('damage-vignette');
    if (vign) {
      vign.classList.add('damaged');
      setTimeout(() => vign.classList.remove('damaged'), 460);
    }
    this.updateHealthHUD();
    this.addScreenShake(0.35, 0.5);
    if (this.health <= 0) {
      this.isDead = true;
      this.isLocked = false;
      if (this.questManager && !this.questManager.gameOver) this.questManager.triggerGameOver();
      else {
        document.getElementById('jumpscare-overlay').style.display = 'flex';
        if (this.audio) this.audio.playJumpscareStinger(0.9);
      }
      if (document.exitPointerLock) document.exitPointerLock();
    }
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
    this.updateHealthHUD();
    if (this.audio) this.audio.playSodaDrink();
    this.showNotification(`+ ${amount} HP RESTORED`, 2000);
  }

  rechargeBattery(amount) {
    this.battery = Math.min(this.maxBattery, this.battery + amount);
    this.updateBatteryHUD();
    if (this.audio) this.audio.playBatteryRecharge();
    this.showNotification(`+ ${amount}% BATTERY`, 2000);
    if (this.lighting) this.lighting.setBatteryLevel(this.battery);
  }

  updateHealthHUD() {
    const fill = document.getElementById('health-bar-fill');
    const num = document.getElementById('health-num');
    if (fill) fill.style.width = `${this.health}%`;
    if (num) num.textContent = `${Math.round(this.health)}%`;
  }

  updateBatteryHUD() {
    const fill = document.getElementById('battery-bar-fill');
    const num = document.getElementById('battery-num');
    if (fill) fill.style.width = `${this.battery}%`;
    if (num) num.textContent = `${Math.round(this.battery)}%`;
  }

  showNotification(text, duration = 2800) {
    const el = document.getElementById('loot-notification');
    if (!el) return;
    el.textContent = text;
    el.style.display = 'block';
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = 'notifPop 0.3s ease';
    clearTimeout(this.lootTimeout);
    this.lootTimeout = setTimeout(() => el.style.display = 'none', duration);
  }

  interact() {
    if (!this.focusedObject) return;
    const data = this.focusedObject.userData;
    if (!data) return;

    // Door handling via DoorSystem (handled in QuestManager secondary, but we try early)
    if (data.type === 'door') {
      if (this.questManager?.doorSystem) {
        const result = this.questManager.doorSystem.tryInteract(data.doorName, this.inventory, this.lighting);
        if (result) {
          this.showNotification(result.message, 1900);
          // The door animation will update colliders via callback
          return;
        }
      }
    }

    if (this.questManager) {
      this.questManager.handleInteraction(data, this.focusedObject);
    }

    // Hiding spots
    if (data.type === 'hiding_spot') {
      this.toggleHiding();
    }
  }

  toggleHiding() {
    if (this.isHiding) {
      this.isHiding = false;
      this.showNotification('Left hiding spot.', 1500);
      this.position.y = this.playerHeight;
      if (this.audio) this.audio.playFootstep(0.2);
    } else {
      this.isHiding = true;
      this.showNotification('Hiding. Stay still and crouched.', 2000);
      this.position.y = this.crouchHeight * 0.6;
      this.isCrouching = true;
      this.noiseLevel = 0;
      // Monster loses interest slower if hiding
      if (this.monster && this.monster.state === 'CHASE') {
        this.monster.searchTime = 0;
        this.monster.state = 'SEARCH';
      }
    }
  }

  update(delta, interactables) {
    if (!this.isStarted || this.isDead) return;
    // Allow slight movement even when not locked? Keep locked required for look but allow pause menu
    if (!this.isLocked) {
      // Still update raycast when paused? no
      // Decay noise
      this.noiseLevel = Math.max(0, this.noiseLevel - delta * 0.7);
      this.noiseRadius = Math.max(0, this.noiseRadius - delta * 6);
      return;
    }

    // Noise decay
    this.noiseLevel = Math.max(0, this.noiseLevel - delta * 0.55);
    this.noiseRadius = Math.max(0, this.noiseRadius - delta * 4.5);

    // Low health heartbeat
    if (this.health < 48) {
      this.heartbeatTimer = (this.heartbeatTimer || 0) + delta;
      const interval = this.health < 26 ? 0.6 : 1.0;
      if (this.heartbeatTimer >= interval) {
        this.heartbeatTimer = 0;
        if (this.audio) this.audio.playHeartbeat(this.health < 26 ? 1.3 : 0.85);
      }
    }

    // Battery drain
    if (this.lighting?.flashlightOn) {
      const drain = this.isFocusBeam ? 4.2 : 1.35;
      this.battery = Math.max(0, this.battery - delta * drain);
      this.updateBatteryHUD();
      this.lighting.setBatteryLevel(this.battery);
      if (this.battery <= 0) {
        this.lighting.toggleFlashlight();
        this.showNotification('⚠ BATTERY DEAD - FIND 9V PACKS', 3000);
      }
    }

    // Hiding - no movement
    if (this.isHiding) {
      this.camera.position.set(this.position.x + this.shakeOffset.x, this.position.y + this.shakeOffset.y, this.position.z + this.shakeOffset.z);
      if (Math.random() < 0.008 && this.keys['KeyW']) {
        // Moving while hiding makes noise and leaves hiding
        this.makeNoise(0.45);
        this.toggleHiding();
      }
      this.raycastTimer -= delta;
      if (this.raycastTimer <= 0) {
        this.raycastTimer = 0.09;
        this.updateRaycast(interactables);
      }
      // Screen shake decay even when hiding
      if (this.screenShakeTime > 0) {
        this.screenShakeTime -= delta;
        this.screenShakeIntensity = Math.max(0, this.screenShakeIntensity - delta * 0.9);
      }
      if (this.viewmodel) this.viewmodel.update(delta, false, 0.6);
      return;
    }

    // Movement input
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);
    this.moveDir.set(0, 0, 0);
    if (this.keys['KeyW'] || this.keys['ArrowUp']) { this.moveDir.x -= sinYaw; this.moveDir.z -= cosYaw; }
    if (this.keys['KeyS'] || this.keys['ArrowDown']) { this.moveDir.x += sinYaw; this.moveDir.z += cosYaw; }
    if (this.keys['KeyD'] || this.keys['ArrowRight']) { this.moveDir.x += cosYaw; this.moveDir.z -= sinYaw; }
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) { this.moveDir.x -= cosYaw; this.moveDir.z += sinYaw; }

    this.isMoving = this.moveDir.lengthSq() > 0.001;

    // Sprint / crouch
    this.isCrouching = this.keys['KeyC'] || this.keys['ControlLeft'] || this.keys['ControlRight'];
    this.isSprinting = (this.keys['ShiftLeft'] || this.keys['ShiftRight']) && this.isMoving && !this.isCrouching && this.stamina > 4;

    if (this.isSprinting) {
      this.currentSpeed = this.sprintSpeed;
      this.stamina = Math.max(0, this.stamina - delta * 26);
      if (this.stamina <= 0) this.makeNoise(0.25);
    } else if (this.isCrouching) {
      this.currentSpeed = this.crouchSpeed;
      this.stamina = Math.min(this.maxStamina, this.stamina + delta * 14);
    } else {
      this.currentSpeed = this.walkSpeed;
      this.stamina = Math.min(this.maxStamina, this.stamina + delta * 18);
    }

    // Generate noise based on movement
    if (this.isMoving) {
      let n = 0.08;
      if (this.isSprinting) n = 0.72;
      else if (this.isCrouching) n = 0.06;
      else n = 0.22;
      // Surface modifies
      const zone = this.lighting?.getCurrentZone(this.position) || 'dining';
      if (zone === 'freezer') n *= 0.5; // snow dampens
      this.noiseLevel = Math.max(this.noiseLevel, n);
      this.noiseRadius = Math.max(this.noiseRadius, n * 16);
    }

    // Height lerp
    this.targetHeight = this.isCrouching ? this.crouchHeight : this.playerHeight;
    this.position.y += (this.targetHeight - this.position.y) * 9 * delta;

    if (this.isMoving) {
      this.moveDir.normalize();
      const moveAmount = this.currentSpeed * delta;
      this.nextPosition.copy(this.position).addScaledVector(this.moveDir, moveAmount);

      // Slide collision
      if (!this.collidesAt(this.nextPosition.x, this.position.z)) this.position.x = this.nextPosition.x;
      if (!this.collidesAt(this.position.x, this.nextPosition.z)) this.position.z = this.nextPosition.z;

      this.position.x = THREE.MathUtils.clamp(this.position.x, this.worldBounds.minX, this.worldBounds.maxX);
      this.position.z = THREE.MathUtils.clamp(this.position.z, this.worldBounds.minZ, this.worldBounds.maxZ);

      const bobFreq = this.isSprinting ? 11 : (this.isCrouching ? 6.5 : 8.2);
      this.bobTimer += delta * bobFreq;
      this.footstepTimer += delta * (this.isSprinting ? 2.75 : this.isCrouching ? 1.1 : 1.7);

      if (this.footstepTimer >= 1.0) {
        this.footstepTimer = 0;
        if (this.audio) {
          const zone = this.lighting?.getCurrentZone(this.position) || 'dining';
          let surf = 'tile';
          if (zone === 'outdoor' || zone === 'parking') surf = 'concrete';
          if (zone === 'office' || zone === 'storage') surf = 'carpet';
          if (zone === 'basement' || zone === 'freezer') surf = 'metal';
          this.audio.footstepMaterial = surf;
          this.audio.playFootstep(this.isSprinting ? 0.35 : this.isCrouching ? 0.1 : 0.22, surf);
        }
      }
    }

    // Screen shake
    if (this.screenShakeTime > 0) {
      this.screenShakeTime -= delta;
      this.screenShakeIntensity = Math.max(0, this.screenShakeIntensity - delta * 0.8);
      const shake = this.screenShakeIntensity;
      this.shakeOffset.set(
        (Math.random() - 0.5) * shake * 0.18,
        (Math.random() - 0.5) * shake * 0.12,
        (Math.random() - 0.5) * shake * 0.18
      );
    } else {
      this.shakeOffset.set(0, 0, 0);
    }

    // Headbob
    const bobY = this.isMoving ? Math.sin(this.bobTimer) * (this.isSprinting ? 0.065 : this.isCrouching ? 0.02 : 0.032) : 0;
    const bobRoll = this.isMoving ? Math.cos(this.bobTimer * 0.5) * 0.011 : 0;
    this.camera.position.set(
      this.position.x + this.shakeOffset.x,
      this.position.y + bobY + this.shakeOffset.y,
      this.position.z + this.shakeOffset.z
    );
    this.lookEuler.set(this.pitch, this.yaw, bobRoll, 'YXZ');
    this.camera.quaternion.setFromEuler(this.lookEuler);

    // Lean effect
    if (this.isLeaningLeft) {
      this.camera.position.x -= 0.28;
    }

    // Raycast
    this.raycastTimer -= delta;
    if (this.raycastTimer <= 0) {
      this.raycastTimer = 0.08;
      this.updateRaycast(interactables);
    }

    if (this.viewmodel) {
      this.viewmodel.update(delta, this.isMoving, this.isSprinting ? 1.6 : 1.0, this.isCrouching);
    }
  }

  updateRaycast(interactables) {
    if (!interactables || interactables.length === 0) {
      this.setPrompt(null, '');
      return;
    }
    this.raycaster.setFromCamera(this.raycastCenter, this.camera);
    const intersects = this.raycaster.intersectObjects(interactables, true);
    if (intersects.length > 0) {
      let hit = intersects[0].object;
      while (hit && !hit.userData?.type && hit.parent && hit.parent !== this.scene) hit = hit.parent;
      if (hit?.userData?.type) {
        const prompt = this.getPromptText(hit.userData, hit);
        this.setPrompt(hit, prompt);
        return;
      }
    }
    this.setPrompt(null, '');
  }

  setPrompt(object, text) {
    const promptEl = document.getElementById('interact-prompt');
    const keyEl = document.getElementById('interact-key');
    const titleEl = document.getElementById('interact-title');

    if (this.focusedObject === object && this.lastPrompt === text) return;
    this.focusedObject = object;
    this.lastPrompt = text;

    if (!promptEl) return;
    if (text) {
      promptEl.style.display = 'flex';
      // Parse "KEY + Title" format e.g. "[E] Open Door"
      const match = text.match(/^\[(.+?)\]\s*(.*)/);
      if (match) {
        if (keyEl) keyEl.textContent = match[1];
        if (titleEl) titleEl.textContent = match[2];
      } else {
        if (keyEl) keyEl.textContent = 'E';
        if (titleEl) titleEl.textContent = text.replace(/\[E\]\s*/,'');
      }
      // Highlight target subtly (emissive)
      if (object && object.material && object.material.emissive) {
        object.userData._origEmissive = object.material.emissive.clone();
        object.material.emissive.setHex(0x222200);
      }
    } else {
      promptEl.style.display = 'none';
      // Restore emissive
      if (this.focusedObject?.material?.emissive && this.focusedObject?.userData?._origEmissive) {
        this.focusedObject.material.emissive.copy(this.focusedObject.userData._origEmissive);
      }
    }
  }

  collidesAt(x, z) {
    const radius = this.isCrouching ? 0.42 : 0.5;
    this.collisionPoint.set(x, this.position.y, z);
    const bottom = this.position.y - (this.isCrouching ? this.crouchHeight : this.playerHeight);
    const top = this.position.y;

    for (const entry of this.colliderBounds) {
      const obj = entry.object;
      if (!obj?.visible) continue;
      if (entry.box.min.x === Infinity) continue;
      // Door optimization: if door open skip
      if (obj.userData?.type === 'door') {
        // Will be handled by DoorSystem - skip if open significantly
        const doorName = obj.userData.doorName;
        const door = this.questManager?.doorSystem?.getDoor(doorName);
        if (door?.isOpen && Math.abs(door.currentAngle) > 0.4) continue;
        entry.box.setFromObject(obj);
      }
      if (obj.userData?.type === 'freezer_door' && obj.userData.isOpen) continue;

      if (
        this.collisionPoint.x >= entry.box.min.x - radius &&
        this.collisionPoint.x <= entry.box.max.x + radius &&
        this.collisionPoint.z >= entry.box.min.z - radius &&
        this.collisionPoint.z <= entry.box.max.z + radius &&
        entry.box.max.y >= bottom &&
        entry.box.min.y <= top
      ) return true;
    }
    return false;
  }

  refreshCollider(object) {
    const entry = this.colliderBounds.find(c => c.object === object);
    if (entry) entry.box.setFromObject(object);
  }

  getPromptText(data, mesh) {
    // Polished prompts with verb + object
    switch (data.type) {
      case 'punch_clock': return data.punched ? 'Timecard punched - 03:14 AM' : '[E] Punch timecard';
      case 'mop_pickup': return '[E] Pick up mop';
      case 'grease_spill': return data.cleaned ? 'Cleaned' : '[CLICK] Mop grease';
      case 'door':
        // From door system
        return data.prompt || '[E] Open';
      case 'freezer_door':
        if (this.questManager?.currentStep < 2) return 'Should clean first...';
        return data.isLocked ? '[E] Unlock vault (keycard required)' : '[E] Enter vault';
      case 'meat_pickup': return '[E] Collect meat bag';
      case 'fryer_station': {
        const loaded = data.loadedCount || 0;
        const max = data.maxMeat || 2;
        if (loaded >= max) return 'Fryers overloaded...';
        return this.inventory.mysteryMeatCount > 0 ? `[E] Load meat (${loaded}/${max})` : 'Needs meat bags';
      }
      case 'breaker': return '[E] Reset breaker';
      case 'soda_pickup': return '[E] Drink cola';
      case 'battery_pickup': return '[E] Take battery';
      case 'oil_pitcher_pickup': return '[E] Take boiling oil';
      case 'shutter_key_pickup': return '[E] Take drive-thru key';
      case 'drive_thru_window': return this.inventory.hasShutterKey ? '[E] Unlock & escape' : 'Locked - needs green key';
      case 'keycard_pickup': return '[E] Take yellow keycard';
      case 'office_key_pickup': return '[E] Take office key';
      case 'car_key_pickup': return '[E] Take car key';
      case 'fuel_can_pickup': return '[E] Take diesel fuel can';
      case 'document': return `[E] Read ${data.docTitle || 'note'}`;
      case 'cctv_monitor': return '[E] Watch CCTV';
      case 'generator': {
        if (data.fueled) return 'Generator running';
        const needs = data.requiredFuel - (data.fuelCount || 0);
        return this.inventory.fuelCount > 0 ? `[E] Refuel generator (${needs} left)` : `Needs diesel (${needs} cans)`;
      }
      case 'car': return '[E] Inspect car';
      case 'car_exit': return '[E] Exit car';
      case 'hiding_spot': return this.isHiding ? '[E] Leave' : '[E] Hide [H]';
      case 'phone': return '[E] Use phone';
      case 'safe': return data.isOpen ? 'Empty safe' : '[E] Inspect safe';
      case 'secret_wall': return '[E] Inspect wall';
      default: return data.prompt || '[E] Interact';
    }
  }
}
