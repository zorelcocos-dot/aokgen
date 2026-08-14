import * as THREE from 'three';
import { AnimatedSprite } from './AnimatedSprite.js';

/**
 * HatchlingEntity represents a creepy skittering chicken-head spider.
 * 4x4 animated spritesheet:
 * Row 0: Walk cycle (Frames 0-3)
 * Row 1: Attack bite (Frames 4-7)
 * Row 2: Alternate Skittering Bite (Frames 8-11)
 * Row 3: Damaged/Death (Frames 12-15)
 */
export class HatchlingEntity {
  /**
   * @param {Object} options
   * @param {THREE.Scene} options.scene
   * @param {THREE.Texture} options.texture - 4x4 keyed texture
   * @param {THREE.Vector3} options.spawnPos
   * @param {AudioManager} options.audio
   */
  constructor(options) {
    this.scene = options.scene;
    this.audio = options.audio;
    this.colliders = options.colliders || [];
    this.colliderBounds = this.colliders.map((object) => ({
      object,
      box: new THREE.Box3().setFromObject(object)
    }));
    this.collisionPoint = new THREE.Vector3();
    this.nextPosition = new THREE.Vector3();
    this.speed = 3.2;
    this.health = 25;
    this.isDead = false;
    this.attackCooldown = 0;
    this.moveDir = new THREE.Vector3();
    this.target = options.spawnPos ? options.spawnPos.clone() : new THREE.Vector3(0, 0.4, 0);

    // Create 4x4 Animated Sprite Billboard
    this.sprite = new AnimatedSprite({
      texture: options.texture,
      cols: 4,
      rows: 4,
      width: 1.2,
      height: 1.2,
      fps: 10
    });

    this.mesh = this.sprite.mesh;
    this.mesh.position.copy(options.spawnPos || new THREE.Vector3(0, 0.45, 0));
    this.mesh.position.y = 0.45; // Close to ground
    this.scene.add(this.mesh);

    // Start in walk cycle
    this.sprite.playTrack(0, 3, 12);
  }

  canMoveTo(x, z) {
    const radius = 0.35;
    this.collisionPoint.set(x, 0.45, z);

    for (const entry of this.colliderBounds) {
      const object = entry.object;
      if (!object || !object.visible) continue;
      if (object.userData?.type === 'freezer_door' && object.userData.isOpen) continue;
      if (object.userData?.type === 'freezer_door') entry.box.setFromObject(object);

      if (
        this.collisionPoint.x >= entry.box.min.x - radius &&
        this.collisionPoint.x <= entry.box.max.x + radius &&
        this.collisionPoint.z >= entry.box.min.z - radius &&
        this.collisionPoint.z <= entry.box.max.z + radius &&
        entry.box.max.y >= 0.1 && entry.box.min.y <= 1.0
      ) return false;
    }
    return true;
  }

  moveToward(target, distance) {
    this.moveDir.subVectors(target, this.mesh.position);
    this.moveDir.y = 0;
    const remaining = this.moveDir.length();
    if (remaining <= 0.001) return;

    this.moveDir.multiplyScalar(1 / remaining);
    this.nextPosition.copy(this.mesh.position).addScaledVector(
      this.moveDir,
      Math.min(distance, remaining)
    );

    if (this.canMoveTo(this.nextPosition.x, this.mesh.position.z)) {
      this.mesh.position.x = this.nextPosition.x;
    }
    if (this.canMoveTo(this.mesh.position.x, this.nextPosition.z)) {
      this.mesh.position.z = this.nextPosition.z;
    }
  }

  takeDamage(amount, onKilled) {
    if (this.isDead) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.isDead = true;
      this.sprite.playTrack(12, 15, 8);
      if (this.audio) this.audio.playMonsterHit();
      setTimeout(() => {
        if (this.mesh && this.mesh.parent) {
          this.scene.remove(this.mesh);
        }
        if (onKilled) onKilled(this);
      }, 1200);
    } else {
      if (this.audio) this.audio.playMonsterHit();
    }
  }

  update(delta, playerPos, camera, onAttackPlayer) {
    if (this.isDead || !this.mesh) return;

    this.sprite.update(delta, camera);

    const dist = this.mesh.position.distanceTo(playerPos);
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);

    if (dist < 12.0) {
      // Skitter towards player
      const horizontalDistance = this.mesh.position.distanceTo(playerPos);
      if (horizontalDistance <= 0.001) return;
      this.moveToward(playerPos, this.speed * delta);
      this.mesh.position.y = 0.45;

      if (dist < 1.4 && this.attackCooldown <= 0) {
        // Bite attack
        this.attackCooldown = 1.2;
        this.sprite.playTrack(4, 7, 14);
        if (this.audio) this.audio.playMonsterBite();
        if (onAttackPlayer) onAttackPlayer(15);
        setTimeout(() => {
          if (!this.isDead) this.sprite.playTrack(0, 3, 12);
        }, 500);
      }
    }
  }
}
