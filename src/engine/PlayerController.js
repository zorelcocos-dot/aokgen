import * as THREE from 'three';
import { Inventory } from './Inventory.js';
import { TimerRegistry } from './Timers.js';

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

    // Damage gating: one hit resolves per i-frame window no matter how many
    // attackers (monster, colonel, hatchlings) land in the same frame.
    this.invulnTime = 0;
    this.invulnDuration = 0.85;

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

    // Collision bookkeeping.
    // `colliders` is a live array shared with LevelBuilder / DoorSystem.
    // `_bounds` caches one Box3 per object; static boxes are computed once,
    // boxes flagged `userData.dynamicCollider` are refreshed at most once per
    // frame (doors, anything that moves).
    this._bounds = new Map();
    this._boundsFrame = 0;
    this.frameId = 0;
    this.syncColliders();

    this.moveDir = new THREE.Vector3();
    this.nextPosition = new THREE.Vector3();
    this.collisionPoint = new THREE.Vector3();
    this.lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');

    // Single source of truth for carried items.
    this.inventory = new Inventory();
    // The hotbar is a pure view of the inventory: any add/remove/consume
    // repaints it, so a slot can never show a tool the player no longer has.
    this.inventory.onChange = () => this.refreshHotbar();
    this.inventory.addItem('spatula');
    this.activeSlot = 'flashlight';

    /**
     * Set while the player is seated in the car. Looking around, the prompt
     * and the interact key all keep working; movement, sprint, crouch, lean
     * and footsteps are suppressed, so the intro cannot be walked out of.
     */
    this.movementLocked = false;
    /** Optional override for E during scripted sequences (the car intro). */
    this.interactOverride = null;

    // Input
    this.keys = {};
    this.isLocked = false;
    /** True while the pause overlay is up; blocks all gameplay input. */
    this.isPaused = false;
    this.isStarted = false;
    this.pointerLockRequested = false;

    this.timers = new TimerRegistry();
    /** [target, event, handler] triples so dispose() can unbind everything. */
    this._listeners = [];

    this.setupInputs();
  }

  /** Registers a listener and remembers it for dispose(). */
  _on(target, event, handler, options) {
    target.addEventListener(event, handler, options);
    this._listeners.push([target, event, handler, options]);
  }

  dispose() {
    for (const [target, event, handler, options] of this._listeners) {
      target.removeEventListener(event, handler, options);
    }
    this._listeners.length = 0;
    this.timers.clearAll();
  }

  /**
   * Restores the player to their opening state for a restart. Input bindings
   * survive (they are bound once for the lifetime of the page); everything
   * that a run can change is put back.
   */
  reset() {
    this.timers.clearAll();

    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.battery = this.maxBattery;
    this.isDead = false;
    this.invulnTime = 0;

    this.noiseLevel = 0;
    this.noiseRadius = 0;
    this.isHiding = false;
    this.isCrouching = false;
    this.isSprinting = false;
    this.isMoving = false;
    this.screenShakeIntensity = 0;
    this.screenShakeTime = 0;
    this.shakeOffset.set(0, 0, 0);
    this.velocity.set(0, 0, 0);

    this.focusedObject = null;
    this.lastPrompt = '';
    this.raycastTimer = 0;
    this.movementLocked = false;
    this.interactOverride = null;
    this._lastBatteryPct = -1;
    // A restart from the death screen must never leave the pause overlay up.
    this.setPaused(false);
    this.clearHighlight();

    // Inventory back to the starting loadout.
    this.inventory.clear();
    this.inventory.addItem('spatula');
    this.selectSlot('flashlight');
    this.refreshHotbar();

    // Any keys held when the player died must not be stuck down.
    for (const k of Object.keys(this.keys)) this.keys[k] = false;
    this._eDown = false;

    // Clear the transient UI this controller owns.
    for (const id of ['loot-notification', 'interact-prompt']) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
    for (const id of ['damage-vignette', 'damage-glitch-face']) {
      document.getElementById(id)?.classList.remove('damaged', 'flash');
    }

    this.updateHealthHUD();
    this.updateBatteryHUD();
    this.syncColliders();
  }

  /**
   * Shows / hides the pause overlay and freezes input with it.
   *
   * `isPaused` was already checked in three input handlers but nothing ever
   * set it, so it was dead code. It is now the single flag that means "the
   * player is not in control", and update() honours it too.
   */
  setPaused(paused) {
    if (this.isPaused === paused) return;
    this.isPaused = paused;
    const menu = document.getElementById('pause-menu');
    if (menu) menu.classList.toggle('visible', paused);
    if (paused) {
      this.isLocked = false;
      // Never leave a movement key stuck down across a pause.
      for (const k of Object.keys(this.keys)) this.keys[k] = false;
      this.isSprinting = false;
      this.isMoving = false;
    } else {
      this.isLocked = true;
    }
  }

  /** Re-acquires pointer lock. Public so a restart can grab it back. */
  requestLock() {
    if (this.pointerLockRequested || document.pointerLockElement === this.domElement) return;
    if (!this.domElement?.isConnected) return;
    this.pointerLockRequested = true;
    try {
      const p = this.domElement.requestPointerLock?.();
      if (p?.catch) p.catch(() => { this.pointerLockRequested = false; });
    } catch { this.pointerLockRequested = false; }
  }

  setupInputs() {
    const blocker = document.getElementById('blocker');
    const startBtn = document.getElementById('start-btn');
    this.isStarted = false;
    this.isLocked = false;
    this.pointerLockRequested = false;

    const requestPointerLock = () => this.requestLock();

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

    // Pause menu: clicking anywhere on it (or the button) resumes.
    const pauseMenu = document.getElementById('pause-menu');
    const resumeBtn = document.getElementById('resume-btn');
    const resume = (e) => {
      e?.stopPropagation();
      e?.preventDefault();
      this.setPaused(false);
      requestPointerLock();
    };
    if (resumeBtn) resumeBtn.onclick = resume;
    if (pauseMenu) pauseMenu.onclick = resume;

    // The pause screen carries its own sensitivity slider so the setting can
    // be corrected mid-run instead of only from the title screen.
    const pauseSens = document.getElementById('pause-sens');
    if (pauseSens) {
      pauseSens.value = localStorage.getItem('sensitivity') || '0.0025';
      pauseSens.addEventListener('input', (e) => {
        e.stopPropagation();
        localStorage.setItem('sensitivity', e.target.value);
        const menuSlider = document.getElementById('sens-slider');
        if (menuSlider) menuSlider.value = e.target.value;
      });
      // Dragging the slider must not count as "click to resume".
      pauseSens.addEventListener('click', (e) => e.stopPropagation());
      pauseSens.addEventListener('pointerdown', (e) => e.stopPropagation());
    }

    this._on(window, 'click', (e) => {
      if (!this.isStarted) startGame();
      else if (e.target === this.domElement && !document.pointerLockElement) requestPointerLock();
    });

    // Losing pointer lock is a real event, not something to paper over. The
    // old handler kept `isLocked = true` after the lock was gone, so the game
    // carried on simulating while mouse-look silently did nothing - the
    // player was left walking blind with no indication anything had changed.
    // Now it surfaces as an explicit pause the player can see and dismiss.
    this._on(document, 'pointerlockchange', () => {
      const hasLock = document.pointerLockElement === this.domElement;
      if (hasLock) {
        this.isLocked = true;
        this.pointerLockRequested = false;
        this.setPaused(false);
      } else if (this.isStarted) {
        this.pointerLockRequested = false;
        // A modal (document / CCTV) legitimately releases the lock; that is
        // its own UI and must not also raise the pause screen.
        const modalOpen = this.questManager?._docOpen === true;
        const ended = this.isDead || this.questManager?.gameOver || this.questManager?.gameWon;
        if (!modalOpen && !ended) this.setPaused(true);
      }
    });

    // Mouse look
    this._on(window, 'mousemove', (e) => {
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

    // Keyboard - single keydown listener owns start, movement flags and actions.
    this._on(window, 'keydown', (e) => {
      if (!this.isStarted) { startGame(); return; }
      // While paused, the only key that does anything is the one that resumes.
      if (this.isPaused) {
        if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space') resume(e);
        return;
      }
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

      // Slots - driven by the same availableSlots() list as the scroll wheel.
      const slotKeys = { Digit1: 'flashlight', Digit2: 'mop', Digit3: 'spatula', Digit4: 'oil' };
      const wanted = slotKeys[e.code];
      if (wanted && this.availableSlots().includes(wanted)) this.selectSlot(wanted);

      // Hiding spot
      if (e.code === 'KeyH' && this.nearHidingSpot) {
        this.toggleHiding();
      }

      // Inventory read (R)
      if (e.code === 'KeyR' && this.focusedObject?.userData?.type === 'document') {
        this.interact();
      }
    });

    this._on(window, 'keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'KeyE') this._eDown = false;
      if (e.code === 'KeyQ') this.isLeaningLeft = false;
      if (e.code === 'KeyE' && e.ctrlKey) {} // ignore
    });

    this._on(window, 'wheel', (e) => {
      if (!this.isStarted || this.isDead || this.isPaused) return;
      const slots = this.availableSlots();
      if (slots.length < 2) return;
      let curIdx = slots.indexOf(this.activeSlot);
      if (e.deltaY > 0) curIdx = (curIdx + 1) % slots.length;
      else curIdx = (curIdx - 1 + slots.length) % slots.length;
      this.selectSlot(slots[curIdx]);
    });

    this._on(window, 'mousedown', (e) => {
      if (e.button === 0 && this.isLocked && this.isStarted && !this.isDead && !this.isPaused) {
        // Poll focus flashlight (right click is focus)
        this.useItem();
      }
      if (e.button === 2 && this.isLocked && this.isStarted && !this.isDead) {
        // Right click = focused beam (narrower cone, brighter, drains faster)
        this.isFocusBeam = true;
        this.lighting?.setFocusBeam(true);
      }
    });

    this._on(window, 'mouseup', (e) => {
      if (e.button === 2) {
        this.isFocusBeam = false;
        this.lighting?.setFocusBeam(false);
      }
    });

    // Prevent context menu on right click stun
    if (this.domElement) this._on(this.domElement, 'contextmenu', e => e.preventDefault());
  }

  /** Slots the player can actually cycle to right now. */
  availableSlots() {
    const slots = ['flashlight'];
    if (this.inventory.hasItem('mop')) slots.push('mop');
    if (this.inventory.hasItem('spatula')) slots.push('spatula');
    if (this.inventory.hasItem('oil')) slots.push('oil');
    return slots;
  }

  /** Mirrors inventory state onto the hotbar DOM. Called on inventory change. */
  refreshHotbar() {
    const available = this.availableSlots();
    for (const name of ['flashlight', 'mop', 'spatula', 'oil']) {
      const el = document.getElementById(`slot-${name}`);
      if (!el) continue;
      const has = available.includes(name);
      el.classList.toggle('locked', !has);
    }
    if (!available.includes(this.activeSlot)) this.selectSlot('flashlight');
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

  /** True when an attacker is allowed to land a hit right now. */
  canBeDamaged() {
    return !this.isDead && !this.isHiding && this.invulnTime <= 0 &&
           !this.questManager?.gameOver && !this.questManager?.gameWon;
  }

  takeDamage(amount) {
    if (!this.canBeDamaged()) return false;
    this.invulnTime = this.invulnDuration;
    this.health = Math.max(0, this.health - amount);
    if (this.audio) {
      this.audio.playPlayerHurt();
      this.audio.playHeartbeat(1.6);
      if (amount >= 28) this.audio.playJumpscareStinger(0.55);
    }
    const glitch = document.getElementById('damage-glitch-face');
    if (glitch) {
      glitch.classList.add('flash');
      this.timers.setTimeout(() => glitch.classList.remove('flash'), 320);
    }
    const vign = document.getElementById('damage-vignette');
    if (vign) {
      vign.classList.add('damaged');
      this.timers.setTimeout(() => vign.classList.remove('damaged'), 460);
    }
    this.updateHealthHUD();
    this.addScreenShake(0.35, 0.5);
    const died = this.health <= 0;
    if (died) {
      this.isDead = true;
      this.isLocked = false;
      if (this.questManager && !this.questManager.gameOver) this.questManager.triggerGameOver();
      else {
        document.getElementById('jumpscare-overlay').style.display = 'flex';
        if (this.audio) this.audio.playJumpscareStinger(0.9);
      }
      if (document.exitPointerLock) document.exitPointerLock();
    }
    return true;
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
    this.timers.clearTimeout(this.lootTimeout);
    this.lootTimeout = this.timers.setTimeout(() => { el.style.display = 'none'; }, duration);
  }

  /**
   * Single entry point for the E key. Everything world-facing is routed
   * through QuestManager.handleInteraction so there is exactly one place that
   * decides what an interaction means - no double handling of doors.
   */
  interact() {
    if (this.isDead) return;
    if (this.interactOverride) { this.interactOverride(); return; }
    if (!this.focusedObject) return;
    const data = this.focusedObject.userData;
    if (!data) return;

    if (data.type === 'hiding_spot') {
      this.toggleHiding();
      return;
    }

    this.questManager?.handleInteraction(data, this.focusedObject);
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
      // Breaking line of sight by hiding drops every pursuer into a search
      // instead of an instant reset. Routed through setState() so the state
      // graph stays the single authority - a raw assignment here used to skip
      // the transition's entry logic.
      for (const hunter of [this.monster, this.questManager?.colonel]) {
        if (hunter?.state === 'CHASE') {
          hunter.searchTime = 0;
          hunter.setState('SEARCH');
        }
      }
    }
  }

  update(delta, interactables) {
    if (!this.isStarted || this.isDead) return;

    // One tick per frame: invalidates the cached collision boxes of moving
    // objects and counts down the post-hit invulnerability window.
    this.frameId++;
    if (this.invulnTime > 0) this.invulnTime = Math.max(0, this.invulnTime - delta);

    if (!this.isLocked) {
      // Paused / unlocked: only let the noise the player already made decay.
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
      this.lighting.setBatteryLevel(this.battery);
      // The bar only moves in whole percent, so only touch the DOM then.
      const pct = Math.round(this.battery);
      if (pct !== this._lastBatteryPct) {
        this._lastBatteryPct = pct;
        this.updateBatteryHUD();
      }
      if (this.battery <= 0) {
        this.lighting.toggleFlashlight();
        this.showNotification('BATTERY DEAD - FIND 9V PACKS', 3000);
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

    if (this.movementLocked) this.moveDir.set(0, 0, 0);
    this.isMoving = this.moveDir.lengthSq() > 0.001;

    // Sprint / crouch
    this.isCrouching = !this.movementLocked &&
      (this.keys['KeyC'] || this.keys['ControlLeft'] || this.keys['ControlRight']);
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

    // Height lerp - the intro owns targetHeight while seated.
    if (!this.movementLocked) this.targetHeight = this.isCrouching ? this.crouchHeight : this.playerHeight;
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

    // Lean effect - offset along the camera's own right vector, so peeking
    // works the same whichever way the player is facing.
    if (this.isLeaningLeft && !this.movementLocked) {
      this.camera.position.x -= Math.cos(this.yaw) * 0.28;
      this.camera.position.z += Math.sin(this.yaw) * 0.28;
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
      // Walk up to the nearest ancestor that declares a type, stopping before
      // the Scene itself (a bare mesh must not resolve to the whole world).
      while (hit && !hit.userData?.type && hit.parent && !hit.parent.isScene) hit = hit.parent;
      if (hit?.userData?.type) {
        const prompt = this.getPromptText(hit.userData, hit);
        this.setPrompt(hit, prompt);
        return;
      }
    }
    this.setPrompt(null, '');
  }

  /** Removes the highlight from whatever object currently has it. */
  clearHighlight() {
    const prev = this._highlighted;
    if (prev?.material?.emissive && prev.userData?._origEmissive) {
      prev.material.emissive.copy(prev.userData._origEmissive);
      delete prev.userData._origEmissive;
    }
    this._highlighted = null;
  }

  setPrompt(object, text) {
    if (this.focusedObject === object && this.lastPrompt === text) return;

    // Restore the OLD object before we lose the reference to it.
    if (this._highlighted !== object) this.clearHighlight();

    this.focusedObject = object;
    this.lastPrompt = text;

    const promptEl = document.getElementById('interact-prompt');
    if (!promptEl) return;
    const keyEl = document.getElementById('interact-key');
    const titleEl = document.getElementById('interact-title');

    if (text) {
      promptEl.style.display = 'flex';
      // Parse "[KEY] Title" e.g. "[E] Open door"
      const match = text.match(/^\[(.+?)\]\s*(.*)/);
      if (match) {
        if (keyEl) { keyEl.textContent = match[1]; keyEl.style.display = ''; }
        if (titleEl) titleEl.textContent = match[2];
      } else {
        // No key = informational text only, hide the key chip.
        if (keyEl) keyEl.style.display = 'none';
        if (titleEl) titleEl.textContent = text;
      }
      if (object?.material?.emissive && !object.userData._origEmissive) {
        object.userData._origEmissive = object.material.emissive.clone();
        object.material.emissive.setHex(0x222200);
        this._highlighted = object;
      }
    } else {
      promptEl.style.display = 'none';
    }
  }

  /**
   * Rebuilds the Box3 cache from the live `colliders` array.
   * Boxes already cached are reused, so this is cheap enough to call whenever
   * the world adds or removes a collider.
   */
  syncColliders() {
    const next = new Map();
    for (const obj of this.colliders) {
      if (!obj) continue;
      const existing = this._bounds.get(obj);
      if (existing) {
        next.set(obj, existing);
      } else {
        obj.updateWorldMatrix(true, true);
        next.set(obj, { box: new THREE.Box3().setFromObject(obj), frame: -1 });
      }
    }
    this._bounds = next;
  }

  /**
   * Forces one object's cached collision box to be rebuilt right now.
   *
   * This used to only set `frame = -1`, which is the "recompute me" flag read
   * by the per-frame refresh - but that refresh is gated on
   * `userData.dynamicCollider`. Anything that moved without carrying that flag
   * (the secret wall panel, a prop nudged by a script) kept its stale box
   * forever, so it stayed solid in the place it used to be. Recomputing here
   * makes the call mean what its name says regardless of the flag.
   */
  refreshCollider(object) {
    const entry = this._bounds.get(object);
    if (!entry) return;
    entry.frame = -1;
    object.updateWorldMatrix(true, false);
    entry.box.setFromObject(object);
  }

  collidesAt(x, z) {
    // Collision "radius" is the half-width of an axis-aligned square around
    // the player, so the body is 2*radius across. At the old 0.5 that made a
    // 1.0m-wide player, which is wider than a real doorway: the level's 1.2m
    // doorways left a 0.2m slot the player had to thread perfectly, and any
    // approach that was not dead-centre simply stopped against thin air.
    // 0.3 gives a 0.6m body - human-sized, and enough clearance that doorways
    // and the gaps between props are actually walkable.
    const radius = this.isCrouching ? 0.26 : 0.3;
    this.collisionPoint.set(x, this.position.y, z);
    const bottom = this.position.y - (this.isCrouching ? this.crouchHeight : this.playerHeight);
    const top = this.position.y;
    const doorSystem = this.questManager?.doorSystem;

    for (const obj of this.colliders) {
      if (!obj || obj.visible === false) continue;
      const entry = this._bounds.get(obj);
      if (!entry) continue;

      // A door that has swung/slid far enough is simply not there any more.
      if (obj.userData?.doorName) {
        const door = doorSystem?.getDoor(obj.userData.doorName);
        if (door?.isPassable()) continue;
      }

      // Moving colliders get their box rebuilt at most once per frame.
      if (obj.userData?.dynamicCollider && entry.frame !== this.frameId) {
        entry.frame = this.frameId;
        obj.updateWorldMatrix(true, false);
        entry.box.setFromObject(obj);
      }

      const box = entry.box;
      if (!isFinite(box.min.x)) continue;

      if (
        this.collisionPoint.x >= box.min.x - radius &&
        this.collisionPoint.x <= box.max.x + radius &&
        this.collisionPoint.z >= box.min.z - radius &&
        this.collisionPoint.z <= box.max.z + radius &&
        box.max.y >= bottom &&
        box.min.y <= top
      ) return true;
    }
    return false;
  }

  /** Verb + object prompt for whatever is currently under the crosshair. */
  getPromptText(data, mesh) {
    switch (data.type) {
      case 'punch_clock': return data.punched ? 'Timecard punched - 03:14 AM' : '[E] Punch timecard';
      case 'mop_pickup': return '[E] Pick up mop';
      case 'grease_spill': return data.cleaned ? 'Cleaned' : '[CLICK] Mop grease';
      // The door itself is the authority on its own prompt (lock state, key
      // in inventory, power requirement, open vs closed).
      case 'door':
        return this.questManager?.doorSystem?.getPrompt(data.doorName, this.inventory) || '[E] Open';
      case 'meat_pickup': return '[E] Collect meat bag';
      case 'fryer_station': {
        const loaded = data.loadedCount || 0;
        const max = data.maxMeat || 2;
        if (loaded >= max) return 'Fryers overloaded...';
        return this.inventory.countItem('meat') > 0 ? `[E] Load meat (${loaded}/${max})` : 'Needs meat bags';
      }
      case 'breaker': return '[E] Reset breaker';
      case 'soda_pickup': return '[E] Drink cola';
      case 'battery_pickup': return '[E] Take battery';
      case 'oil_pitcher_pickup': return '[E] Take boiling oil';
      case 'shutter_key_pickup': return '[E] Take drive-thru key';
      case 'keycard_pickup': return '[E] Take yellow keycard';
      case 'office_key_pickup': return '[E] Take office key';
      case 'car_key_pickup': return '[E] Take car key';
      case 'fuel_can_pickup': return '[E] Take diesel fuel can';
      case 'document': return `[E] Read ${data.docTitle || 'note'}`;
      case 'cctv_monitor': return '[E] Watch CCTV';
      case 'generator': {
        if (data.fueled) return 'Generator running';
        const needs = Math.max(0, data.requiredFuel - (data.fuelCount || 0));
        return this.inventory.countItem('fuel') > 0
          ? `[E] Refuel generator (${needs} left)`
          : `Needs diesel (${needs} more can${needs === 1 ? '' : 's'})`;
      }
      case 'car':
        return this.inventory.hasItem('car_key') ? '[E] Start the car' : '[E] Inspect car';
      case 'car_exit': return '[E] Exit car';
      case 'hiding_spot': return this.isHiding ? '[E] Leave' : '[E] Hide [H]';
      case 'phone': return '[E] Use phone';
      case 'safe': return data.isOpen ? 'Empty safe' : '[E] Inspect safe';
      case 'secret_wall': return '[E] Inspect wall';
      default: return data.prompt || '[E] Interact';
    }
  }
}
