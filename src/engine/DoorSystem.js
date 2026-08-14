import * as THREE from 'three';

/**
 * DoorSystem - Physically animated doors with weight, hinge sounds,
 * lock states, key requirements, and subtle horror behaviors.
 */

export class DoorInstance {
  constructor(mesh, options = {}) {
    this.mesh = mesh;
    this.name = options.name || 'door';
    this.isLocked = options.locked ?? false;
    this.keyId = options.keyId || null; // e.g. 'office_key', 'freezer_keycard'
    this.isOpen = options.isOpen ?? false;
    this.openAngle = options.openAngle ?? Math.PI / 1.8;
    this.closedAngle = options.closedAngle ?? 0;
    this.currentAngle = this.isOpen ? this.openAngle : this.closedAngle;
    this.targetAngle = this.currentAngle;
    this.openSpeed = options.openSpeed ?? 2.2;
    this.closeSpeed = options.closeSpeed ?? 2.8;
    this.isAnimating = false;
    this.isBlocked = false;
    this.autoClose = options.autoClose ?? false;
    this.autoCloseDelay = options.autoCloseDelay ?? 6;
    this.autoCloseTimer = 0;
    this.requiresPower = options.requiresPower ?? false;

    this.hingeGroup = options.hingeGroup || mesh.parent;
    this.originalY = mesh.rotation.y;

    // Collider proxy
    this.collider = options.collider || mesh;
    this.lockedMessage = options.lockedMessage || 'Locked.';
    this.unlockMessage = options.unlockMessage || 'Unlocked.';

    // Horror: some doors breathe or jitter
    this.anomaly = options.anomaly || false;
    this.anomalyTimer = 0;
  }

  tryOpen(playerInventory, lighting) {
    if (this.isLocked) {
      if (this.keyId && playerInventory && playerInventory.hasKey && playerInventory.hasKey(this.keyId)) {
        this.isLocked = false;
        this.playSound('unlock');
        return { success: true, message: this.unlockMessage, unlocked: true };
      }
      if (this.requiresPower && lighting && !lighting.powerActive) {
        return { success: false, message: 'No power. Generator offline.', locked: true };
      }
      this.playAnim('rattle');
      this.playSound('locked');
      return { success: false, message: this.lockedMessage, locked: true };
    }

    this.isOpen = !this.isOpen;
    this.targetAngle = this.isOpen ? this.openAngle : this.closedAngle;
    this.isAnimating = true;
    this.autoCloseTimer = this.autoCloseDelay;
    this.playSound(this.isOpen ? 'open' : 'close');
    
    return { 
      success: true, 
      message: this.isOpen ? 'Opened.' : 'Closed.',
      opened: this.isOpen 
    };
  }

  forceOpen() {
    this.isLocked = false;
    this.isOpen = true;
    this.targetAngle = this.openAngle;
    this.isAnimating = true;
    this.playSound('open');
  }

  forceClose() {
    this.isOpen = false;
    this.targetAngle = this.closedAngle;
    this.isAnimating = true;
    this.playSound('close');
  }

  playSound(type) {
    // Sound handled externally via AudioManager callbacks to avoid circular deps
    if (this.onSound) this.onSound(type, this.mesh.position);
  }

  playAnim(type) {
    if (type === 'rattle' && this.mesh) {
      // Quick shake animation
      const start = this.mesh.rotation.y;
      let t = 0;
      const rattle = () => {
        t += 0.12;
        if (t > Math.PI * 2) {
          this.mesh.rotation.y = this.currentAngle;
          return;
        }
        this.mesh.rotation.y = this.currentAngle + Math.sin(t * 4) * 0.08;
        requestAnimationFrame(rattle);
      };
      rattle();
    }
  }

  update(delta) {
    const prev = this.currentAngle;
    const speed = this.isOpen ? this.openSpeed : this.closeSpeed;
    this.currentAngle = THREE.MathUtils.lerp(this.currentAngle, this.targetAngle, Math.min(1, delta * speed));
    
    // Apply to mesh
    if (this.mesh) {
      this.mesh.rotation.y = this.currentAngle;
      if (this.mesh.parent) this.mesh.parent.updateMatrixWorld(true);
    }

    if (Math.abs(this.currentAngle - this.targetAngle) < 0.01) {
      this.currentAngle = this.targetAngle;
      this.isAnimating = false;
    }

    // Auto close logic
    if (this.autoClose && this.isOpen) {
      this.autoCloseTimer -= delta;
      if (this.autoCloseTimer <= 0) {
        this.isOpen = false;
        this.targetAngle = this.closedAngle;
        this.isAnimating = true;
        this.playSound('close');
      }
    }

    // Anomaly: subtle breathing movement when closed and player near
    if (this.anomaly && !this.isOpen) {
      this.anomalyTimer += delta;
      if (this.anomalyTimer > 3 + Math.random() * 7) {
        this.anomalyTimer = 0;
        if (Math.random() < 0.12) {
          // Slight tug
          this.targetAngle = 0.05 + Math.random() * 0.07;
          setTimeout(() => {
            this.targetAngle = this.closedAngle;
            this.isAnimating = true;
          }, 150 + Math.random() * 200);
          if (this.onAnomaly) this.onAnomaly(this);
        }
      }
    }

    return Math.abs(prev - this.currentAngle) > 0.001;
  }
}

