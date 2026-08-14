import * as THREE from 'three';

/**
 * AnimatedSprite renders retro billboard sprites in 3D Three.js space.
 * Uses a texture generated from keyed canvases with UV frame stepping.
 */
export class AnimatedSprite {
  /**
   * @param {Object} config
   * @param {THREE.Texture} config.texture - Keyed texture with UV wrapping
   * @param {number} config.cols - Total frame columns (e.g. 4)
   * @param {number} config.rows - Total frame rows (e.g. 1)
   * @param {number} config.width - 3D world width
   * @param {number} config.height - 3D world height
   * @param {number} [config.fps=6] - Animation speed
   * @param {boolean} [config.lockY=true] - Cylindrical billboard (keeps upright)
   */
  constructor(config) {
    this.cols = config.cols || 4;
    this.rows = config.rows || 1;
    this.fps = config.fps || 6;
    this.lockY = config.lockY !== false;

    this.startFrame = 0;
    this.endFrame = (this.cols * this.rows) - 1;
    this.currentFrame = 0;
    this.elapsedTime = 0;
    this.isPlaying = true;
    this.loop = true;

    // Clone texture so multiple instances can have independent UV offsets
    this.texture = config.texture.clone();
    this.texture.needsUpdate = true;
    this.texture.repeat.set(1 / this.cols, 1 / this.rows);
    this.cameraPosition = new THREE.Vector3();

    // Plane geometry
    const geometry = new THREE.PlaneGeometry(config.width || 2.4, config.height || 2.4);

    // Billboard characters do not need PBR lighting. An unlit material avoids
    // adding their transparent pixels to the expensive multi-light shader.
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      alphaTest: 0.15,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;

    // Position mesh pivot at bottom center
    geometry.translate(0, (config.height || 2.4) / 2, 0);

    this.setFrame(0);
  }

  playTrack(start, end, fps = 6, loop = true) {
    this.startFrame = start;
    this.endFrame = end;
    this.fps = fps;
    this.loop = loop;
    if (this.currentFrame < start || this.currentFrame > end) {
      this.currentFrame = start;
      this.setFrame(start);
    }
    this.isPlaying = true;
  }

  setFrame(frameIndex) {
    this.currentFrame = frameIndex;
    const col = this.currentFrame % this.cols;
    const row = Math.floor(this.currentFrame / this.cols);

    // Calculate UV offsets
    this.texture.offset.x = col / this.cols;
    // In Three.js UV Y is flipped from bottom
    this.texture.offset.y = (this.rows - 1 - row) / this.rows;
  }

  update(delta, camera) {
    // Billboarding: Rotate to face camera
    if (camera && this.mesh) {
      if (this.lockY) {
        // Cylindrical billboard (only rotate around Y axis)
        this.cameraPosition.copy(camera.position);
        this.cameraPosition.y = this.mesh.position.y;
        this.mesh.lookAt(this.cameraPosition);
      } else {
        this.mesh.quaternion.copy(camera.quaternion);
      }
    }

    // Animation frame progression
    if (this.isPlaying) {
      this.elapsedTime += delta;
      const frameDuration = 1 / this.fps;

      if (this.elapsedTime >= frameDuration) {
        this.elapsedTime %= frameDuration;
        let nextFrame = this.currentFrame + 1;

        if (nextFrame > this.endFrame) {
          if (this.loop) {
            nextFrame = this.startFrame;
          } else {
            nextFrame = this.endFrame;
            this.isPlaying = false;
          }
        }
        this.setFrame(nextFrame);
      }
    }
  }

  flashRed(duration = 0.2) {
    this.material.color.setHex(0xff2222);
    setTimeout(() => {
      if (this.material) this.material.color.setHex(0xffffff);
    }, duration * 1000);
  }
}
