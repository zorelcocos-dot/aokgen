import * as THREE from 'three';

/**
 * PlayerController handles first-person WASD movement, PointerLock mouse look,
 * sprinting, crouching, head bobbing, raycast interactions, vitals (HP & Battery),
 * weapon attacks, and inventory management.
 */
export class PlayerController {
  constructor(camera, domElement, colliders, audio, lighting) {
    this.camera = camera;
    this.domElement = domElement;
    this.colliders = colliders || [];
    this.audio = audio;
    this.lighting = lighting;

    // Movement parameters
    this.walkSpeed = 5.0;
    this.sprintSpeed = 8.5;
    this.crouchSpeed = 2.5;
    this.currentSpeed = this.walkSpeed;

    this.playerHeight = 1.7;
    this.crouchHeight = 1.0;
    this.targetHeight = this.playerHeight;

    // Position & Velocity
    this.position = new THREE.Vector3(0, this.playerHeight, -18); // Start in front dining hall
    this.velocity = new THREE.Vector3();
    this.worldBounds = { minX: -29.3, maxX: 29.3, minZ: -29.3, maxZ: 34.3 };
    this.camera.position.copy(this.position);

    // Orientation (Euler pitch & yaw)
    this.pitch = 0;
    this.yaw = 0;

    // Vitals: Health, Stamina, Flashlight Battery
    this.health = 100;
    this.maxHealth = 100;
    this.stamina = 100;
    this.maxStamina = 100;
    this.battery = 100;
    this.maxBattery = 100;
    this.isDead = false;

    // Head bobbing & footsteps
    this.bobTimer = 0;
    this.footstepTimer = 0;
    this.isMoving = false;
    this.isSprinting = false;
    this.isCrouching = false;

    // Raycaster for interactions
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 3.5;
    this.raycastCenter = new THREE.Vector2(0, 0);
    this.focusedObject = null;
    this.raycastTimer = 0;
    this.lastPromptText = '';
    this.colliderBounds = (this.colliders || []).map((object) => ({
      object,
      box: new THREE.Box3().setFromObject(object)
    }));
    this.moveDir = new THREE.Vector3();
    this.nextPosition = new THREE.Vector3();
    this.collisionPoint = new THREE.Vector3();
    this.lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');

    // Inventory: 4 slots
    this.inventory = {
      hasMop: false,
      hasKeycard: false,
      hasSpatula: true,
      hasOil: false,
      hasShutterKey: false,
      mysteryMeatCount: 0,
      sodaCount: 0,
      batteryCount: 0
    };
    this.activeSlot = 'flashlight'; // 'flashlight', 'mop', 'spatula', 'oil'

    // Input state
    this.keys = {};
    this.isLocked = false;

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
      if (!this.domElement || !this.domElement.isConnected || this.domElement.ownerDocument !== document) return;

      this.pointerLockRequested = true;
      try {
        const promise = this.domElement.requestPointerLock?.();
        if (promise && promise.catch) {
          promise.catch(() => {
            this.pointerLockRequested = false;
          });
        }
      } catch (err) {
        this.pointerLockRequested = false;
      }
    };

    const startGame = () => {
      if (this.isDead || this.questManager?.gameWon) return;
      this.isStarted = true;
      this.isLocked = true;

      if (blocker) {
        blocker.style.display = 'none';
      }

      if (this.audio) {
        try {
          this.audio.init();
          this.audio.resume();
        } catch (e) {}
      }

    };

