import * as THREE from 'three';
import { AnimatedSprite } from './AnimatedSprite.js';

/**
 * MonsterEntity - the chicken and the Colonel share this AI.
 *
 * States: HIDDEN, IDLE, PATROL, INVESTIGATE, HEAR, SEARCH, CHASE, LOST,
 * RETURN, STUNNED. Transitions are validated against TRANSITIONS below, so an
 * illegal jump (e.g. HIDDEN straight to CHASE) is rejected rather than
 * silently corrupting the animation track.
 *
 * The behaviour is deliberately motivated rather than random: it chases what
 * it can see or has just heard, searches the last known position when that
 * fails, gives up on a timer, and walks back to its patrol route.
 */

/** Legal state graph. Anything not listed here is refused by setState(). */
const TRANSITIONS = {
  HIDDEN:      ['PATROL', 'IDLE'],
  IDLE:        ['PATROL', 'INVESTIGATE', 'HEAR', 'CHASE', 'STUNNED', 'HIDDEN'],
  PATROL:      ['IDLE', 'INVESTIGATE', 'HEAR', 'CHASE', 'STUNNED', 'HIDDEN'],
  INVESTIGATE: ['SEARCH', 'CHASE', 'HEAR', 'LOST', 'STUNNED', 'HIDDEN'],
  HEAR:        ['INVESTIGATE', 'CHASE', 'SEARCH', 'STUNNED', 'HIDDEN'],
  CHASE:       ['SEARCH', 'LOST', 'STUNNED', 'HIDDEN'],
  SEARCH:      ['CHASE', 'LOST', 'HEAR', 'STUNNED', 'HIDDEN'],
  LOST:        ['RETURN', 'CHASE', 'INVESTIGATE', 'HEAR', 'STUNNED', 'HIDDEN'],
  RETURN:      ['PATROL', 'CHASE', 'INVESTIGATE', 'HEAR', 'STUNNED', 'HIDDEN'],
  STUNNED:     ['SEARCH', 'PATROL', 'CHASE', 'RETURN', 'HIDDEN']
};

const _toPlayer = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _target = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _wander = new THREE.Vector3();

export class MonsterEntity {
  constructor(options) {
    this.scene = options.scene;
    this.audio = options.audio;
    this.type = options.type || 'chicken'; // chicken, colonel
    // Live shared array; boxes cached per object and refreshed only for
    // colliders that actually move.
    this.colliders = options.colliders || [];
    this.doorSystem = options.doorSystem || null;
    this._bounds = new Map();
    this.frameId = 0;
    this.collisionPoint = new THREE.Vector3();
    this.nextPosition = new THREE.Vector3();
    this.moveDir = new THREE.Vector3();

    // Stats
    this.state = 'HIDDEN';
    this.prevState = 'HIDDEN';
    this.speed = this.type === 'colonel' ? 2.8 : 3.2; // patrol slow creep
    this.chaseSpeed = this.type === 'colonel' ? 5.2 : 6.4;
    this.investigateSpeed = 3.8;
    this.searchSpeed = 2.2;
    this.health = this.type === 'colonel' ? 160 : 100;
    this.screechCooldown = 0;
    this.stunDuration = 0;
    this.searchTime = 0;
    this.lostTime = 0;
    this.idleTime = 0;
    this.investigatePos = new THREE.Vector3();
    this.returnPos = new THREE.Vector3();

    // Senses
    this.hearingRadius = this.type === 'colonel' ? 19 : 16;
    this.sightRange = 13;
    this.sightFOV = 85 * Math.PI / 180; // 85 deg cone
    this.canSeePlayer = false;
    this.lastKnownPlayerPos = new THREE.Vector3();
    this.lastKnownTime = -999;

    // Visual
    this.sprite = new AnimatedSprite({
      texture: options.texture,
      cols: 4,
      rows: 2,
      width: this.type === 'chicken' ? 2.9 : 2.6,
      height: this.type === 'chicken' ? 2.9 : 2.6,
      fps: 5
    });
    this.mesh = this.sprite.mesh;
    this.mesh.position.set(12, 0, 14);
    this.mesh.visible = false;
    this.scene.add(this.mesh);

    // Waypoints (purposeful patrol route tells story)
    this.waypoints = [
      new THREE.Vector3(12, 0, 14),
      new THREE.Vector3(0, 0, 12),
      new THREE.Vector3(-5, 0, 4),
      new THREE.Vector3(-6, 0, -8),
      new THREE.Vector3(6, 0, -8),
      new THREE.Vector3(8, 0, 2),
      new THREE.Vector3(15, 0, -16) // looks into ball pit
    ];
    if (this.type === 'colonel') {
      this.waypoints = [
        new THREE.Vector3(0, 0, -6),
        new THREE.Vector3(-4, 0, -4),
        new THREE.Vector3(-12, 0, 2),
        new THREE.Vector3(-22, 0, 10),
        new THREE.Vector3(-10, 0, 12),
        new THREE.Vector3(2, 0, 10),
        new THREE.Vector3(-30, 0, 5) // stares at drive-thru
      ];
    }
    this.currentWaypointIndex = 0;
    this.waypointWait = 0;

    // Breathing / footsteps audio timers
    this.breathTimer = 0;
    this.footstepTimer = 0;

    // Spawn pose, kept so reset() can restore it exactly.
    this.spawnPosition = this.mesh.position.clone();
    this.isDead = false;
  }

