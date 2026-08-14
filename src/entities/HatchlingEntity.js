import * as THREE from 'three';
import { AnimatedSprite } from './AnimatedSprite.js';

/**
 * HatchlingEntity - the skittering spider-chickens.
 *
 * Small, fast, territorial. They hold a home area, react to noise, and only
 * commit to a chase once they can actually perceive the player. Unlike the
 * main monster they never coordinate - the horror comes from several of them
 * converging on the same racket you just made.
 *
 * Lifecycle is explicit: alive -> isDead (death animation playing) ->
 * isDisposed (removed from the scene, safe for the owner to splice out).
 * Nothing here uses setTimeout, so a restart mid-death cannot resurrect a
 * pending callback.
 */

const _scratch = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _target = new THREE.Vector3();
const _ray = new THREE.Vector3();

/** How far away a hatchling stops animating/thinking entirely. */
const CULL_DISTANCE = 26;

export class HatchlingEntity {
  constructor(options) {
    this.scene = options.scene;
    this.audio = options.audio;
    this.colliders = options.colliders || [];
    this.doorSystem = options.doorSystem || null;
    this._bounds = new Map();
    this.frameId = 0;

    this.nextPosition = new THREE.Vector3();
    this.moveDir = new THREE.Vector3();

    this.speed = 3.0 + Math.random() * 0.8;
    this.maxHealth = 28;
    this.health = this.maxHealth;
    this.isDead = false;
    this.isDisposed = false;
    this.deathTimer = 0;

    this.attackCooldown = Math.random() * 1.2;
    this.attackDamage = 14;
    this.biteResetTimer = 0;

    this.spawnPos = (options.spawnPos || new THREE.Vector3(0, 0.45, 0)).clone();
    this.spawnPos.y = 0.45;
    this.home = this.spawnPos.clone();
    this.target = this.spawnPos.clone();
    this.investigatePos = new THREE.Vector3();
    this.hasInvestigateTarget = false;

    this.state = 'PATROL';
    this.wanderAngle = Math.random() * Math.PI * 2;
    this.repickTimer = 0;
    this.biteVariant = 0;
    this.hearing = 11;
    this.sightRange = 9.5;

    this.sprite = new AnimatedSprite({
      texture: options.texture,
      cols: 4,
      rows: 4,
      width: 1.05,
      height: 1.05,
      fps: 11
    });
    this.mesh = this.sprite.mesh;
    this.mesh.position.copy(this.spawnPos);
    this.mesh.userData.entity = this;
    this.scene.add(this.mesh);
    this.sprite.playTrack(0, 3, 12);
  }

  /** Alive, in the scene, and allowed to act. */
  isActive() {
    return !this.isDead && !this.isDisposed && this.mesh.visible;
  }

  /** Cached AABB, refreshed once per frame only for moving colliders. */
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

  isOpenDoor(obj) {
    const name = obj.userData?.doorName;
    if (!name) return false;
    return this.doorSystem?.getDoor(name)?.isPassable() ?? false;
  }

  canMoveTo(x, z) {
    const radius = 0.32;
    if (x < -33 || x > 33 || z < -34 || z > 30) return false;

    for (const obj of this.colliders) {
      if (!obj || obj.visible === false) continue;
      if (this.isOpenDoor(obj)) continue;
      const box = this.getBox(obj);
      if (!isFinite(box.min.x)) continue;
      // Hatchlings are low: they slip under anything raised off the floor.
      if (box.min.y > 0.85) continue;
      if (
        x >= box.min.x - radius && x <= box.max.x + radius &&
        z >= box.min.z - radius && z <= box.max.z + radius &&
        box.max.y >= 0.1
      ) return false;
    }
    return true;
  }

  /** Walls block bites. Prevents damage through the freezer door. */
  hasClearPath(playerPos) {
    _origin.set(this.mesh.position.x, 0.5, this.mesh.position.z);
    _target.set(playerPos.x, 0.5, playerPos.z);
    _ray.subVectors(_target, _origin);
    const len = _ray.length();
    if (len < 0.001) return true;
    _ray.divideScalar(len);

    const invX = 1 / (_ray.x || 1e-8);
    const invZ = 1 / (_ray.z || 1e-8);

    for (const obj of this.colliders) {
      if (!obj || obj.visible === false) continue;
      if (this.isOpenDoor(obj)) continue;
      const box = this.getBox(obj);
      if (!isFinite(box.min.x)) continue;
      if (box.min.y > 0.85 || box.max.y < 0.5) continue;

      let t0 = (box.min.x - _origin.x) * invX;
      let t1 = (box.max.x - _origin.x) * invX;
      if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
      let s0 = (box.min.z - _origin.z) * invZ;
      let s1 = (box.max.z - _origin.z) * invZ;
      if (s0 > s1) { const t = s0; s0 = s1; s1 = t; }

      const tEnter = Math.max(t0, s0);
      const tExit = Math.min(t1, s1);
      if (tEnter <= tExit && tExit > 0.2 && tEnter < len - 0.2) return false;
    }
    return true;
  }

