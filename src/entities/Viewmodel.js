/**
 * Viewmodel - polished first-person hands & tools with sway, breathing,
 * inertia, and cinematic action anims. Lowered when hiding.
 */
export class Viewmodel {
  constructor(options) {
    // May be empty until the baked hands atlas finishes loading; render()
    // already no-ops on a missing frame, so there is nothing to wait for.
    this.frames = options.frameCanvases || [];
    this.audio = options.audio;
    this.activeItem = 'flashlight';
    this.isSwinging = false;
    this.swingProgress = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.bobOffset = 0;
    this.needsRender = true;
    this.breathTimer = 0;
    this.hideFactor = 0; // 0 visible, 1 hidden

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

    if (this.activeItem === 'mop' && this.audio) this.audio.playMopSlosh();
    else if (this.activeItem === 'flashlight' && this.audio) this.audio.playFlashlightClick();
    else if (this.activeItem === 'spatula' && this.audio) this.audio.playFootstep(0.3);

    if (callback) callback(this.activeItem);
  }

  update(delta, isMoving, moveSpeed = 1, isCrouching = false) {
    const prevX = this.swayX;
    const prevY = this.swayY;
    this.breathTimer += delta * 2.0;

    // Hide factor lerp
    const targetHide = isCrouching && !isMoving ? 0.15 : 0; // slight lower when crouched
    this.hideFactor += (targetHide - this.hideFactor) * delta * 4;

    if (isMoving) {
      this.bobOffset += delta * 9 * moveSpeed;
      this.swayX += (Math.sin(this.bobOffset * 0.5) * 22 - this.swayX) * 10 * delta;
      this.swayY += (Math.abs(Math.sin(this.bobOffset)) * 24 - this.swayY) * 10 * delta;
    } else {
      const breathX = Math.sin(this.breathTimer * 0.5) * 4;
      const breathY = Math.sin(this.breathTimer) * 6;
      this.swayX += (breathX - this.swayX) * 5 * delta;
      this.swayY += (breathY - this.swayY) * 5 * delta;
    }

    if (this.isSwinging) {
      this.swingProgress += delta * 4.6;
      if (this.swingProgress >= 1.0) {
        this.isSwinging = false;
        this.swingProgress = 0;
      }
    }

    this.needsRender = this.needsRender ||
      Math.abs(this.swayX - prevX) > 0.01 ||
      Math.abs(this.swayY - prevY) > 0.01 ||
      this.isSwinging ||
      this.hideFactor > 0.01;

    if (this.needsRender) {
      this.render();
      if (!isMoving && !this.isSwinging && Math.abs(this.swayX) < 0.05 && Math.abs(this.swayY) < 0.05 && this.hideFactor < 0.01) {
        this.needsRender = false;
      }
    }
  }

  render() {
    const w = this.hudCanvas.width;
    const h = this.hudCanvas.height;
    this.ctx.clearRect(0, 0, w, h);

    let frameIndex = 0;
    if (this.activeItem === 'flashlight') frameIndex = 0;
    else if (this.activeItem === 'mop') frameIndex = this.isSwinging ? (this.swingProgress < 0.5 ? 2 : 3) : 1;
    else if (this.activeItem === 'spatula') frameIndex = this.isSwinging ? (this.swingProgress < 0.5 ? 5 : 6) : 4;
    else if (this.activeItem === 'oil') frameIndex = 7;

    const frame = this.frames[frameIndex];
    if (!frame) return;

    const baseScale = Math.min(w / 1100, h / 720) * 0.72;
    const drawW = Math.round(480 * baseScale);
    const drawH = Math.round(480 * baseScale);

    let posX = Math.round(w - drawW * 0.82 + this.swayX);
    let posY = Math.round(h - drawH * 0.90 + this.swayY + this.hideFactor * drawH * 0.35);

    if (this.activeItem === 'mop') {
      posX = Math.round(w / 2 - drawW * 0.46 + this.swayX);
      posY = Math.round(h - drawH * 0.88 + this.swayY + this.hideFactor * drawH * 0.35);
    } else if (this.activeItem === 'spatula' || this.activeItem === 'oil') {
      posX = Math.round(w - drawW * 0.80 + this.swayX);
    }

    if (this.isSwinging) {
      const swingArc = Math.sin(this.swingProgress * Math.PI);
      posX -= Math.round(swingArc * 52 * baseScale);
      posY += Math.round(swingArc * 36 * baseScale);
    }

    this.ctx.drawImage(frame, posX, posY, drawW, drawH);
  }
}