export class DoorSystem {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.doors = new Map();
    this.colliderUpdates = [];
  }

  createDoor(options) {
    const hingeGroup = new THREE.Group();
    hingeGroup.position.set(options.x, options.y || 1.5, options.z);
    hingeGroup.rotation.y = options.rotation || 0;

    const doorGeo = new THREE.BoxGeometry(
      options.width || 0.12,
      options.height || 2.3,
      options.depth || 1.0
    );

    // Choose material based on door type
    let doorMat;
    switch (options.type) {
      case 'freezer':
        doorMat = new THREE.MeshStandardMaterial({
          color: 0xcbd5e1,
          metalness: 0.75,
          roughness: 0.25
        });
        break;
      case 'office':
        doorMat = new THREE.MeshStandardMaterial({
          color: 0x4b3621,
          roughness: 0.65,
          metalness: 0.1
        });
        break;
      case 'bathroom':
        doorMat = new THREE.MeshStandardMaterial({
          color: 0x475569,
          roughness: 0.8
        });
        break;
      default:
        doorMat = new THREE.MeshStandardMaterial({
          color: options.color || 0x5c3a1e,
          roughness: 0.55
        });
    }

    const doorMesh = new THREE.Mesh(doorGeo, doorMat);
    // Pivot at edge
    doorMesh.position.set((options.depth || 1.0) / 2, 0, 0);
    doorMesh.castShadow = true;
    doorMesh.receiveShadow = true;
    hingeGroup.add(doorMesh);

    // Frame
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
    const frameGeo = new THREE.BoxGeometry(0.15, 2.4, 1.2);
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.set(0, 0, 0);
    hingeGroup.add(frame);

    // Handle
    if (options.hasHandle !== false) {
      const handleGeo = new THREE.BoxGeometry(0.06, 0.08, 0.2);
      const handleMat = new THREE.MeshStandardMaterial({
        color: 0xd6c18a,
        metalness: 0.8,
        roughness: 0.2
      });
      const handle = new THREE.Mesh(handleGeo, handleMat);
      handle.position.set(0.08, 0, 0.42);
      doorMesh.add(handle);
    }

    // Window for office doors
    if (options.hasWindow) {
      const glassGeo = new THREE.PlaneGeometry(0.6, 0.5);
      const glassMat = new THREE.MeshStandardMaterial({
        color: 0x88ccff,
        transparent: true,
        opacity: 0.22,
        roughness: 0.05
      });
      const glass = new THREE.Mesh(glassGeo, glassMat);
      glass.rotation.y = Math.PI / 2;
      glass.position.set(0.07, 0.5, 0);
      doorMesh.add(glass);
    }

    this.scene.add(hingeGroup);

    const doorInstance = new DoorInstance(doorMesh, {
      name: options.name,
      locked: options.locked,
      keyId: options.keyId,
      isOpen: options.isOpen,
      hingeGroup: hingeGroup,
      collider: doorMesh,
      anomaly: options.anomaly,
      autoClose: options.autoClose,
      lockedMessage: options.lockedMessage,
      unlockMessage: options.unlockMessage,
      requiresPower: options.requiresPower
    });

    doorInstance.hingeGroup = hingeGroup;
    doorInstance.onSound = (type, pos) => {
      if (!this.audio) return;
      switch (type) {
        case 'open': this.audio.playDoorOpen(pos); break;
        case 'close': this.audio.playDoorClose(pos); break;
        case 'locked': this.audio.playDoorLocked(pos); break;
        case 'unlock': this.audio.playAccessGranted(); break;
      }
    };
    doorInstance.onAnomaly = (door) => {
      if (this.audio) this.audio.playDoorStress(0.15);
    };

    this.doors.set(options.name, doorInstance);
    if (options.interactive !== false) {
      // Interactable tag for raycast
      doorMesh.userData = {
        type: 'door',
        doorName: options.name,
        prompt: options.locked ? (options.lockedPrompt || 'Locked') : 'Open'
      };
      hingeGroup.userData = doorMesh.userData;
      doorMesh.name = `door_${options.name}`;
    }

    return doorInstance;
  }

  getDoor(name) {
    return this.doors.get(name);
  }

  tryInteract(name, playerInventory, lighting) {
    const door = this.doors.get(name);
    if (!door) return null;
    return door.tryOpen(playerInventory, lighting);
  }

  update(delta) {
    let needsColliderUpdate = false;
    for (const door of this.doors.values()) {
      const changed = door.update(delta);
      if (changed) needsColliderUpdate = true;
    }
    return needsColliderUpdate;
  }

  getColliders() {
    const colliders = [];
    for (const door of this.doors.values()) {
      if (!door.isOpen || Math.abs(door.currentAngle) < 0.35) {
        colliders.push(door.collider);
      }
    }
    return colliders;
  }
}
