/**
 * Viewmodel handles retro 1st-person employee hands and tools.
 * Renders in a dynamically scaled, responsive HUD canvas overlay with
 * natural weapon sway, breathing inertia, and action animations.
 */
export class Viewmodel {
  /**
   * @param {Object} options
   * @param {HTMLCanvasElement[]} options.frameCanvases - Sliced keyed frames (512x512 each)
   * @param {AudioManager} options.audio
   */
  constructor(options) {
    this.frames = options.frameCanvases;
    this.audio = options.audio;

    this.activeItem = 'flashlight'; // 'flashlight', 'mop', 'spatula', 'oil'
    this.isSwinging = false;
    this.swingProgress = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.bobOffset = 0;
    this.needsRender = true;
    this.breathTimer = 0;

    // Create responsive fullscreen viewmodel canvas overlay
    this.hudCanvas = document.createElement('canvas');
    this.hudCanvas.id = 'viewmodel-canvas';
    this.hudCanvas.style.position = 'absolute';
    this.hudCanvas.style.top = '0';
    this.hudCanvas.style.left = '0';
    this.hudCanvas.style.width = '100%';
    this.hudCanvas.style.height = '100%';
    this.hudCanvas.style.pointerEvents = 'none';
    this.hudCanvas.style.zIndex = '20';
    this.hudCanvas.style.imageRendering = 'pixelated';

    document.body.appendChild(this.hudCanvas);
    this.ctx = this.hudCanvas.getContext('2d');

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  resize() {
    this.hudCanvas.width = window.innerWidth;
    this.hudCanvas.height = window.innerHeight;
    this.ctx.imageSmoothingEnabled = false;
  }

  setItem(itemName) {
    this.activeItem = itemName;
    this.needsRender = true;
  }

  triggerAction(callback) {
    if (this.isSwinging) return;
    this.isSwinging = true;
    this.swingProgress = 0;
    this.needsRender = true;

    if (this.activeItem === 'mop') {
      if (this.audio) this.audio.playMopSlosh();
    } else if (this.activeItem === 'flashlight') {
      if (this.audio) this.audio.playFlashlightClick();
    } else if (this.activeItem === 'spatula') {
      if (this.audio) this.audio.playFootstep();
    }

    if (callback) callback(this.activeItem);
  }

  update(delta, isMoving, moveSpeed = 1) {
    const previousSwayX = this.swayX;
    const previousSwayY = this.swayY;
    this.breathTimer += delta * 2.0;

    // Movement Bob & Sway
    if (isMoving) {
      this.bobOffset += delta * 9 * moveSpeed;
      this.swayX += (Math.sin(this.bobOffset * 0.5) * 22 - this.swayX) * 10 * delta;
      this.swayY += (Math.abs(Math.sin(this.bobOffset)) * 24 - this.swayY) * 10 * delta;
    } else {
      // Idle breathing bob
      const breathX = Math.sin(this.breathTimer * 0.5) * 4;
      const breathY = Math.sin(this.breathTimer) * 6;
      this.swayX += (breathX - this.swayX) * 5 * delta;
      this.swayY += (breathY - this.swayY) * 5 * delta;
    }

    // Action animation timer
    if (this.isSwinging) {
      this.swingProgress += delta * 4.5; // fast 0.22s action
      if (this.swingProgress >= 1.0) {
        this.isSwinging = false;
        this.swingProgress = 0;
      }
    }

    this.needsRender = this.needsRender ||
      Math.abs(this.swayX - previousSwayX) > 0.01 ||
      Math.abs(this.swayY - previousSwayY) > 0.01 ||
      this.isSwinging;

    if (this.needsRender) {
      this.render();
      if (!isMoving && !this.isSwinging && Math.abs(this.swayX) < 0.05 && Math.abs(this.swayY) < 0.05) {
        this.needsRender = false;
      }
    }
  }

  render() {
    const w = this.hudCanvas.width;
    const h = this.hudCanvas.height;
    this.ctx.clearRect(0, 0, w, h);

    let frameIndex = 0;
    if (this.activeItem === 'flashlight') {
      frameIndex = 0;
    } else if (this.activeItem === 'mop') {
      if (this.isSwinging) {
        frameIndex = this.swingProgress < 0.5 ? 2 : 3;
      } else {
        frameIndex = 1;
      }
    } else if (this.activeItem === 'spatula') {
      if (this.isSwinging) {
        frameIndex = this.swingProgress < 0.5 ? 5 : 6;
      } else {
        frameIndex = 4;
      }
    } else if (this.activeItem === 'oil') {
      // The last employee-hands frame is the boiling-oil pitcher pose.
      frameIndex = 7;
    }

    const frame = this.frames[frameIndex];
    if (!frame) return;

    // Calculate responsive viewmodel scale based on screen height
    const baseScale = Math.min(w / 1100, h / 720) * 0.72;
    const drawW = Math.round(480 * baseScale);
    const drawH = Math.round(480 * baseScale);

    // Anchor: Bottom Right with natural inward slant
    let posX = Math.round(w - drawW * 0.82 + this.swayX);
    let posY = Math.round(h - drawH * 0.90 + this.swayY);

    if (this.activeItem === 'mop') {
      // Center two-handed mop nicely in front of player
      posX = Math.round(w / 2 - drawW * 0.46 + this.swayX);
      posY = Math.round(h - drawH * 0.88 + this.swayY);
    } else if (this.activeItem === 'spatula' || this.activeItem === 'oil') {
      posX = Math.round(w - drawW * 0.80 + this.swayX);
    }

    if (this.isSwinging) {
      const swingArc = Math.sin(this.swingProgress * Math.PI);
      posX -= Math.round(swingArc * 50 * baseScale);
      posY += Math.round(swingArc * 35 * baseScale);
    }

    this.ctx.drawImage(frame, posX, posY, drawW, drawH);
  }
}
