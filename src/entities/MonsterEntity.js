import * as THREE from 'three';
import { AnimatedSprite } from './AnimatedSprite.js';

/**
 * MonsterEntity - Polished horror AI with full state machine:
 * IDLE, PATROL, INVESTIGATE, HEAR, SEARCH, CHASE, LOST, RETURN, STUNNED, HIDDEN
 * - Hearing radius, line-of-sight cone, search behavior
 * - Footsteps, breathing, occasional growl when close but unseen
 * - No cheap random chasing, motivated by noise and light
 */

export class MonsterEntity {
  constructor(options) {
    this.scene = options.scene;
    this.audio = options.audio;
    this.type = options.type || 'chicken'; // chicken, colonel
    this.colliders = options.colliders || [];
    this.colliderBounds = this.colliders.map(o => ({ object: o, box: new THREE.Box3().setFromObject(o) }));
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
  }

  canMoveTo(x, z) {
    const radius = this.type === 'colonel' ? 0.65 : 0.55;
    this.collisionPoint.set(x, 1.0, z);
    for (const entry of this.colliderBounds) {
      const obj = entry.object;
      if (!obj?.visible) continue;
      if (obj.userData?.type === 'freezer_door' && obj.userData.isOpen) continue;
      if (obj.userData?.type === 'freezer_door' || obj.userData?.type === 'door') entry.box.setFromObject(obj);
      if (
        this.collisionPoint.x >= entry.box.min.x - radius &&
        this.collisionPoint.x <= entry.box.max.x + radius &&
        this.collisionPoint.z >= entry.box.min.z - radius &&
        this.collisionPoint.z <= entry.box.max.z + radius &&
        entry.box.max.y >= 0.2 && entry.box.min.y <= 2.6
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
    if (position) this.mesh.position.copy(position);
    this.mesh.visible = true;
    this.state = 'PATROL';
    this.sprite.playTrack(0, 3, 5);
    this.returnPos.copy(this.mesh.position);
    if (this.audio) this.audio.playMonsterScreech(0.38);
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
      this.lastKnownTime = performance.now() / 1000;
      return;
    }

    // Otherwise investigate
    this.investigatePos.copy(pos);
    if (dist < effective * 0.45) {
      // Loud close noise -> immediate chase if has some line of sight suspicion
      this.setState('HEAR');
      this.lastKnownPlayerPos.copy(pos);
      this.lastKnownTime = performance.now() / 1000;
    } else {
      this.setState('INVESTIGATE');
    }
  }

  setState(newState) {
    if (this.state === newState) return;
    this.prevState = this.state;
    this.state = newState;
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
    }
  }

  stun(duration = 2.0) {
    this.state = 'STUNNED';
    this.stunDuration = duration;
    this.sprite.flashRed(0.32);
  }

  checkLineOfSight(playerPos, camera) {
    const dist = this.mesh.position.distanceTo(playerPos);
    if (dist > this.sightRange) {
      this.canSeePlayer = false;
      return false;
    }
    if (dist < 2.8) {
      // Very close always sees if not hiding
      this.canSeePlayer = true;
      return true;
    }
    // FOV check
    const toPlayer = new THREE.Vector3().subVectors(playerPos, this.mesh.position);
    toPlayer.y = 0;
    toPlayer.normalize();
    const forward = new THREE.Vector3(0, 0, 0);
    // Use movement direction as forward if moving, else toward last known
    if (this.moveDir.lengthSq() > 0.001) {
      forward.copy(this.moveDir);
    } else {
      forward.set(Math.sin(Date.now() * 0.0001), 0, Math.cos(Date.now() * 0.0001));
    }
    forward.y = 0;
    forward.normalize();
    const dot = forward.dot(toPlayer);
    const angle = Math.acos(THREE.MathUtils.clamp(dot, -1, 1));
    if (angle > this.sightFOV / 2) {
      this.canSeePlayer = false;
      return false;
    }

    // Simple raycast against colliders (check if wall between)
    const rayDir = new THREE.Vector3().subVectors(playerPos, this.mesh.position);
    const rayLen = rayDir.length();
    rayDir.normalize();
    // Check colliders for occlusion - cheap AABB ray vs box mid height
    const midY = 1.2;
    const origin = new THREE.Vector3(this.mesh.position.x, midY, this.mesh.position.z);
    const target = new THREE.Vector3(playerPos.x, midY, playerPos.z);
    const dir = new THREE.Vector3().subVectors(target, origin).normalize();
    for (const entry of this.colliderBounds) {
      const obj = entry.object;
      if (!obj?.visible) continue;
      if (obj.userData?.type === 'freezer_door' && obj.userData.isOpen) continue;
      // Ignore small props, only walls
      if (entry.box.max.y < 0.5) continue;
      if (entry.box.min.y > 2.6) continue;
      // Simple intersect test - check if box blocks
      if (entry.box.min.x === Infinity) continue;
      // Project onto ray
      // If box center is between origin and target and close to line -> block
      const boxCenter = new THREE.Vector3();
      entry.box.getCenter(boxCenter);
      const toCenter = new THREE.Vector3().subVectors(boxCenter, origin);
      const proj = toCenter.dot(dir);
      if (proj < 0.4 || proj > rayLen - 0.4) continue;
      const closest = new THREE.Vector3().copy(origin).addScaledVector(dir, proj);
      const distToLine = closest.distanceTo(boxCenter);
      // Use box size as thickness for occlusion
      if (distToLine < 1.2 && entry.box.containsPoint?.(closest)) {
        // Might be blocking
        // Extra check: if entry box contains closest point
        if (closest.x >= entry.box.min.x && closest.x <= entry.box.max.x &&
            closest.z >= entry.box.min.z && closest.z <= entry.box.max.z) {
          this.canSeePlayer = false;
          return false;
        }
      }
    }

    this.canSeePlayer = true;
    this.lastKnownPlayerPos.copy(playerPos);
    this.lastKnownTime = performance.now() / 1000;
    return true;
  }

