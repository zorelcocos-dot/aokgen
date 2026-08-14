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
    this.flashTimer = 0;

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
    // Tracks are authored against the final art. While a placeholder sheet
    // with fewer rows is loaded, clamp instead of walking off the atlas and
    // sampling garbage UVs.
    const last = this.cols * this.rows - 1;
    this.startFrame = Math.min(Math.max(0, start), last);
    this.endFrame = Math.min(Math.max(this.startFrame, end), last);
    start = this.startFrame;
    end = this.endFrame;
    this.fps = fps;
    this.loop = loop;
    if (this.currentFrame < start || this.currentFrame > end) {
      this.currentFrame = start;
      this.setFrame(start);
    }
    this.isPlaying = true;
  }

  /**
   * Re-lays-out the UV grid when the underlying image is swapped for art with
   * a different frame layout (e.g. a 4x2 placeholder replaced by 4x4 art).
   * Tracks are stored as flat frame indices, so they are remapped by row.
   */
  setGrid(cols, rows) {
    if (this.cols === cols && this.rows === rows) return;
    const oldCols = this.cols;
    const startRow = Math.floor(this.startFrame / oldCols);
    const endRow = Math.floor(this.endFrame / oldCols);
    this.cols = cols;
    this.rows = rows;
    // Clamp the active track into the new grid instead of letting it point at
    // frames that no longer exist.
    this.startFrame = Math.min(startRow, rows - 1) * cols;
    this.endFrame = Math.min(Math.min(endRow, rows - 1) * cols + (cols - 1), cols * rows - 1);
    this.texture.repeat.set(1 / cols, 1 / rows);
    this.setFrame(this.startFrame);
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
    // Damage flash runs on the frame clock, so a restart or a dispose can
    // never leave a sprite stuck red by a pending timer.
    if (this.flashTimer > 0) {
      this.flashTimer -= delta;
      if (this.flashTimer <= 0) this.material.color.setHex(0xffffff);
    }

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
    this.flashTimer = Math.max(this.flashTimer, duration);
  }

  /** Frees the cloned texture, geometry and material. */
  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