  /** True when the entity is spawned, visible and allowed to act. */
  isActive() {
    return this.mesh.visible && !this.isDead && this.state !== 'HIDDEN';
  }

  /** Cached, lazily-built AABB for a collider. */
  getBox(obj) {
    let entry = this._bounds.get(obj);
    if (!entry) {
      obj.updateWorldMatrix(true, false);
      entry = { box: new THREE.Box3().setFromObject(obj), frame: this.frameId };
      this._bounds.set(obj, entry);
      return entry.box;
    }
    if (obj.userData?.dynamicCollider && entry.frame !== this.frameId) {
      entry.frame = this.frameId;
      obj.updateWorldMatrix(true, false);
      entry.box.setFromObject(obj);
    }
    return entry.box;
  }

  /** A door wide enough to walk through is not an obstacle. */
  isOpenDoor(obj) {
    const name = obj.userData?.doorName;
    if (!name) return false;
    return this.doorSystem?.getDoor(name)?.isPassable() ?? false;
  }

  /** Full restore to the pre-spawn state (used by restart). */
  reset() {
    this.mesh.visible = false;
    this.mesh.position.copy(this.spawnPosition);
    this.state = 'HIDDEN';
    this.prevState = 'HIDDEN';
    this.isDead = false;
    this.health = this.type === 'colonel' ? 160 : 100;
    this.stunDuration = 0;
    this.searchTime = 0;
    this.lostTime = 0;
    this.idleTime = 0;
    this.screechCooldown = 0;
    this.canSeePlayer = false;
    this.currentWaypointIndex = 0;
    this.waypointWait = 0;
    this.moveDir.set(0, 0, 0);
    this._bounds.clear();
  }

  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.sprite.dispose?.();
    this._bounds.clear();
  }

  canMoveTo(x, z) {
    const radius = this.type === 'colonel' ? 0.65 : 0.55;
    // Arena bounds - stops the AI grinding into the skybox if it ever slips
    // past a wall collider.
    if (x < -33 || x > 33 || z < -34 || z > 30) return false;

    for (const obj of this.colliders) {
      if (!obj || obj.visible === false) continue;
      if (this.isOpenDoor(obj)) continue;
      const box = this.getBox(obj);
      if (!isFinite(box.min.x)) continue;
      if (
        x >= box.min.x - radius && x <= box.max.x + radius &&
        z >= box.min.z - radius && z <= box.max.z + radius &&
        box.max.y >= 0.2 && box.min.y <= 2.6
      ) return false;
    }
    return true;
  }

  moveToward(target, distance) {
    this.moveDir.subVectors(target, this.mesh.position);
    this.moveDir.y = 0;
    const remaining = this.moveDir.length();
    if (remaining <= 0.001) return;
    this.moveDir.normalize();
    const step = Math.min(distance, remaining);
    this.nextPosition.copy(this.mesh.position).addScaledVector(this.moveDir, step);
    if (this.canMoveTo(this.nextPosition.x, this.mesh.position.z)) this.mesh.position.x = this.nextPosition.x;
    if (this.canMoveTo(this.mesh.position.x, this.nextPosition.z)) this.mesh.position.z = this.nextPosition.z;
  }

  spawn(position) {
    if (this.mesh.visible) return;   // never spawn the same entity twice
    if (position) this.mesh.position.copy(position);
    this.spawnPosition.copy(this.mesh.position);
    this.mesh.visible = true;
    this.isDead = false;
    this.state = 'HIDDEN';
    this.setState('PATROL');
    this.returnPos.copy(this.mesh.position);
    this.audio?.playMonsterScreech(0.38);
  }

  hearNoise(pos, level = 0.5) {
    if (this.state === 'HIDDEN' || this.state === 'STUNNED') return;
    const dist = this.mesh.position.distanceTo(pos);
    // Level scales effective hearing
    const effective = this.hearingRadius * (0.35 + level * 0.65);
    if (dist > effective) return;

    // If already chasing, update last known
    if (this.state === 'CHASE') {
      this.lastKnownPlayerPos.copy(pos);
      this.lastKnownTime = this.time || 0;
      return;
    }

    // Otherwise investigate
    this.investigatePos.copy(pos);
    if (dist < effective * 0.45) {
      // Loud close noise -> immediate chase if has some line of sight suspicion
      this.setState('HEAR');
      this.lastKnownPlayerPos.copy(pos);
      this.lastKnownTime = this.time || 0;
    } else {
      this.setState('INVESTIGATE');
    }
  }

  /** Validated transition. Returns false when the move is not legal. */
  setState(newState) {
    if (this.state === newState) return false;
    const allowed = TRANSITIONS[this.state];
    if (allowed && !allowed.includes(newState)) return false;
    this.prevState = this.state;
    this.state = newState;
    // HIDDEN is the only state that hides the mesh, so every exit from it has
    // to put the body back. Without this, anything that leaves HIDDEN without
    // going through spawn() becomes an invisible-but-active hunter.
    if (newState !== 'HIDDEN' && !this.isDead) this.mesh.visible = true;
    // Animation handling
    switch (newState) {
      case 'PATROL':
        this.sprite.playTrack(0, 3, 5);
        break;
      case 'IDLE':
        this.sprite.playTrack(0, 0, 2);
        this.idleTime = 1.5 + Math.random() * 2.5;
        break;
      case 'INVESTIGATE':
        this.sprite.playTrack(0, 3, 7);
        break;
      case 'HEAR':
        this.sprite.playTrack(0, 3, 9);
        this.searchTime = 0;
        break;
      case 'CHASE':
        this.sprite.playTrack(4, 7, 9.5);
        break;
      case 'SEARCH':
        this.sprite.playTrack(0, 3, 6);
        this.searchTime = 8 + Math.random() * 5;
        break;
      case 'LOST':
        this.sprite.playTrack(0, 3, 4);
        this.lostTime = 3.5;
        break;
      case 'RETURN':
        this.sprite.playTrack(0, 3, 5);
        break;
      case 'STUNNED':
        this.sprite.flashRed(0.35);
        break;
      case 'HIDDEN':
        this.mesh.visible = false;
        break;
    }
    return true;
  }

  stun(duration = 2.0) {
    if (this.state === 'STUNNED' || !this.isActive()) return false;
    this.stateBeforeStun = this.state;
    // Routed through setState so the transition graph stays the single
    // authority; a raw assignment here skipped the state's entry logic.
    if (!this.setState('STUNNED')) return false;
    this.stunDuration = duration;
    this.sprite.flashRed(0.32);
    return true;
  }

  /**
   * Range -> FOV cone -> occlusion, cheapest test first.
   * Uses module-level scratch vectors: zero allocation per frame.
   */
  checkLineOfSight(playerPos, isPlayerHiding = false) {
    if (isPlayerHiding) { this.canSeePlayer = false; return false; }

    const dist = this.mesh.position.distanceTo(playerPos);
    if (dist > this.sightRange) { this.canSeePlayer = false; return false; }

    if (dist > 2.8) {
      // FOV cone, using facing (movement direction, or last heading).
      _toPlayer.subVectors(playerPos, this.mesh.position);
      _toPlayer.y = 0;
      _toPlayer.normalize();
      _forward.copy(this.moveDir);
      _forward.y = 0;
      if (_forward.lengthSq() < 0.001) _forward.copy(_toPlayer); // standing still: assume facing
      _forward.normalize();
      const angle = Math.acos(THREE.MathUtils.clamp(_forward.dot(_toPlayer), -1, 1));
      if (angle > this.sightFOV / 2) { this.canSeePlayer = false; return false; }
    }

    if (this.isOccluded(playerPos)) { this.canSeePlayer = false; return false; }

    this.canSeePlayer = true;
    this.lastKnownPlayerPos.copy(playerPos);
    this.lastKnownTime = this.time;
    return true;
  }

  /** Slab-test the sight ray against wall-height colliders. */
  isOccluded(playerPos) {
    const midY = 1.2;
    _origin.set(this.mesh.position.x, midY, this.mesh.position.z);
    _target.set(playerPos.x, midY, playerPos.z);
    _rayDir.subVectors(_target, _origin);
    const rayLen = _rayDir.length();
    if (rayLen < 0.001) return false;
    _rayDir.divideScalar(rayLen);

    const invX = 1 / (_rayDir.x || 1e-8);
    const invZ = 1 / (_rayDir.z || 1e-8);

    for (const obj of this.colliders) {
      if (!obj || obj.visible === false) continue;
      if (this.isOpenDoor(obj)) continue;
      const box = this.getBox(obj);
      if (!isFinite(box.min.x)) continue;
      if (box.max.y < 0.9 || box.min.y > 2.6) continue;   // only tall things block sight

      let t0 = (box.min.x - _origin.x) * invX;
      let t1 = (box.max.x - _origin.x) * invX;
      if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }

      let s0 = (box.min.z - _origin.z) * invZ;
      let s1 = (box.max.z - _origin.z) * invZ;
      if (s0 > s1) { const t = s0; s0 = s1; s1 = t; }

      const tEnter = Math.max(t0, s0);
      const tExit = Math.min(t1, s1);
      if (tEnter <= tExit && tExit > 0.25 && tEnter < rayLen - 0.25) return true;
    }
    return false;
  }

  update(delta, playerPos, camera, flashlightOn, playerNoise = 0, isPlayerHiding = false) {
    if (!this.isActive()) return;

    this.frameId++;
    this.time = (this.time || 0) + delta;
    this.sprite.update(delta, camera);
    if (this.screechCooldown > 0) this.screechCooldown -= delta;
    this.breathTimer += delta;
    this.footstepTimer += delta;

    // STUNNED - recovers into a search rather than an instant re-chase, which
    // is what makes the stun actually worth using.
    if (this.state === 'STUNNED') {
      this.stunDuration -= delta;
      if (this.stunDuration <= 0) {
        this.lastKnownPlayerPos.copy(playerPos);
        this.setState(this.stateBeforeStun === 'CHASE' ? 'SEARCH' : 'PATROL');
      }
      return;
    }

    const distToPlayer = this.mesh.position.distanceTo(playerPos);
    const sees = this.checkLineOfSight(playerPos, isPlayerHiding);

    // IDLE wait
    if (this.state === 'IDLE') {
      this.idleTime -= delta;
      if (this.idleTime <= 0) this.setState('PATROL');
      // Still check vision
      if (sees) {
        this.setState('CHASE');
      }
      return;
    }

    // PATROL logic
    if (this.state === 'PATROL') {
      if (sees) {
        this.setState('CHASE');
        if (this.screechCooldown <= 0) {
          this.audio?.playMonsterScreech(0.45);
          this.screechCooldown = 7;
        }
      } else if (flashlightOn && distToPlayer < this.sightRange * 0.85) {
        // Flashlight may attract if pointed close
        _toPlayer.subVectors(this.mesh.position, playerPos);
        _toPlayer.y = 0;
        _toPlayer.normalize();
        camera.getWorldDirection(_forward);
        _forward.y = 0;
        _forward.normalize();
        // Beam pointed straight at it: that counts as being noticed.
        if (_forward.dot(_toPlayer) > 0.75) this.hearNoise(playerPos, 0.55);
      }

      const targetWp = this.waypoints[this.currentWaypointIndex];
      const d = this.mesh.position.distanceTo(targetWp);
      if (d < 0.7) {
        this.waypointWait -= delta;
        if (this.waypointWait <= 0) {
          this.currentWaypointIndex = (this.currentWaypointIndex + 1) % this.waypoints.length;
          this.waypointWait = 0.6 + Math.random() * 1.5;
          // Chance to idle and look around
          if (Math.random() < 0.22) {
            this.setState('IDLE');
            return;
          }
        }
      } else {
        this.moveToward(targetWp, this.speed * delta);
        // Footstep audio when moving close to player
        if (distToPlayer < 11 && this.footstepTimer > (this.type === 'colonel' ? 0.68 : 0.52)) {
          this.footstepTimer = 0;
          if (this.audio && distToPlayer < 9) {
            // Subtle thud
            this.audio.playFootstepBehind(0.09 + (1 - distToPlayer / 11) * 0.14);
          }
        }
      }

      // Breathing when close but not seeing
      if (distToPlayer < 7 && !this.canSeePlayer && this.breathTimer > 3.5) {
        this.breathTimer = 0;
        if (Math.random() < 0.35) this.audio?.playWhisper(0.07 + (1 - distToPlayer / 7) * 0.11);
      }

    } else if (this.state === 'INVESTIGATE') {
      this.moveToward(this.investigatePos, this.investigateSpeed * delta);
      if (this.mesh.position.distanceTo(this.investigatePos) < 1.1) {
        this.setState('SEARCH');
      }
      if (sees) {
        this.setState('CHASE');
      }

    } else if (this.state === 'HEAR') {
      // Pause, turn toward noise, then chase
      this.searchTime += delta;
      // Look at noise pos
      _forward.subVectors(this.investigatePos, this.mesh.position);
      _forward.y = 0;
      if (_forward.lengthSq() > 0.001) this.moveDir.copy(_forward.normalize());
      if (this.searchTime > 0.8) {
        if (sees) {
          this.setState('CHASE');
        } else if (this.searchTime > 1.6) {
          // Go investigate last known
          this.investigatePos.copy(this.lastKnownPlayerPos);
          this.setState('INVESTIGATE');
        }
      }

    } else if (this.state === 'CHASE') {
      // Move to player last known, constantly update if seeing
      if (sees) {
        this.moveToward(playerPos, this.chaseSpeed * delta);
        this.lostTimer = 0;
      } else {
        // Move toward last known
        this.moveToward(this.lastKnownPlayerPos, this.chaseSpeed * delta);
        if (this.mesh.position.distanceTo(this.lastKnownPlayerPos) < 1.2) {
          this.setState('SEARCH');
        }
      }

      // Hiding breaks pursuit on a timer, not a per-frame coin flip.
      this.lostTimer = (this.lostTimer || 0) + delta;
      if (isPlayerHiding && distToPlayer > 5.5 && this.lostTimer > 2.5) this.setState('SEARCH');
      if (distToPlayer > this.sightRange * 1.6) this.setState('LOST');

      if (this.screechCooldown <= 0 && distToPlayer < 10) {
        this.audio?.playMonsterScreech(0.42);
        this.screechCooldown = 5 + Math.random() * 2;
      }

      // Footsteps faster when chasing
      if (this.footstepTimer > 0.32) {
        this.footstepTimer = 0;
        this.audio?.playFootstepBehind(0.2);
      }

    } else if (this.state === 'SEARCH') {
      this.searchTime -= delta;
      // Search around last known with small wander
      // Re-pick a search point occasionally instead of jittering every frame.
      this.searchRepick = (this.searchRepick || 0) - delta;
      if (this.searchRepick <= 0) {
        this.searchRepick = 1.4 + Math.random();
        _wander.set(
          this.lastKnownPlayerPos.x + (Math.random() - 0.5) * 4.5,
          0,
          this.lastKnownPlayerPos.z + (Math.random() - 0.5) * 4.5
        );
      }
      this.moveToward(_wander, this.searchSpeed * delta);

      if (sees) {
        this.setState('CHASE');
      } else if (this.searchTime <= 0) {
        this.setState('LOST');
      }

      if (this.breathTimer > 2.8 && distToPlayer < 8) {
        this.breathTimer = 0;
        this.audio?.playWhisper(0.09);
      }

    } else if (this.state === 'LOST') {
      this.lostTime -= delta;
      if (this.lostTime <= 0) {
        this.setState('RETURN');
      }
      if (sees) {
        this.setState('CHASE');
      }

    } else if (this.state === 'RETURN') {
      this.moveToward(this.returnPos, this.speed * delta);
      if (this.mesh.position.distanceTo(this.returnPos) < 0.8) {
        this.setState('PATROL');
      }
      if (sees) this.setState('CHASE');
    }
  }
}