    if (startBtn) {
      startBtn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        startGame();
      };
      startBtn.onpointerdown = (e) => {
        e.stopPropagation();
        startGame();
      };
    }

    if (blocker) {
      blocker.onclick = (e) => {
        e.stopPropagation();
        startGame();
      };
      blocker.onpointerdown = (e) => {
        e.stopPropagation();
        startGame();
      };
      blocker.ontouchstart = (e) => {
        e.stopPropagation();
        startGame();
      };
    }

    window.addEventListener('click', (event) => {
      if (!this.isStarted) {
        startGame();
      } else if (event.target === this.domElement && !document.pointerLockElement) {
        requestPointerLock();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (!this.isStarted) {
        startGame();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      const hasLock = document.pointerLockElement === this.domElement;
      if (hasLock) {
        this.isLocked = true;
        this.pointerLockRequested = false;
      } else if (this.isStarted) {
        this.pointerLockRequested = false;
      }
    });

    // Mouse look
    let lastMouseX = window.innerWidth / 2;
    let lastMouseY = window.innerHeight / 2;

    window.addEventListener('mousemove', (e) => {
      if (!this.isStarted) return;

      const sensitivity = 0.0025;
      let dx = 0;
      let dy = 0;

      if (document.pointerLockElement === this.domElement) {
        dx = e.movementX || 0;
        dy = e.movementY || 0;
      } else if (this.isLocked) {
        dx = e.movementX !== undefined && e.movementX !== 0 ? e.movementX : (e.clientX - lastMouseX);
        dy = e.movementY !== undefined && e.movementY !== 0 ? e.movementY : (e.clientY - lastMouseY);
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
      }

      if (dx !== 0 || dy !== 0) {
        this.yaw -= dx * sensitivity;
        this.pitch -= dy * sensitivity;

        // Clamp vertical pitch (-85 to +85 deg)
        this.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.pitch));

        this.lookEuler.x = this.pitch;
        this.lookEuler.y = this.yaw;
        this.camera.quaternion.setFromEuler(this.lookEuler);
      }
    });

    // Keyboard controls
    window.addEventListener('keydown', (e) => {
      if (!this.isStarted && blocker && blocker.style.display !== 'none') {
        startGame();
      }
      if (this.isStarted && !this.isLocked) return;

      this.keys[e.code] = true;

      // Flashlight Toggle (F)
      if (e.code === 'KeyF') {
        if (this.lighting && this.battery > 0) {
          const isOn = this.lighting.toggleFlashlight();
          if (this.audio) this.audio.playFlashlightClick();
        }
      }

      // Slot keys 1, 2, 3, 4
      if (e.code === 'Digit1') this.selectSlot('flashlight');
      if (e.code === 'Digit2' && this.inventory.hasMop) this.selectSlot('mop');
      if (e.code === 'Digit3' && this.inventory.hasSpatula) this.selectSlot('spatula');
      if (e.code === 'Digit4' && this.inventory.hasOil) this.selectSlot('oil');

      // Interact Key (E)
      if (e.code === 'KeyE') {
        this.interact();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    // Mouse wheel slot selection
    window.addEventListener('wheel', (e) => {
      if (!this.isStarted || !this.isLocked) return;
      const slots = ['flashlight'];
      if (this.inventory.hasMop) slots.push('mop');
      if (this.inventory.hasSpatula) slots.push('spatula');
      if (this.inventory.hasOil) slots.push('oil');

      let curIdx = slots.indexOf(this.activeSlot);
      if (e.deltaY > 0) {
        curIdx = (curIdx + 1) % slots.length;
      } else {
        curIdx = (curIdx - 1 + slots.length) % slots.length;
      }
      this.selectSlot(slots[curIdx]);
    });

    // Mouse click to use item / attack
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.isLocked && this.isStarted) {
        if (this.justStarted) {
          this.justStarted = false;
          return;
        }
        this.useItem();
      }
    });
  }

  selectSlot(slotName) {
    if (this.activeSlot === slotName) return;
    this.activeSlot = slotName;
    if (this.viewmodel) {
      this.viewmodel.setItem(slotName);
    }
    // Update HUD highlight
    const slots = ['slot-flashlight', 'slot-mop', 'slot-spatula', 'slot-oil'];
    slots.forEach(s => {
      const el = document.getElementById(s);
      if (el) el.classList.remove('active');
    });
    const activeEl = document.getElementById(`slot-${slotName}`);
    if (activeEl) activeEl.classList.add('active');
  }

  useItem() {
    if (!this.viewmodel || this.isDead) return;
    this.viewmodel.triggerAction((item) => {
      if (item === 'mop') {
        // Clean grease spill if aimed
        if (this.questManager) {
          this.questManager.handleMopAction(this.camera.position);
        }
        // Squash hatchlings near feet
        if (this.questManager && this.questManager.hatchlings) {
          this.questManager.hatchlings.forEach(h => {
            if (!h.isDead && this.position.distanceTo(h.mesh.position) < 2.5) {
              h.takeDamage(30);
            }
          });
        }
      } else if (item === 'spatula') {
        // Melee cleaver slice
        if (this.monster) {
          const dist = this.camera.position.distanceTo(this.monster.mesh.position);
          if (dist < 3.2) {
            this.monster.stun(2.5);
            if (this.audio) this.audio.playMonsterHit();
          }
        }
        if (this.questManager && this.questManager.colonel) {
          const cDist = this.camera.position.distanceTo(this.questManager.colonel.mesh.position);
          if (cDist < 3.2) {
            this.questManager.colonel.stun(2.0);
            if (this.audio) this.audio.playMonsterHit();
          }
        }
        if (this.questManager && this.questManager.hatchlings) {
          this.questManager.hatchlings.forEach(h => {
            if (!h.isDead && this.position.distanceTo(h.mesh.position) < 3.0) {
              h.takeDamage(35);
            }
          });
        }
      } else if (item === 'oil') {
        // Splash boiling oil
        if (this.audio) this.audio.playHotOilSplash();
        this.showNotification('SPLASHED SCALDING BOILING GREASE!');
        if (this.monster && this.position.distanceTo(this.monster.mesh.position) < 6.0) {
          this.monster.stun(4.5);
          if (this.audio) this.audio.playMonsterScreech();
        }
        if (this.questManager && this.questManager.colonel && this.position.distanceTo(this.questManager.colonel.mesh.position) < 6.0) {
          this.questManager.colonel.stun(4.0);
          if (this.audio) this.audio.playMonsterScreech();
        }
        if (this.questManager && this.questManager.hatchlings) {
          this.questManager.hatchlings.forEach(h => {
            if (!h.isDead && this.position.distanceTo(h.mesh.position) < 5.0) {
              h.takeDamage(50);
            }
          });
        }
      }
    });
  }

  takeDamage(amount) {
    if (this.isDead) return;
    this.health = Math.max(0, this.health - amount);
    if (this.audio) {
      this.audio.playPlayerHurt();
      this.audio.playHeartbeat(1.8);
      if (amount >= 20) this.audio.playJumpscareStinger();
    }

    // Trigger horror jumpscare glitch flash
    const glitch = document.getElementById('damage-glitch-face');
    if (glitch) {
      glitch.classList.add('flash');
      setTimeout(() => glitch.classList.remove('flash'), 300);
    }

    // Trigger red screen damage vignette
    const vignette = document.getElementById('damage-vignette');
    if (vignette) {
      vignette.classList.add('damaged');
      setTimeout(() => vignette.classList.remove('damaged'), 450);
    }

    // Update Health bar
    this.updateHealthHUD();

    if (this.health <= 0) {
      this.isDead = true;
      this.isLocked = false;
      if (this.questManager && !this.questManager.gameOver) {
        this.questManager.triggerGameOver();
      } else {
        const jumpscareEl = document.getElementById('jumpscare-overlay');
        if (jumpscareEl) jumpscareEl.style.display = 'flex';
        if (this.audio) this.audio.playJumpscareStinger();
      }
      if (document.exitPointerLock) document.exitPointerLock();
    }
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
    this.updateHealthHUD();
    if (this.audio) this.audio.playSodaDrink();
    this.showNotification(`+ RESTORED ${amount} HP WITH COLA`);
  }

  rechargeBattery(amount) {
    this.battery = Math.min(this.maxBattery, this.battery + amount);
    this.updateBatteryHUD();
    if (this.audio) this.audio.playBatteryRecharge();
    this.showNotification(`+ RECHARGED ${amount}% FLASHLIGHT BATTERY`);
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

  showNotification(text) {
    const el = document.getElementById('loot-notification');
    if (!el) return;
    el.textContent = text;
    el.style.display = 'block';
    clearTimeout(this.lootTimeout);
    this.lootTimeout = setTimeout(() => {
      el.style.display = 'none';
    }, 2800);
  }

  interact() {
    if (this.focusedObject && this.questManager) {
      this.questManager.handleInteraction(this.focusedObject.userData, this.focusedObject);
    }
  }

  update(delta, interactables) {
    if (!this.isStarted || !this.isLocked || this.isDead) return;

    // Low health heartbeat pulsing
    if (this.health < 45) {
      this.heartbeatTimer = (this.heartbeatTimer || 0) + delta;
      const hbInterval = this.health < 25 ? 0.55 : 0.95;
      if (this.heartbeatTimer >= hbInterval) {
        this.heartbeatTimer = 0;
        if (this.audio) this.audio.playHeartbeat(this.health < 25 ? 1.4 : 0.9);
      }
    }

    // Drain flashlight battery when light is ON
    if (this.lighting && this.lighting.flashlightOn) {
      this.battery = Math.max(0, this.battery - delta * 1.5);
      this.updateBatteryHUD();
      if (this.battery <= 0) {
        this.lighting.toggleFlashlight(); // Turn off when dead
        this.showNotification('⚠️ FLASHLIGHT BATTERY DEPLETED! FIND 9V BATTERIES');
      }
    }

    // Calculate movement directly from yaw
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);
    this.moveDir.set(0, 0, 0);

    if (this.keys['KeyW'] || this.keys['ArrowUp']) {
      this.moveDir.x -= sinYaw;
      this.moveDir.z -= cosYaw;
    }
    if (this.keys['KeyS'] || this.keys['ArrowDown']) {
      this.moveDir.x += sinYaw;
      this.moveDir.z += cosYaw;
    }
    if (this.keys['KeyD'] || this.keys['ArrowRight']) {
      this.moveDir.x += cosYaw;
      this.moveDir.z -= sinYaw;
    }
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) {
      this.moveDir.x -= cosYaw;
      this.moveDir.z += sinYaw;
    }

    this.isMoving = this.moveDir.lengthSq() > 0.001;

    // Sprinting & Crouch
    this.isCrouching = this.keys['KeyC'] || this.keys['ControlLeft'];
    this.isSprinting = (this.keys['ShiftLeft'] || this.keys['ShiftRight']) && this.isMoving && !this.isCrouching && this.stamina > 5;

    if (this.isSprinting) {
      this.currentSpeed = this.sprintSpeed;
      this.stamina = Math.max(0, this.stamina - delta * 25);
    } else if (this.isCrouching) {
      this.currentSpeed = this.crouchSpeed;
      this.stamina = Math.min(this.maxStamina, this.stamina + delta * 15);
    } else {
      this.currentSpeed = this.walkSpeed;
      this.stamina = Math.min(this.maxStamina, this.stamina + delta * 20);
    }

    // Smooth crouch height
    this.targetHeight = this.isCrouching ? this.crouchHeight : this.playerHeight;
    this.position.y += (this.targetHeight - this.position.y) * 10 * delta;

    if (this.isMoving) {
      this.moveDir.normalize();
      const moveAmount = this.currentSpeed * delta;
      this.nextPosition.copy(this.position).addScaledVector(this.moveDir, moveAmount);

      // Resolve each axis independently so the player slides along walls
      if (!this.collidesAt(this.nextPosition.x, this.position.z)) {
        this.position.x = this.nextPosition.x;
      }
      if (!this.collidesAt(this.position.x, this.nextPosition.z)) {
        this.position.z = this.nextPosition.z;
      }

      this.position.x = THREE.MathUtils.clamp(this.position.x, this.worldBounds.minX, this.worldBounds.maxX);
      this.position.z = THREE.MathUtils.clamp(this.position.z, this.worldBounds.minZ, this.worldBounds.maxZ);

      // Headbob & Footsteps
      const bobFreq = this.isSprinting ? 12 : 8;
      this.bobTimer += delta * bobFreq;
      this.footstepTimer += delta * (this.isSprinting ? 2.8 : 1.8);

      if (this.footstepTimer >= 1.0) {
        this.footstepTimer = 0;
        if (this.audio) this.audio.playFootstep();
      }
    }

    // Apply headbob to camera
    const bobY = this.isMoving ? Math.sin(this.bobTimer) * (this.isSprinting ? 0.07 : 0.035) : 0;
    const bobRoll = this.isMoving ? Math.cos(this.bobTimer * 0.5) * 0.012 : 0;

    this.camera.position.set(this.position.x, this.position.y + bobY, this.position.z);
    this.lookEuler.set(this.pitch, this.yaw, bobRoll, 'YXZ');
    this.camera.quaternion.setFromEuler(this.lookEuler);

    // Update raycast
    this.raycastTimer -= delta;
    if (this.raycastTimer <= 0) {
      this.raycastTimer = 0.08;
      this.updateRaycast(interactables);
    }

    // Update viewmodel
    if (this.viewmodel) {
      this.viewmodel.update(delta, this.isMoving, this.isSprinting ? 1.6 : 1.0);
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
      while (hit && !hit.userData?.type && hit.parent) {
        hit = hit.parent;
      }

      if (hit && hit.userData && hit.userData.type) {
        const promptText = this.getPromptText(hit.userData);
        this.setPrompt(hit, promptText);
        return;
      }
    }

    this.setPrompt(null, '');
  }

  setPrompt(object, text) {
    const promptEl = document.getElementById('interact-prompt');
    if (this.focusedObject === object && this.lastPromptText === text) return;

    this.focusedObject = object;
    this.lastPromptText = text;
    if (promptEl) {
      promptEl.style.display = text ? 'block' : 'none';
      if (text) promptEl.textContent = text;
    }
  }

  collidesAt(x, z) {
    const playerRadius = 0.5;
    this.collisionPoint.set(x, this.position.y, z);
    const playerBottom = this.position.y - (this.isCrouching ? this.crouchHeight : this.playerHeight);
    const playerTop = this.position.y;

    for (const entry of this.colliderBounds) {
      const object = entry.object;
      if (!object || !object.visible) continue;
      if (entry.box.min.x === Infinity) continue;

      if (
        this.collisionPoint.x >= entry.box.min.x - playerRadius &&
        this.collisionPoint.x <= entry.box.max.x + playerRadius &&
        this.collisionPoint.z >= entry.box.min.z - playerRadius &&
        this.collisionPoint.z <= entry.box.max.z + playerRadius &&
        entry.box.max.y >= playerBottom &&
        entry.box.min.y <= playerTop
      ) return true;
    }
    return false;
  }

  refreshCollider(object) {
    const entry = this.colliderBounds.find((candidate) => candidate.object === object);
    if (entry) entry.box.setFromObject(object);
  }

  getPromptText(data) {
    switch (data.type) {
      case 'punch_clock':
        return data.punched ? 'Shift Active: 03:14 AM' : '[E] Punch In Timecard';
      case 'mop_pickup':
        return this.questManager?.punchedIn ? '[E] Pick up Industrial Mop' : '[E] Pick up Mop (Punch in at registers first)';
      case 'grease_spill':
        return data.cleaned
          ? 'Grease Cleaned'
          : this.questManager?.currentStep === 1 && this.questManager?.punchedIn
            ? '[Left Click with Mop] Clean Toxic Grease'
            : 'Sanitization objective inactive';
      case 'freezer_door':
        if (this.questManager?.currentStep < 2) return 'Finish sanitization first';
        return data.isLocked ? '[E] Swipe Yellow Keycard to Unlock Walk-In Vault' : '[E] Enter Meat Vault';
      case 'meat_pickup':
        return this.questManager?.currentStep === 3 ? '[E] Pick up Mystery Meat Bag' : 'Vault inventory inactive';
      case 'fryer_station':
        if (this.questManager?.currentStep !== 3) return 'Fryer station inactive';
        return data.loadedCount >= (data.maxMeat || 2)
          ? 'Fryer Boiling at 375°F'
          : `[E] Drop Mystery Meat into Fryer (${data.loadedCount || 0}/${data.maxMeat || 2})`;
      case 'breaker':
        if (this.questManager?.currentStep !== 4) return 'Breaker inactive';
        return data.isTripped ? '[E] Flip Circuit Breaker' : 'Breaker Online';
      case 'soda_pickup':
        return '[E] Drink Cola (+35 HP)';
      case 'battery_pickup':
        return '[E] Pick up 9V Battery (+50% Flashlight)';
      case 'oil_pitcher_pickup':
        return this.questManager?.currentStep >= 4 ? '[E] Equip Boiling Oil Pitcher' : 'Oil pitcher locked';
      case 'shutter_key_pickup':
        return this.questManager?.currentStep === 5 ? '[E] Grab Drive-Thru Emergency Key' : 'Colonel key locked';
      case 'drive_thru_window':
        return this.questManager?.currentStep === 6 ? '[E] Unlock Drive-Thru & ESCAPE!' : 'Drive-Thru locked';
      case 'keycard_pickup':
        return this.questManager?.currentStep === 2 ? '[E] Pick up Manager Yellow Keycard' : 'Keycard unavailable';
      default:
        return '[E] Interact';
    }
  }
}