  update(delta, playerPos, camera, flashlightOn, playerNoise = 0, isPlayerHiding = false) {
    if (!this.mesh.visible) return;

    this.sprite.update(delta, camera);
    if (this.screechCooldown > 0) this.screechCooldown -= delta;
    this.breathTimer += delta;
    this.footstepTimer += delta;

    // STUNNED
    if (this.state === 'STUNNED') {
      this.stunDuration -= delta;
      if (this.stunDuration <= 0) {
        this.setState('CHASE');
      }
      return;
    }

    const distToPlayer = this.mesh.position.distanceTo(playerPos);

    // IDLE wait
    if (this.state === 'IDLE') {
      this.idleTime -= delta;
      if (this.idleTime <= 0) this.setState('PATROL');
      // Still check vision
      if (this.checkLineOfSight(playerPos, camera) && !isPlayerHiding) {
        this.setState('CHASE');
      }
      return;
    }

    // PATROL logic
    if (this.state === 'PATROL') {
      // Check sight
      if (this.checkLineOfSight(playerPos, camera) && !isPlayerHiding) {
        if (distToPlayer < this.sightRange) {
          this.setState('CHASE');
          if (this.screechCooldown <= 0) {
            this.audio?.playMonsterScreech(0.45);
            this.screechCooldown = 7;
          }
        }
      } else if (flashlightOn && distToPlayer < this.sightRange * 0.85) {
        // Flashlight may attract if pointed close
        const toMon = new THREE.Vector3().subVectors(this.mesh.position, playerPos).normalize();
        const playerForward = new THREE.Vector3();
        camera.getWorldDirection(playerForward);
        playerForward.y = 0;
        playerForward.normalize();
        const dot = playerForward.dot(toMon);
        if (dot > 0.75) { // player looking near monster
          this.hearNoise(playerPos, 0.55);
        }
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
      if (this.checkLineOfSight(playerPos, camera) && !isPlayerHiding) {
        this.setState('CHASE');
      }

    } else if (this.state === 'HEAR') {
      // Pause, turn toward noise, then chase
      this.searchTime += delta;
      // Look at noise pos
      const dir = new THREE.Vector3().subVectors(this.investigatePos, this.mesh.position);
      dir.y = 0;
      if (dir.lengthSq() > 0.001) {
        dir.normalize();
        this.moveDir.copy(dir);
      }
      if (this.searchTime > 0.8) {
        if (this.checkLineOfSight(playerPos, camera) && !isPlayerHiding) {
          this.setState('CHASE');
        } else if (this.searchTime > 1.6) {
          // Go investigate last known
          this.investigatePos.copy(this.lastKnownPlayerPos);
          this.setState('INVESTIGATE');
        }
      }

    } else if (this.state === 'CHASE') {
      // Move to player last known, constantly update if seeing
      if (this.checkLineOfSight(playerPos, camera) && !isPlayerHiding) {
        this.lastKnownPlayerPos.copy(playerPos);
        this.lastKnownTime = performance.now() / 1000;
        this.moveToward(playerPos, this.chaseSpeed * delta);
      } else {
        // Move toward last known
        this.moveToward(this.lastKnownPlayerPos, this.chaseSpeed * delta);
        if (this.mesh.position.distanceTo(this.lastKnownPlayerPos) < 1.2) {
          this.setState('SEARCH');
        }
      }

      // If player hides while chasing and far, may lose
      if (isPlayerHiding && distToPlayer > 6.5) {
        if (Math.random() < 0.02) this.setState('SEARCH');
      }

      if (distToPlayer > this.sightRange * 1.6 && !this.canSeePlayer) {
        this.setState('LOST');
      }

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
      const wander = new THREE.Vector3(
        this.lastKnownPlayerPos.x + (Math.random() - 0.5) * 3.5,
        0,
        this.lastKnownPlayerPos.z + (Math.random() - 0.5) * 3.5
      );
      this.moveToward(wander, this.searchSpeed * delta);

      if (this.checkLineOfSight(playerPos, camera) && !isPlayerHiding) {
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
      if (this.checkLineOfSight(playerPos, camera) && !isPlayerHiding) {
        this.setState('CHASE');
      }

    } else if (this.state === 'RETURN') {
      this.moveToward(this.returnPos, this.speed * delta);
      if (this.mesh.position.distanceTo(this.returnPos) < 0.8) {
        this.setState('PATROL');
      }
      if (this.checkLineOfSight(playerPos, camera) && distToPlayer < this.sightRange && !isPlayerHiding) {
        this.setState('CHASE');
      }
    }
  }
}
