import * as THREE from 'three';

/**
 * DoorSystem - the ONE system that owns every door in the restaurant.
 *
 * Every door (office, storage, janitor, generator, freezer vault, drive-thru
 * shutter, front entrance) is a DoorInstance. Nothing outside this file is
 * allowed to move a door by touching `position` or `rotation` directly.
 *
 * A door is always in exactly one state:
 *   locked -> closed -> opening -> open -> closing -> closed
 * `locked` is a flag on top of `closed` rather than a separate pose, so the
 * mesh transform is always driven by a single 0..1 `progress` value.
 *
 * Two kinematics are supported:
 *   'swing' - rotates the leaf around a hinge group (interior doors)
 *   'slide' - translates the leaf along its local axis (freezer, shutter)
 *
 * All timed behaviour (rattle, anomaly tug, auto-close) is driven from
 * update(delta). There are no setTimeout / requestAnimationFrame loops, so a
 * restart cannot leave an orphaned animation running.
 */

export const DOOR_STATE = {
  CLOSED: 'closed',
  OPENING: 'opening',
  OPEN: 'open',
  CLOSING: 'closing'
};

export class DoorInstance {
  constructor(options = {}) {
    this.name = options.name || 'door';
    this.mesh = options.mesh;           // the moving leaf
    this.hingeGroup = options.hingeGroup;
    this.kinematics = options.kinematics || 'swing';

    // Lock / requirements
    this.isLocked = options.locked ?? false;
    this.keyId = options.keyId || null;
    this.consumeKey = options.consumeKey ?? false;
    this.requiresPower = options.requiresPower ?? false;
    this.lockedMessage = options.lockedMessage || 'Locked.';
    this.unlockMessage = options.unlockMessage || 'Unlocked.';
    this.openMessage = options.openMessage || null;

    // Pose
    this.openAngle = options.openAngle ?? Math.PI / 1.8;
    // slideAxis accepts 'x'|'y'|'z' or a Vector3 direction (local to the hinge group).
    this.slideAxis = normalizeAxis(options.slideAxis);
    this.slideDistance = options.slideDistance ?? 1.8;
    this.restPosition = this.mesh ? this.mesh.position.clone() : new THREE.Vector3();
    this.progress = options.isOpen ? 1 : 0;   // 0 = closed, 1 = fully open
    this.state = options.isOpen ? DOOR_STATE.OPEN : DOOR_STATE.CLOSED;

    // Speeds are in progress-units per second. `slideSpeed` is a convenience
    // alias that sets both directions for sliding doors.
    this.openSpeed = options.openSpeed ?? options.slideSpeed ?? 1.6;
    this.closeSpeed = options.closeSpeed ?? options.slideSpeed ?? 2.0;

    // HUD labels
    this.openLabel = options.openLabel || 'Open';
    this.closeLabel = options.closeLabel || 'Close';
    this.lockedPrompt = options.lockedPrompt || 'Locked';
    this.interactive = options.interactive !== false;

    // Auto close
    this.autoClose = options.autoClose ?? false;
    this.autoCloseDelay = options.autoCloseDelay ?? 6;
    this.autoCloseTimer = 0;

    // One-way doors never re-close (freezer vault, shutter)
    this.oneWay = options.oneWay ?? false;

    // Horror flavour
    this.anomaly = options.anomaly || false;
    this.anomalyTimer = 3 + Math.random() * 6;
    this.anomalyOffset = 0;
    this.anomalyPhase = 0;

    // Rattle (failed unlock feedback) - time-driven, cancellable
    this.rattleTime = 0;

    // Callbacks wired by DoorSystem
    this.onSound = null;
    this.onAnomaly = null;

    this.applyPose();
  }

  get isOpen() {
    return this.state === DOOR_STATE.OPEN || this.state === DOOR_STATE.OPENING;
  }

  /** True when the gap is wide enough for the player/monster to walk through. */
  isPassable() {
    return this.progress > 0.55;
  }