  moveToward(target, distance) {
    this.moveDir.subVectors(target, this.mesh.position);
    this.moveDir.y = 0;
    const remaining = this.moveDir.length();
    if (remaining <= 0.001) return;
    this.moveDir.normalize();
    this.nextPosition.copy(this.mesh.position).addScaledVector(this.moveDir, Math.min(distance, remaining));
    if (this.canMoveTo(this.nextPosition.x, this.mesh.position.z)) this.mesh.position.x = this.nextPosition.x;
    if (this.canMoveTo(this.mesh.position.x, this.nextPosition.z)) this.mesh.position.z = this.nextPosition.z;
    this.mesh.position.y = 0.45;
  }

  hearNoise(pos, level = 0.5) {
    if (!this.isActive() || this.state === 'CHASE') return;
    const d = this.mesh.position.distanceTo(pos);
    if (d > this.hearing * (0.35 + level * 0.65)) return;
    this.investigatePos.copy(pos);
    this.hasInvestigateTarget = true;
    this.state = 'INVESTIGATE';
  }

  takeDamage(amount) {
    if (!this.isActive()) return;
    this.health -= amount;
    this.audio?.playMonsterHit();

    if (this.health <= 0) {
      this.health = 0;
      this.isDead = true;
      this.state = 'DEAD';
      this.deathTimer = 1.1;
      this.sprite.playTrack(12, 15, 8, false);
    } else {
      this.sprite.flashRed(0.18);
      // A hit that doesn't kill sends it scurrying home briefly.
      this.state = 'RETURN';
    }
  }

  /** Removes the sprite from the scene and frees its GPU resources. */
  dispose() {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.mesh.parent?.remove(this.mesh);
    this.sprite.dispose?.();
    this._bounds.clear();
  }

  update(delta, playerPos, camera, onAttackPlayer) {
    if (this.isDisposed) return;
    this.frameId++;

    // Death: play out the animation on the frame clock, then self-dispose.
    if (this.isDead) {
      this.sprite.update(delta, camera);
      this.deathTimer -= delta;
      if (this.deathTimer <= 0) this.dispose();
      return;
    }

    const dist = this.mesh.position.distanceTo(playerPos);

    // Distance culling: far hatchlings freeze completely (no anim, no AI).
    if (dist > CULL_DISTANCE) {
      if (this.mesh.visible) this.mesh.visible = false;
      return;
    }
    if (!this.mesh.visible) this.mesh.visible = true;

    this.sprite.update(delta, camera);
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);

    if (this.biteResetTimer > 0) {
      this.biteResetTimer -= delta;
      if (this.biteResetTimer <= 0) this.sprite.playTrack(0, 3, 13);
    }

    const homeDist = this.mesh.position.distanceTo(this.home);
    // Perception: close enough AND nothing solid in between.
    const perceives = dist < this.sightRange && this.hasClearPath(playerPos);

    switch (this.state) {
      case 'PATROL': {
        this.repickTimer -= delta;
        if (this.repickTimer <= 0) {
          this.repickTimer = 2.5 + Math.random() * 2.5;
          this.wanderAngle += (Math.random() - 0.5) * 2.4;
          this.target.set(
            this.home.x + Math.cos(this.wanderAngle) * (2 + Math.random() * 2.5),
            0.45,
            this.home.z + Math.sin(this.wanderAngle) * (2 + Math.random() * 2.5)
          );
        }
        this.moveToward(this.target, this.speed * delta * 0.45);
        if (perceives) this.state = 'CHASE';
        break;
      }

      case 'INVESTIGATE': {
        if (!this.hasInvestigateTarget) { this.state = 'PATROL'; break; }
        this.moveToward(this.investigatePos, this.speed * delta);
        if (this.mesh.position.distanceTo(this.investigatePos) < 1.0) {
          this.hasInvestigateTarget = false;
          this.state = 'PATROL';
        }
        if (perceives) this.state = 'CHASE';
        break;
      }

      case 'CHASE': {
        this.moveToward(playerPos, this.speed * delta);

        if (dist < 1.35 && this.attackCooldown <= 0 && this.hasClearPath(playerPos)) {
          this.attackCooldown = 1.25;
          // The sheet carries two authored bite cycles (row 1 lunge, row 2
          // "skindering" bite). Alternating them stops a swarm from moving as
          // one synchronised organism. Row 2 only exists on the final 4x4 art;
          // playTrack clamps safely while the 4x2 placeholder is loaded.
          this.biteVariant = this.biteVariant === 1 ? 0 : 1;
          const biteRow = this.biteVariant === 1 ? 8 : 4;
          this.sprite.playTrack(biteRow, biteRow + 3, 15);
          this.biteResetTimer = 0.48;
          this.audio?.playMonsterBite();
          // The player owns i-frames, so a swarm still lands one hit per window.
          onAttackPlayer?.(this.attackDamage);
        }

        // Give up when the player is far or it has strayed from its territory.
        if (dist > 14 || homeDist > 18) this.state = 'RETURN';
        break;
      }

      case 'RETURN': {
        this.moveToward(this.home, this.speed * delta * 0.85);
        if (homeDist < 1.0) this.state = 'PATROL';
        else if (perceives && homeDist < 12) this.state = 'CHASE';
        break;
      }
    }
  }
}
