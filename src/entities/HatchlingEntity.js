import * as THREE from 'three';
import { AnimatedSprite } from './AnimatedSprite.js';

/**
 * HatchlingEntity - Polished skittering spider-chicken
 * - Responds to noise, patrols small territory, hides under tables
 * - Hearing-based, scurries, hops when attacking
 */

export class HatchlingEntity {
  constructor(options) {
    this.scene = options.scene;
    this.audio = options.audio;
    this.colliders = options.colliders || [];
    this.colliderBounds = this.colliders.map(o => ({ object: o, box: new THREE.Box3().setFromObject(o) }));
    this.collisionPoint = new THREE.Vector3();
    this.nextPosition = new THREE.Vector3();
    this.moveDir = new THREE.Vector3();

    this.speed = 3.0 + Math.random() * 0.8;
    this.health = 28;
    this.isDead = false;
    this.attackCooldown = Math.random() * 1.2;
    this.target = options.spawnPos ? options.spawnPos.clone() : new THREE.Vector3();
    this.home = this.target.clone();
    this.investigatePos = null;
    this.state = 'PATROL';
    this.wanderAngle = Math.random() * Math.PI * 2;

    this.hearing = 11;

    this.sprite = new AnimatedSprite({
      texture: options.texture,
      cols: 4,
      rows: 4,
      width: 1.05,
      height: 1.05,
      fps: 11
    });
    this.mesh = this.sprite.mesh;
    this.mesh.position.copy(options.spawnPos || new THREE.Vector3(0, 0.45, 0));
    this.mesh.position.y = 0.45;
    this.scene.add(this.mesh);
    this.sprite.playTrack(0, 3, 12);
  }

  canMoveTo(x, z) {
    const radius = 0.32;
    this.collisionPoint.set(x, 0.45, z);
    for (const entry of this.colliderBounds) {
      const obj = entry.object;
      if (!obj?.visible) continue;
      if (obj.userData?.type === 'freezer_door' && obj.userData.isOpen) continue;
      if (obj.userData?.type === 'freezer_door') entry.box.setFromObject(obj);
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
    this.moveDir.normalize();
    this.nextPosition.copy(this.mesh.position).addScaledVector(this.moveDir, Math.min(distance, remaining));
    if (this.canMoveTo(this.nextPosition.x, this.mesh.position.z)) this.mesh.position.x = this.nextPosition.x;
    if (this.canMoveTo(this.mesh.position.x, this.nextPosition.z)) this.mesh.position.z = this.nextPosition.z;
  }

  hearNoise(pos, level = 0.5) {
    if (this.isDead) return;
    const d = this.mesh.position.distanceTo(pos);
    if (d > this.hearing * (0.35 + level * 0.65)) return;
    this.investigatePos = pos.clone();
    this.state = 'INVESTIGATE';
  }

  takeDamage(amount) {
    if (this.isDead) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.isDead = true;
      this.sprite.playTrack(12, 15, 8, false);
      this.audio?.playMonsterHit();
      setTimeout(() => {
        if (this.mesh?.parent) this.scene.remove(this.mesh);
      }, 1100);
    } else {
      this.audio?.playMonsterHit();
      this.sprite.flashRed(0.18);
    }
  }

  update(delta, playerPos, camera, onAttackPlayer) {
    if (this.isDead || !this.mesh) return;

    this.sprite.update(delta, camera);
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);

    const dist = this.mesh.position.distanceTo(playerPos);
    const homeDist = this.mesh.position.distanceTo(this.home);

    // State handling
    if (this.state === 'PATROL') {
      this.wanderAngle += delta * 0.8;
      // Small wander around home
      if (Math.random() < 0.015) {
        this.target.set(
          this.home.x + Math.cos(this.wanderAngle) * (2 + Math.random() * 2.5),
          0.45,
          this.home.z + Math.sin(this.wanderAngle) * (2 + Math.random() * 2.5)
        );
      }
      this.moveToward(this.target, this.speed * delta * 0.45);
      this.mesh.position.y = 0.45;

      if (dist < 9.5) {
        this.state = 'CHASE';
      }

    } else if (this.state === 'INVESTIGATE') {
      if (!this.investigatePos) {
        this.state = 'PATROL';
        return;
      }
      this.moveToward(this.investigatePos, this.speed * delta);
      if (this.mesh.position.distanceTo(this.investigatePos) < 1.0) {
        this.state = 'PATROL';
        this.investigatePos = null;
      }
      if (dist < 7) this.state = 'CHASE';

    } else if (this.state === 'CHASE') {
      // Chase player
      this.moveToward(playerPos, this.speed * delta);
      this.mesh.position.y = 0.45;

      if (dist < 1.35 && this.attackCooldown <= 0) {
        this.attackCooldown = 1.25;
        this.sprite.playTrack(4, 7, 15);
        this.audio?.playMonsterBite();
        if (onAttackPlayer) onAttackPlayer(14);
        setTimeout(() => { if (!this.isDead) this.sprite.playTrack(0, 3, 13); }, 480);
      }

      if (dist > 14 || homeDist > 18) {
        this.state = 'RETURN';
      }
    } else if (this.state === 'RETURN') {
      this.moveToward(this.home, this.speed * delta * 0.85);
      if (this.mesh.position.distanceTo(this.home) < 1.0) {
        this.state = 'PATROL';
      }
    }
  }
}