  /**
   * Single entry point for player interaction.
   * Returns { success, message, unlocked?, opened?, locked? }.
   */
  tryOpen(inventory, lighting) {
    if (this.isLocked) {
      if (this.requiresPower && lighting && !lighting.powerActive) {
        this.rattleTime = 0.45;
        this.playSound('locked');
        return { success: false, locked: true, message: 'No power. Generator is offline.' };
      }
      const hasKey = this.keyId && inventory?.hasItem?.(this.keyId);
      if (!hasKey) {
        this.rattleTime = 0.45;
        this.playSound('locked');
        return { success: false, locked: true, message: this.lockedMessage };
      }
      this.isLocked = false;
      if (this.consumeKey) inventory.removeItem(this.keyId);
      this.playSound('unlock');
      this.setOpen(true);
      return { success: true, unlocked: true, opened: true, message: this.unlockMessage };
    }

    if (this.oneWay && this.isOpen) {
      return { success: true, opened: true, message: '' };
    }

    const wantOpen = !this.isOpen;
    this.setOpen(wantOpen);
    return {
      success: true,
      opened: wantOpen,
      message: wantOpen ? (this.openMessage || '') : ''
    };
  }

  setOpen(open, silent = false) {
    if (open) {
      if (this.state === DOOR_STATE.OPEN || this.state === DOOR_STATE.OPENING) return;
      this.state = DOOR_STATE.OPENING;
      this.autoCloseTimer = this.autoCloseDelay;
      if (!silent) this.playSound('open');
    } else {
      if (this.oneWay) return;
      if (this.state === DOOR_STATE.CLOSED || this.state === DOOR_STATE.CLOSING) return;
      this.state = DOOR_STATE.CLOSING;
      if (!silent) this.playSound('close');
    }
    this.rattleTime = 0;
  }

  forceOpen(silent = false) {
    this.isLocked = false;
    this.setOpen(true, silent);
  }

  forceClose(silent = false) {
    const wasOneWay = this.oneWay;
    this.oneWay = false;
    this.setOpen(false, silent);
    this.oneWay = wasOneWay;
  }

  playSound(type) {
    if (this.onSound && this.mesh) this.onSound(type, this.mesh.getWorldPosition(_tmpVec));
  }

  /** Writes `progress` (+ anomaly/rattle wobble) onto the actual transform. */
  applyPose() {
    if (!this.mesh) return;
    const wobble = this.anomalyOffset + (this.rattleTime > 0 ? Math.sin(this.rattleTime * 90) * 0.06 : 0);

    if (this.kinematics === 'slide') {
      const d = this.progress * this.slideDistance + (this.progress < 0.02 ? wobble * 0.25 : 0);
      this.mesh.position.copy(this.restPosition).addScaledVector(this.slideAxis, d);
    } else {
      this.mesh.rotation.y = this.progress * this.openAngle + wobble;
    }
  }

