import * as THREE from 'three';
import { AnimatedSprite } from './AnimatedSprite.js';

/**
 * MonsterEntity manages the Mutant Chicken / Colonel Anomaly AI,
 * movement, hunting states, sounds, and player collision.
 */
export class MonsterEntity {
  /**
   * @param {Object} options
   * @param {THREE.Scene} options.scene
   * @param {THREE.Texture} options.texture - Keyed spritesheet texture
   * @param {AudioManager} options.audio
   * @param {string} options.type - 'chicken' or 'colonel'
   */
  constructor(options) {
    this.scene = options.scene;
    this.audio = options.audio;
    this.type = options.type || 'chicken';
    this.colliders = options.colliders || [];
    this.colliderBounds = this.colliders.map((object) => ({
      object,
      box: new THREE.Box3().setFromObject(object)
    }));
    this.collisionPoint = new THREE.Vector3();
    this.nextPosition = new THREE.Vector3();

    this.state = 'HIDDEN'; // HIDDEN, PATROL, STALK, CHASE, STUNNED
    this.speed = 3.5;
    this.chaseSpeed = 6.2;
    this.health = 100;
    this.screechCooldown = 0;
    this.stunDuration = 0;
    this.moveDir = new THREE.Vector3();

    // Create billboard sprite (4 columns x 2 rows)
    this.sprite = new AnimatedSprite({
      texture: options.texture,
      cols: 4,
      rows: 2,
      width: this.type === 'chicken' ? 2.8 : 2.5,
      height: this.type === 'chicken' ? 2.8 : 2.5,
      fps: 5
    });

    this.mesh = this.sprite.mesh;
    this.mesh.position.set(12, 0, 14); // Start inside freezer
    this.mesh.visible = false;
    this.scene.add(this.mesh);

    // Waypoints for patrol
    this.waypoints = [
      new THREE.Vector3(12, 0, 14),   // Freezer
      new THREE.Vector3(0, 0, 14),    // Fryer station
      new THREE.Vector3(-8, 0, 14),   // Kitchen rear
      new THREE.Vector3(-12, 0, 4),   // Hallway
      new THREE.Vector3(-4, 0, -4),   // Dining room north
      new THREE.Vector3(4, 0, -4),    // Dining room east
      new THREE.Vector3(0, 0, 2)      // Service counter
    ];
    this.currentWaypointIndex = 0;
  }

  canMoveTo(x, z) {
    const radius = this.type === 'colonel' ? 0.65 : 0.55;
    this.collisionPoint.set(x, 1.0, z);

    for (const entry of this.colliderBounds) {
      const object = entry.object;
      if (!object || !object.visible) continue;
      if (object.userData?.type === 'freezer_door' && object.userData.isOpen) continue;

      // Only doors change during play; refresh dynamic bounds before testing.
      if (object.userData?.type === 'freezer_door') {
        entry.box.setFromObject(object);
      }

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

    this.moveDir.multiplyScalar(1 / remaining);
    const step = Math.min(distance, remaining);
    this.nextPosition.copy(this.mesh.position).addScaledVector(this.moveDir, step);

    // Resolve axes independently so the monster can follow corners instead
    // of getting stuck or phasing through the restaurant walls.
    if (this.canMoveTo(this.nextPosition.x, this.mesh.position.z)) {
      this.mesh.position.x = this.nextPosition.x;
    }
    if (this.canMoveTo(this.mesh.position.x, this.nextPosition.z)) {
      this.mesh.position.z = this.nextPosition.z;
    }
  }

  spawn(position) {
    if (position) this.mesh.position.copy(position);
    this.mesh.visible = true;
    this.state = 'PATROL';
    this.sprite.playTrack(0, 3, 5);
    if (this.audio) this.audio.playMonsterScreech();
  }

  stun(duration = 2.0) {
    this.state = 'STUNNED';
    this.stunDuration = duration;
    this.sprite.flashRed(0.3);
  }

  update(delta, playerPos, camera, flashlightOn) {
    if (!this.mesh.visible) return;

    this.sprite.update(delta, camera);
    if (this.screechCooldown > 0) this.screechCooldown -= delta;

    if (this.state === 'STUNNED') {
      this.stunDuration -= delta;
      if (this.stunDuration <= 0) {
        this.state = 'CHASE';
        this.sprite.playTrack(4, 7, 8); // Switch to attack / lunge row
      }
      return;
    }

    const distToPlayer = this.mesh.position.distanceTo(playerPos);

    // State machine transitions
    if (this.state === 'PATROL' || this.state === 'STALK') {
      // If player is close or shines flashlight at monster, start CHASE
      if (distToPlayer < 9.0 || (distToPlayer < 16.0 && flashlightOn)) {
        this.state = 'CHASE';
        this.sprite.playTrack(4, 7, 8); // Attack screech row
        if (this.screechCooldown <= 0) {
          if (this.audio) this.audio.playMonsterScreech();
          this.screechCooldown = 6.0;
        }
      }
    }

    // AI Movement
    if (this.state === 'PATROL') {
      const targetWp = this.waypoints[this.currentWaypointIndex];
      const distance = this.mesh.position.distanceTo(targetWp);
      if (distance < 0.6) {
        this.currentWaypointIndex = (this.currentWaypointIndex + 1) % this.waypoints.length;
      } else {
        this.moveToward(targetWp, this.speed * delta);
      }
    } else if (this.state === 'CHASE') {
      this.moveDir.subVectors(playerPos, this.mesh.position);
      this.moveDir.y = 0;
      const distance = this.moveDir.length();
      if (distance > 0.001) {
        this.moveToward(playerPos, this.chaseSpeed * delta);
      }

      // Periodical screech
      if (this.screechCooldown <= 0) {
        if (this.audio) this.audio.playMonsterScreech();
        this.screechCooldown = 5.0;
      }
    }
  }
}