  /** Returns true when the transform moved this frame (collider needs refresh). */
  update(delta) {
    const prev = this.progress;
    const prevWobble = this.anomalyOffset + this.rattleTime;

    if (this.state === DOOR_STATE.OPENING) {
      this.progress = Math.min(1, this.progress + delta * this.openSpeed);
      if (this.progress >= 1) this.state = DOOR_STATE.OPEN;
    } else if (this.state === DOOR_STATE.CLOSING) {
      this.progress = Math.max(0, this.progress - delta * this.closeSpeed);
      if (this.progress <= 0) this.state = DOOR_STATE.CLOSED;
    }

    if (this.rattleTime > 0) this.rattleTime = Math.max(0, this.rattleTime - delta);

    if (this.autoClose && this.state === DOOR_STATE.OPEN) {
      this.autoCloseTimer -= delta;
      if (this.autoCloseTimer <= 0) this.setOpen(false);
    }

    // Anomaly: the door tugs very slightly against its frame, then settles.
    if (this.anomaly && this.state === DOOR_STATE.CLOSED) {
      this.anomalyTimer -= delta;
      if (this.anomalyTimer <= 0) {
        this.anomalyTimer = 8 + Math.random() * 14;
        this.anomalyPhase = 0.9;
        if (this.onAnomaly) this.onAnomaly(this);
      }
      if (this.anomalyPhase > 0) {
        this.anomalyPhase = Math.max(0, this.anomalyPhase - delta);
        this.anomalyOffset = Math.sin((0.9 - this.anomalyPhase) * Math.PI / 0.9) * 0.06;
      } else if (this.anomalyOffset !== 0) {
        this.anomalyOffset = 0;
      }
    } else if (this.anomalyOffset !== 0) {
      this.anomalyOffset = 0;
      this.anomalyPhase = 0;
    }

    const moved = Math.abs(prev - this.progress) > 1e-4 ||
                  Math.abs(prevWobble - (this.anomalyOffset + this.rattleTime)) > 1e-4;
    if (moved) this.applyPose();
    return moved;
  }

  /** Restores the door to its authored starting state (used by restart). */
  reset(options) {
    this.isLocked = options.locked ?? false;
    this.progress = 0;
    this.state = DOOR_STATE.CLOSED;
    this.autoCloseTimer = 0;
    this.rattleTime = 0;
    this.anomalyOffset = 0;
    this.anomalyPhase = 0;
    this.anomalyTimer = 3 + Math.random() * 6;
    this.applyPose();
  }
}

const _tmpVec = new THREE.Vector3();

export class DoorSystem {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.doors = new Map();
    /** Authored options kept so reset() can restore exact starting state. */
    this._authored = new Map();
    /** Meshes that participate in collision (all door leaves). */
    this.colliders = [];
  }

  createDoor(options) {
    const kinematics = options.kinematics || 'swing';
    const width = options.width ?? 0.12;
    const height = options.height ?? 2.3;
    const depth = options.depth ?? 1.0;

    const hingeGroup = new THREE.Group();
    hingeGroup.position.set(options.x, options.y ?? 1.15, options.z);
    hingeGroup.rotation.y = options.rotation || 0;

    const doorMat = makeDoorMaterial(options);
    const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), doorMat);
    doorMesh.castShadow = true;
    doorMesh.receiveShadow = true;

    if (kinematics === 'swing') {
      // Offset the leaf so the hinge group's origin is the hinge edge.
      doorMesh.position.set(0, 0, depth / 2);
    }
    hingeGroup.add(doorMesh);

    if (options.frame !== false) {
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.03, height + 0.1, depth + 0.2),
        frameMat
      );
      hingeGroup.add(frame);
      // Frame sits behind the leaf; it must never eat the raycast.
      frame.userData.ignoreRaycast = true;
    }

    if (options.hasHandle !== false && options.handle !== false && kinematics === 'swing') {
      const handle = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.08, 0.2),
        new THREE.MeshStandardMaterial({ color: 0xd6c18a, metalness: 0.8, roughness: 0.2 })
      );
      handle.position.set(0.08, 0, 0.34);
      doorMesh.add(handle);
    }

    if (options.hasWindow) {
      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(0.6, 0.5),
        new THREE.MeshStandardMaterial({
          color: 0x88ccff, transparent: true, opacity: 0.22, roughness: 0.05
        })
      );
      glass.rotation.y = Math.PI / 2;
      glass.position.set(width / 2 + 0.01, 0.5, 0);
      doorMesh.add(glass);
    }

    this.scene.add(hingeGroup);

    const door = new DoorInstance({
      ...options,
      kinematics,
      mesh: doorMesh,
      hingeGroup
    });

    door.onSound = (type, pos) => {
      if (!this.audio) return;
      switch (type) {
        case 'open': this.audio.playDoorOpen(pos); break;
        case 'close': this.audio.playDoorClose(pos); break;
        case 'locked': this.audio.playDoorLocked(pos); break;
        case 'unlock': this.audio.playAccessGranted(); break;
      }
    };
    door.onAnomaly = () => this.audio?.playDoorStress(0.15);

    // The leaf is the interactable AND the collider. The hinge group gets its
    // own userData object (not a shared reference) so mutating one never
    // silently mutates the other.
    if (options.interactive !== false) {
      doorMesh.userData = {
        type: 'door',
        doorName: options.name,
        dynamicCollider: true
      };
      hingeGroup.userData = { type: 'door', doorName: options.name, isHinge: true };
      doorMesh.name = `door_${options.name}`;
    } else {
      doorMesh.userData = { dynamicCollider: true, doorName: options.name };
      hingeGroup.userData = {};
    }

    this.doors.set(options.name, door);
    this._authored.set(options.name, { locked: options.locked ?? false });
    if (options.collide !== false) this.colliders.push(doorMesh);

    return door;
  }

  getDoor(name) {
    return this.doors.get(name);
  }

  tryInteract(name, inventory, lighting) {
    const door = this.doors.get(name);
    if (!door) return null;
    return door.tryOpen(inventory, lighting);
  }

  /** Prompt text for the HUD, derived from live door state. */
  getPrompt(name, inventory) {
    const door = this.doors.get(name);
    if (!door) return '[E] Interact';
    if (door.isLocked) {
      const hasKey = door.keyId && inventory?.hasItem?.(door.keyId);
      return hasKey ? `[E] ${door.openLabel}` : door.lockedPrompt;
    }
    if (door.oneWay && door.isOpen) return '';
    return door.isOpen ? `[E] ${door.closeLabel}` : `[E] ${door.openLabel}`;
  }

  update(delta) {
    let moved = false;
    for (const door of this.doors.values()) {
      if (door.update(delta)) moved = true;
    }
    return moved;
  }

  /** All door leaves - always the same array identity, colliders stay live. */
  getColliders() {
    return this.colliders;
  }

  /** Full restore for restart-without-reload. */
  reset() {
    for (const [name, door] of this.doors) {
      door.reset(this._authored.get(name) || {});
    }
  }

  dispose() {
    for (const door of this.doors.values()) {
      if (door.hingeGroup?.parent) door.hingeGroup.parent.remove(door.hingeGroup);
      door.hingeGroup?.traverse(o => {
        o.geometry?.dispose?.();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
          else o.material.dispose();
        }
      });
    }
    this.doors.clear();
    this.colliders.length = 0;
  }
}

/** 'x'|'y'|'z' or a Vector3 -> normalized Vector3. */
function normalizeAxis(axis) {
  if (axis && typeof axis === 'object' && 'x' in axis) {
    return new THREE.Vector3(axis.x, axis.y, axis.z).normalize();
  }
  switch (axis) {
    case 'y': return new THREE.Vector3(0, 1, 0);
    case 'z': return new THREE.Vector3(0, 0, 1);
    default: return new THREE.Vector3(1, 0, 0);
  }
}

function makeDoorMaterial(options) {
  if (options.material) return options.material;
  switch (options.type) {
    case 'freezer':
      return new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.75, roughness: 0.25 });
    case 'office':
      return new THREE.MeshStandardMaterial({ color: 0x4b3621, roughness: 0.65, metalness: 0.1 });
    case 'bathroom':
      return new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 });
    case 'metal':
      return new THREE.MeshStandardMaterial({ color: 0x3f4653, metalness: 0.6, roughness: 0.45 });
    case 'shutter':
      return new THREE.MeshStandardMaterial({ color: 0x6b7280, metalness: 0.7, roughness: 0.4 });
    default:
      return new THREE.MeshStandardMaterial({ color: options.color || 0x5c3a1e, roughness: 0.55 });
  }
}
