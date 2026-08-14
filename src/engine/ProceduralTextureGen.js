import * as THREE from 'three';

/**
 * ProceduralTextureGen creates high-detail retro sprite sheets on solid bright pink (#FF00FF)
 * and optimized PBR texture sets (Albedo, Normal, Roughness, Metalness).
 * Every sprite is mathematically centered in its uniform grid cell for clean slicing.
 */
export class ProceduralTextureGen {
  // ==========================================
  // 1. MUTANT CHICKEN CHIMERA (4x2 Grid = 8 Frames)
  // Row 0: Walk & Stalk Cycle (4 frames)
  // Row 1: Screech & Lunge Attack Cycle (4 frames)
  // Background: Solid #FF00FF Pink Chroma Key
  // ==========================================
  static generateChickenMonsterSheet() {
    const frameW = 256;
    const frameH = 256;
    const cols = 4;
    const rows = 2;
    const canvas = document.createElement('canvas');
    canvas.width = frameW * cols;
    canvas.height = frameH * rows;
    const ctx = canvas.getContext('2d');

    // Fill background with bright magenta/pink #FF00FF
    ctx.fillStyle = '#FF00FF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const frameIndex = r * cols + c;
        const ox = c * frameW;
        const oy = r * frameH;
        const cx = ox + frameW / 2;
        const cy = oy + frameH / 2 + 10;

        const isAttackRow = r === 1;

        // Animation calculations
        const walkCycle = Math.sin(c * Math.PI / 2);
        const bob = isAttackRow ? (c === 1 ? -18 : (c === 2 ? 14 : 0)) : walkCycle * 8;
        const stride = isAttackRow ? (c === 2 ? 26 : 8) : walkCycle * 22;
        const wingFlap = isAttackRow ? (c === 0 ? 35 : (c === 1 ? 45 : 15)) : Math.cos(c * Math.PI / 2) * 16;
        const mouthGape = isAttackRow ? (c === 1 ? 28 : (c === 2 ? 20 : 10)) : (c === 3 ? 14 : 4);

        // --- Ground Shadow ---
        ctx.fillStyle = '#3a0212';
        ctx.beginPath();
        ctx.ellipse(cx, oy + frameH - 24, 45, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        // --- Back Wing / Bone Limb ---
        ctx.fillStyle = '#7a1515';
        ctx.beginPath();
        ctx.ellipse(cx - 38 + (wingFlap * 0.7), cy - 20 + bob, 28, 48, -0.4, 0, Math.PI * 2);
        ctx.fill();

        // Feather bone spurs on back wing
        ctx.strokeStyle = '#4a0000';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cx - 50 + (wingFlap * 0.7), cy - 10 + bob);
        ctx.lineTo(cx - 75 + (wingFlap * 0.9), cy - 25 + bob);
        ctx.stroke();

        // --- Back Raptor Leg ---
        ctx.strokeStyle = '#5a4312';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - 20, cy + 30 + bob);
        ctx.lineTo(cx - 28 - stride, cy + 70);
        ctx.lineTo(cx - 48 - stride, cy + 92);
        ctx.stroke();

        // Back Talon Claws
        ctx.fillStyle = '#1c1305';
        ctx.beginPath();
        ctx.moveTo(cx - 48 - stride, cy + 92);
        ctx.lineTo(cx - 65 - stride, cy + 96);
        ctx.lineTo(cx - 52 - stride, cy + 86);
        ctx.fill();

        // --- Grotesque Plucked Torso with Exposed Ribs ---
        // Main flesh body
        ctx.fillStyle = '#b91c1c';
        ctx.beginPath();
        ctx.ellipse(cx, cy + bob, 42, 54, 0, 0, Math.PI * 2);
        ctx.fill();

        // Raw blistered skin texture & highlights
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.ellipse(cx - 12, cy - 10 + bob, 24, 34, 0, 0, Math.PI * 2);
        ctx.fill();

        // Plucked feather follicles
        ctx.fillStyle = '#7f1d1d';
        for (let p = 0; p < 18; p++) {
          const px = cx - 25 + ((p * 17) % 50);
          const py = cy - 25 + ((p * 23) % 50) + bob;
          ctx.fillRect(px, py, 3, 3);
        }

        // Exposed Ivory Ribcage & Organs
        ctx.strokeStyle = '#fef3c7';
        ctx.lineWidth = 5;
        for (let rib = 0; rib < 5; rib++) {
          const ry = cy - 16 + rib * 11 + bob;
          ctx.beginPath();
          ctx.arc(cx + 4, ry, 20, -0.6, 0.6);
          ctx.stroke();
        }

        // Black rotting center spine
        ctx.fillStyle = '#1f0404';
        ctx.fillRect(cx + 12, cy - 20 + bob, 6, 45);

        // --- Front Raptor Leg & Talons ---
        ctx.strokeStyle = '#854d0e';
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.moveTo(cx + 18, cy + 30 + bob);
        ctx.lineTo(cx + 24 + stride, cy + 70);
        ctx.lineTo(cx + 46 + stride, cy + 92);
        ctx.stroke();

        // Front Razor Talons
        ctx.fillStyle = '#1a0e05';
        ctx.beginPath();
        ctx.moveTo(cx + 46 + stride, cy + 92);
        ctx.lineTo(cx + 68 + stride, cy + 95);
        ctx.lineTo(cx + 50 + stride, cy + 86);
        ctx.fill();

        // --- Long Muscular Distorted Neck ---
        ctx.fillStyle = '#991b1b';
        ctx.beginPath();
        ctx.ellipse(cx + 24, cy - 44 + bob, 18, 30, 0.4, 0, Math.PI * 2);
        ctx.fill();

        // --- Head & Crest ---
        const hx = cx + 36;
        const hy = cy - 64 + bob;

        ctx.fillStyle = '#c53030';
        ctx.beginPath();
        ctx.arc(hx, hy, 26, 0, Math.PI * 2);
        ctx.fill();

        // Bleeding Crimson Comb
        ctx.fillStyle = '#5c0911';
        ctx.beginPath();
        ctx.arc(hx - 10, hy - 26, 12, 0, Math.PI * 2);
        ctx.arc(hx + 4, hy - 30, 10, 0, Math.PI * 2);
        ctx.arc(hx + 16, hy - 24, 9, 0, Math.PI * 2);
        ctx.fill();

        // Pulsing Throbbing Wattle
        ctx.beginPath();
        ctx.ellipse(hx + 8, hy + 22 + mouthGape / 2, 10, 20, 0.2, 0, Math.PI * 2);
        ctx.fill();

        // Jagged Bone Beak
        ctx.fillStyle = '#ca8a04';
        // Upper Beak
        ctx.beginPath();
        ctx.moveTo(hx + 14, hy - 14);
        ctx.lineTo(hx + 56, hy - 4);
        ctx.lineTo(hx + 14, hy + 4);
        ctx.closePath();
        ctx.fill();

        // Lower Beak
        ctx.beginPath();
        ctx.moveTo(hx + 12, hy + 6 + mouthGape);
        ctx.lineTo(hx + 52, hy + 16 + mouthGape);
        ctx.lineTo(hx + 10, hy + 20 + mouthGape);
        ctx.closePath();
        ctx.fill();

        // Sharp Human Teeth in Beak
        ctx.fillStyle = '#ffffff';
        for (let t = 0; t < 6; t++) {
          ctx.fillRect(hx + 18 + t * 6, hy - 4, 3, 5);
          if (mouthGape > 0) {
            ctx.fillRect(hx + 18 + t * 6, hy + 4 + mouthGape, 3, 5);
          }
        }

        // Bulging Bloodshot Yellow Eye with Slit Pupil
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(hx + 8, hy - 10, 9, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(hx + 10, hy - 10, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#000000';
        ctx.fillRect(hx + 10, hy - 15, 2, 10); // Slit pupil

        // --- Front Wing / Claw Arm ---
        ctx.fillStyle = '#991b1b';
        ctx.beginPath();
        ctx.ellipse(cx + 12 - wingFlap, cy - 8 + bob, 26, 42, 0.6, 0, Math.PI * 2);
        ctx.fill();

        // Razor Bone Claws on wing tip
        ctx.strokeStyle = '#fef3c7';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cx + 26 - wingFlap, cy + 18 + bob);
        ctx.lineTo(cx + 42 - wingFlap, cy + 34 + bob);
        ctx.moveTo(cx + 16 - wingFlap, cy + 24 + bob);
        ctx.lineTo(cx + 28 - wingFlap, cy + 44 + bob);
        ctx.stroke();

        // Attack Blood Swipe Trail (Row 1, Frame 2)
        if (isAttackRow && c === 2) {
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
          ctx.lineWidth = 8;
          ctx.beginPath();
          ctx.arc(cx + 35, cy, 65, -0.4, 0.8);
          ctx.stroke();
        }

        // Blood Drip Droplets
        ctx.fillStyle = '#7f1d1d';
        ctx.fillRect(hx + 45, hy + 10 + ((frameIndex * 19) % 40), 4, 6);
        ctx.fillRect(cx - 10, cy + 25 + ((frameIndex * 13) % 40), 3, 5);
      }
    }

    return canvas;
  }

  // ==========================================
  // 2. THE COLONEL STALKER (4x2 Grid = 8 Frames)
  // Row 0: Creepy Stalk & Walk (4 frames)
  // Row 1: Meat Cleaver Strike & Lunge (4 frames)
  // Background: Solid #FF00FF Pink Chroma Key
  // ==========================================
  static generateColonelStalkerSheet() {
    const frameW = 256;
    const frameH = 256;
    const cols = 4;
    const rows = 2;
    const canvas = document.createElement('canvas');
    canvas.width = frameW * cols;
    canvas.height = frameH * rows;
    const ctx = canvas.getContext('2d');

    // Fill background with bright magenta/pink #FF00FF
    ctx.fillStyle = '#FF00FF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ox = c * frameW;
        const oy = r * frameH;
        const cx = ox + frameW / 2;
        const cy = oy + frameH / 2 + 10;

        const isAttack = r === 1;
        const bob = Math.sin(c * Math.PI / 2) * 6;
        const stride = Math.sin(c * Math.PI / 2) * 16;
        const cleaverAngle = isAttack
          ? (c === 0 ? -1.8 : (c === 1 ? -0.4 : (c === 2 ? 0.9 : -0.2)))
          : (c === 3 ? -0.6 : (c === 1 ? 0.3 : 0));

        // Ground shadow
        ctx.fillStyle = '#220011';
        ctx.beginPath();
        ctx.ellipse(cx, oy + frameH - 20, 36, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        // Black dress trousers
        ctx.fillStyle = '#18181b';
        ctx.fillRect(cx - 20 - stride, cy + 36 + bob, 15, 45);
        ctx.fillRect(cx + 6 + stride, cy + 36 + bob, 15, 45);

        // Polished Black Shoes
        ctx.fillStyle = '#09090b';
        ctx.fillRect(cx - 26 - stride, cy + 76 + bob, 22, 10);
        ctx.fillRect(cx + 6 + stride, cy + 76 + bob, 22, 10);

        // White Double-Breasted Suit Jacket
        ctx.fillStyle = '#f4f4f5';
        ctx.beginPath();
        ctx.roundRect(cx - 30, cy - 24 + bob, 60, 68, 8);
        ctx.fill();

        // Lapels & Buttons
        ctx.strokeStyle = '#d4d4d8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - 18, cy - 24 + bob);
        ctx.lineTo(cx, cy + 6 + bob);
        ctx.lineTo(cx + 18, cy - 24 + bob);
        ctx.stroke();

        // Black String Bowtie
        ctx.fillStyle = '#18181b';
        ctx.fillRect(cx - 10, cy - 18 + bob, 20, 5);
        ctx.fillRect(cx - 6, cy - 13 + bob, 4, 18);
        ctx.fillRect(cx + 2, cy - 13 + bob, 4, 18);

        // Blood Splattered Apron
        ctx.fillStyle = '#e4e4e7';
        ctx.fillRect(cx - 22, cy + 6 + bob, 44, 38);

        // Blood Drenches & Grease on Apron
        ctx.fillStyle = '#991b1b';
        ctx.beginPath();
        ctx.arc(cx - 8, cy + 16 + bob, 10, 0, Math.PI * 2);
        ctx.arc(cx + 12, cy + 26 + bob, 12, 0, Math.PI * 2);
        ctx.arc(cx - 14, cy + 34 + bob, 7, 0, Math.PI * 2);
        ctx.fill();

        // --- Head, Beard, Glasses ---
        // White hair
        ctx.fillStyle = '#fafafa';
        ctx.beginPath();
        ctx.arc(cx, cy - 48 + bob, 28, 0, Math.PI * 2);
        ctx.fill();

        // Creepy pale wrinkled skin
        ctx.fillStyle = '#fde68a';
        ctx.beginPath();
        ctx.ellipse(cx, cy - 44 + bob, 20, 24, 0, 0, Math.PI * 2);
        ctx.fill();

        // White Goatee Beard
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(cx - 12, cy - 32 + bob);
        ctx.lineTo(cx, cy - 12 + bob);
        ctx.lineTo(cx + 12, cy - 32 + bob);
        ctx.fill();

        // Mustache
        ctx.beginPath();
        ctx.ellipse(cx - 10, cy - 38 + bob, 12, 5, -0.2, 0, Math.PI * 2);
        ctx.ellipse(cx + 10, cy - 38 + bob, 12, 5, 0.2, 0, Math.PI * 2);
        ctx.fill();

        // Horn-Rimmed Glasses
        ctx.strokeStyle = '#18181b';
        ctx.lineWidth = 3;
        ctx.strokeRect(cx - 18, cy - 52 + bob, 14, 10);
        ctx.strokeRect(cx + 4, cy - 52 + bob, 14, 10);
        ctx.beginPath();
        ctx.moveTo(cx - 4, cy - 48 + bob);
        ctx.lineTo(cx + 4, cy - 48 + bob);
        ctx.stroke();

        // Glowing Sinister Red Eyes in Darkness
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(cx - 13, cy - 49 + bob, 5, 5);
        ctx.fillRect(cx + 8, cy - 49 + bob, 5, 5);

        // Wide Evil Grin with Sharp Teeth
        ctx.fillStyle = '#450a0a';
        ctx.beginPath();
        ctx.arc(cx, cy - 32 + bob, 12, 0.2, Math.PI - 0.2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        for (let gt = 0; gt < 4; gt++) {
          ctx.fillRect(cx - 8 + gt * 4, cy - 31 + bob, 3, 4);
        }

        // --- Meat Cleaver Weapon in Hand ---
        ctx.save();
        ctx.translate(cx + 36, cy - 4 + bob);
        ctx.rotate(cleaverAngle);

        // Wooden handle
        ctx.fillStyle = '#78350f';
        ctx.fillRect(-5, 0, 10, 26);

        // Heavy Stainless Steel Cleaver Blade
        ctx.fillStyle = '#e4e4e7';
        ctx.fillRect(-18, -38, 30, 38);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-22, -38, 4, 38); // Sharp cutting bevel

        // Blood Drenched Blade Edge
        ctx.fillStyle = '#991b1b';
        ctx.beginPath();
        ctx.moveTo(-22, -38);
        ctx.lineTo(6, -38);
        ctx.lineTo(-6, -18);
        ctx.lineTo(-22, -12);
        ctx.fill();

        ctx.restore();

        // Cleaver Strike Trail on Attack Frame (Row 1, Frame 1)
        if (isAttack && c === 1) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(cx + 36, cy + bob, 50, -1.8, 0.4);
          ctx.stroke();
        }
      }
    }

    return canvas;
  }

  // ==========================================
  // 3. EMPLOYEE 1ST PERSON HANDS & TOOLS (4x2 Grid = 8 Frames)
  // Resolution: 512x512 per frame (Total Canvas: 2048 x 1024)
  // Background: Solid #FF00FF Pink Chroma Key
  // ==========================================
  static generateEmployeeHandsSheet() {
    const frameW = 512;
    const frameH = 512;
    const cols = 4;
    const rows = 2;
    const canvas = document.createElement('canvas');
    canvas.width = frameW * cols;
    canvas.height = frameH * rows;
    const ctx = canvas.getContext('2d');

    // Fill background with bright magenta/pink #FF00FF
    ctx.fillStyle = '#FF00FF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Helper: Draw detailed anatomical employee arm & sleeve
    const drawSleeve = (startX, startY, endX, endY, width = 110) => {
      // Dark red fast-food uniform fabric
      const grad = ctx.createLinearGradient(startX, startY, endX, endY);
      grad.addColorStop(0, '#5a0a0a');
      grad.addColorStop(0.3, '#991b1b');
      grad.addColorStop(0.7, '#b91c1c');
      grad.addColorStop(1, '#7f1d1d');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(startX - width * 0.6, startY);
      ctx.lineTo(startX + width * 0.6, startY);
      ctx.lineTo(endX + width * 0.45, endY);
      ctx.lineTo(endX - width * 0.45, endY);
      ctx.closePath();
      ctx.fill();

      // Fabric wrinkles & shadows
      ctx.strokeStyle = '#450a0a';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(startX - width * 0.2, startY - 40);
      ctx.quadraticCurveTo(endX - 10, endY + 40, endX + 15, endY + 10);
      ctx.stroke();

      // White inner shirt cuff
      ctx.fillStyle = '#e4e4e7';
      ctx.beginPath();
      ctx.ellipse(endX, endY, width * 0.46, 14, -0.2, 0, Math.PI * 2);
      ctx.fill();
    };

    // Helper: Draw detailed hand with knuckles, palm, and skin tones
    const drawHand = (hx, hy, angle = 0, scale = 1.0, isLeft = false) => {
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(angle);
      ctx.scale(isLeft ? -scale : scale, scale);

      // Palm base
      const palmGrad = ctx.createRadialGradient(-10, -10, 5, 0, 0, 60);
      palmGrad.addColorStop(0, '#f8cfb5');
      palmGrad.addColorStop(0.6, '#e0a07a');
      palmGrad.addColorStop(1, '#b86e49');
      ctx.fillStyle = palmGrad;

      ctx.beginPath();
      ctx.roundRect(-45, -35, 90, 80, 20);
      ctx.fill();

      // Palm creases & knuckle lines
      ctx.strokeStyle = '#9c5535';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -5, 30, 0.4, 2.2);
      ctx.moveTo(-25, 10);
      ctx.lineTo(15, 25);
      ctx.stroke();

      // 4 Fingers gripping
      const fingerColors = ['#f4c2a5', '#ebb394', '#dfa180', '#cb8c6a'];
      for (let f = 0; f < 4; f++) {
        const fx = -32 + f * 22;
        const fy = -45 - (f === 1 || f === 2 ? 8 : 0);

        ctx.fillStyle = fingerColors[f];
        ctx.beginPath();
        ctx.roundRect(fx, fy, 20, 48, 10);
        ctx.fill();

        // Knuckle shading
        ctx.fillStyle = '#b86e49';
        ctx.beginPath();
        ctx.arc(fx + 10, fy + 14, 6, 0, Math.PI * 2);
        ctx.fill();

        // Fingernails
        ctx.fillStyle = '#ffeedd';
        ctx.beginPath();
        ctx.roundRect(fx + 3, fy + 2, 14, 10, 4);
        ctx.fill();
      }

      // Thumb
      ctx.fillStyle = '#f8cfb5';
      ctx.beginPath();
      ctx.ellipse(38, 10, 16, 32, 0.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffeedd';
      ctx.beginPath();
      ctx.roundRect(42, -5, 12, 12, 4);
      ctx.fill();

      ctx.restore();
    };

    // ----------------------------------------------------
    // FRAME 0 (R0, C0): Heavy Duty Tactical Flashlight
    // ----------------------------------------------------
    {
      const ox = 0;
      const oy = 0;
      const cx = ox + frameW * 0.62;
      const cy = oy + frameH * 0.68;

      // Arm from bottom right
      drawSleeve(ox + frameW * 0.85, oy + frameH + 40, cx + 20, cy + 40, 140);

      // Heavy Tactical Flashlight Body
      ctx.save();
      ctx.translate(cx - 50, cy - 40);
      ctx.rotate(-0.35);

      // Yellow Industrial Barrel
      const barrelGrad = ctx.createLinearGradient(0, -30, 0, 30);
      barrelGrad.addColorStop(0, '#fef08a');
      barrelGrad.addColorStop(0.3, '#eab308');
      barrelGrad.addColorStop(0.8, '#ca8a04');
      barrelGrad.addColorStop(1, '#713f12');
      ctx.fillStyle = barrelGrad;
      ctx.roundRect(-160, -26, 220, 52, 8);
      ctx.fill();

      // Black Rubber Knurling Rings
      ctx.fillStyle = '#18181b';
      for (let k = 0; k < 4; k++) {
        ctx.fillRect(-140 + k * 45, -28, 22, 56);
      }

      // Flashlight Bezel Head
      const bezelGrad = ctx.createLinearGradient(0, -50, 0, 50);
      bezelGrad.addColorStop(0, '#64748b');
      bezelGrad.addColorStop(0.5, '#1e293b');
      bezelGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = bezelGrad;
      ctx.beginPath();
      ctx.roundRect(-220, -50, 68, 100, 10);
      ctx.fill();

      // Glowing Glass Lens & Reflector
      const lensGrad = ctx.createRadialGradient(-222, 0, 2, -222, 0, 42);
      lensGrad.addColorStop(0, '#ffffff');
      lensGrad.addColorStop(0.3, '#fef08a');
      lensGrad.addColorStop(0.8, '#f59e0b');
      lensGrad.addColorStop(1, '#b45309');
      ctx.fillStyle = lensGrad;
      ctx.beginPath();
      ctx.ellipse(-222, 0, 10, 44, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Hand grasping flashlight barrel
      drawHand(cx, cy, -0.35, 1.15);
    }

    // ----------------------------------------------------
    // FRAME 1 (R0, C1): Industrial Mop Ready / Idle
    // ----------------------------------------------------
    {
      const ox = frameW;
      const oy = 0;
      const cx = ox + frameW * 0.5;
      const cy = oy + frameH * 0.65;

      // Left Arm & Sleeve
      drawSleeve(ox + 80, oy + frameH + 30, cx - 110, cy - 20, 120);
      // Right Arm & Sleeve
      drawSleeve(ox + frameW - 80, oy + frameH + 30, cx + 90, cy + 30, 120);

      // Wooden Mop Shaft
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(0.22);

      const woodGrad = ctx.createLinearGradient(-16, 0, 16, 0);
      woodGrad.addColorStop(0, '#78350f');
      woodGrad.addColorStop(0.5, '#b45309');
      woodGrad.addColorStop(1, '#451a03');
      ctx.fillStyle = woodGrad;
      ctx.fillRect(-14, -260, 28, 480);

      // Metal Mop Head Bracket
      ctx.fillStyle = '#64748b';
      ctx.fillRect(-45, -280, 90, 32);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(-55, -295, 110, 20);

      // Wet Cotton Mop Strings
      const mopGrad = ctx.createLinearGradient(0, -320, 0, -240);
      mopGrad.addColorStop(0, '#e2e8f0');
      mopGrad.addColorStop(0.6, '#94a3b8');
      mopGrad.addColorStop(1, '#475569');
      ctx.fillStyle = mopGrad;
      ctx.beginPath();
      ctx.ellipse(0, -330, 95, 55, 0, 0, Math.PI * 2);
      ctx.fill();

      // Dirty water drips from mop strings
      ctx.fillStyle = '#334155';
      for (let s = 0; s < 12; s++) {
        ctx.fillRect(-70 + s * 12, -310 + (s % 3) * 8, 8, 30);
      }

      ctx.restore();

      // Left hand holding higher on shaft
      drawHand(cx - 60, cy - 70, 0.22, 1.0, true);
      // Right hand holding lower on shaft
      drawHand(cx + 45, cy + 20, 0.22, 1.05, false);
    }

    // ----------------------------------------------------
    // FRAME 2 (R0, C2): Mop Swipe Slash (Forward Splash)
    // ----------------------------------------------------
    {
      const ox = frameW * 2;
      const oy = 0;
      const cx = ox + frameW * 0.45;
      const cy = oy + frameH * 0.62;

      drawSleeve(ox + frameW - 70, oy + frameH + 30, cx + 80, cy + 20, 130);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.55);

      // Wooden handle
      ctx.fillStyle = '#b45309';
      ctx.fillRect(-14, -280, 28, 480);

      // Wet swept mop head
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.ellipse(40, -320, 120, 65, -0.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      drawHand(cx + 40, cy - 20, -0.55, 1.15);

      // Soapy Water Splash Droplets & Arc
      ctx.fillStyle = '#ffffff';
      for (let d = 0; d < 14; d++) {
        const dx = cx - 120 + d * 22;
        const dy = cy - 200 + Math.sin(d * 0.4) * 35;
        ctx.beginPath();
        ctx.arc(dx, dy, 6 + (d % 4) * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ----------------------------------------------------
    // FRAME 3 (R0, C3): Mop Swipe Return
    // ----------------------------------------------------
    {
      const ox = frameW * 3;
      const oy = 0;
      const cx = ox + frameW * 0.55;
      const cy = oy + frameH * 0.65;

      drawSleeve(ox + 80, oy + frameH + 30, cx - 70, cy + 20, 130);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(0.5);

      ctx.fillStyle = '#b45309';
      ctx.fillRect(-14, -280, 28, 480);

      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.ellipse(-40, -320, 110, 60, 0.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      drawHand(cx - 30, cy - 10, 0.5, 1.1, true);
    }

    // ----------------------------------------------------
    // FRAME 4 (R1, C0): Stainless Burger Spatula Idle
    // ----------------------------------------------------
    {
      const ox = 0;
      const oy = frameH;
      const cx = ox + frameW * 0.6;
      const cy = oy + frameH * 0.66;

      drawSleeve(ox + frameW * 0.85, oy + frameH + 30, cx + 20, cy + 40, 140);

      ctx.save();
      ctx.translate(cx - 40, cy - 50);
      ctx.rotate(-0.25);

      // Wooden Walnut Handle
      ctx.fillStyle = '#5c2b0e';
      ctx.roundRect(-14, 0, 28, 120, 6);
      ctx.fill();

      // Brass Rivets on handle
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(0, 30, 4, 0, Math.PI * 2);
      ctx.arc(0, 70, 4, 0, Math.PI * 2);
      ctx.fill();

      // Stainless Steel Shank & Blade
      const steelGrad = ctx.createLinearGradient(-70, -220, 70, 0);
      steelGrad.addColorStop(0, '#ffffff');
      steelGrad.addColorStop(0.4, '#e2e8f0');
      steelGrad.addColorStop(0.8, '#94a3b8');
      steelGrad.addColorStop(1, '#475569');
      ctx.fillStyle = steelGrad;

      // Spatula Wide Blade
      ctx.beginPath();
      ctx.roundRect(-65, -230, 130, 180, 12);
      ctx.fill();

      // Grease drainage slots
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-38, -200, 14, 110);
      ctx.fillRect(-7, -200, 14, 110);
      ctx.fillRect(24, -200, 14, 110);

      // Caramelized meat grease & blood stains on edge
      ctx.fillStyle = '#881337';
      ctx.beginPath();
      ctx.arc(-25, -220, 16, 0, Math.PI * 2);
      ctx.arc(35, -215, 20, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      drawHand(cx, cy, -0.25, 1.15);
    }

    // ----------------------------------------------------
    // FRAME 5 (R1, C1): Spatula Strike Wind-up
    // ----------------------------------------------------
    {
      const ox = frameW;
      const oy = frameH;
      const cx = ox + frameW * 0.68;
      const cy = oy + frameH * 0.62;

      drawSleeve(ox + frameW * 0.9, oy + frameH + 30, cx + 30, cy + 30, 140);

      ctx.save();
      ctx.translate(cx - 20, cy - 40);
      ctx.rotate(-0.85);

      ctx.fillStyle = '#5c2b0e';
      ctx.fillRect(-14, 0, 28, 120);

      ctx.fillStyle = '#e2e8f0';
      ctx.roundRect(-65, -230, 130, 180, 12);
      ctx.fill();

      ctx.restore();

      drawHand(cx, cy, -0.85, 1.15);
    }

    // ----------------------------------------------------
    // FRAME 6 (R1, C2): Spatula Heavy Chop Attack (Slash)
    // ----------------------------------------------------
    {
      const ox = frameW * 2;
      const oy = frameH;
      const cx = ox + frameW * 0.48;
      const cy = oy + frameH * 0.65;

      drawSleeve(ox + frameW * 0.85, oy + frameH + 30, cx + 40, cy + 30, 140);

      ctx.save();
      ctx.translate(cx, cy - 40);
      ctx.rotate(0.65);

      ctx.fillStyle = '#5c2b0e';
      ctx.fillRect(-14, 0, 28, 120);

      ctx.fillStyle = '#ffffff';
      ctx.roundRect(-65, -230, 130, 180, 12);
      ctx.fill();

      ctx.restore();

      drawHand(cx, cy, 0.65, 1.2);

      // Fresh Blood Arc & Impact Spark
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(cx - 60, cy - 140, 110, -0.6, 0.9);
      ctx.stroke();
    }

    // ----------------------------------------------------
    // FRAME 7 (R1, C3): Shaking Hands Defense Stance
    // ----------------------------------------------------
    {
      const ox = frameW * 3;
      const oy = frameH;
      const cx = ox + frameW * 0.5;
      const cy = oy + frameH * 0.65;

      drawSleeve(ox + 80, oy + frameH + 30, cx - 110, cy + 20, 120);
      drawSleeve(ox + frameW - 80, oy + frameH + 30, cx + 110, cy + 20, 120);

      drawHand(cx - 90, cy - 50, 0.35, 1.15, true);
      drawHand(cx + 90, cy - 50, -0.35, 1.15, false);
    }

    return canvas;
  }

  // ==========================================
  // 4. KFC PROPS & ITEMS (4x2 Grid = 8 Items)
  // Background: Solid #FF00FF Pink Chroma Key
  // ==========================================
  static generateCursedPropsSheet() {
    const frameW = 128;
    const frameH = 128;
    const cols = 4;
    const rows = 2;
    const canvas = document.createElement('canvas');
    canvas.width = frameW * cols;
    canvas.height = frameH * rows;
    const ctx = canvas.getContext('2d');

    // Fill background with bright magenta/pink #FF00FF
    ctx.fillStyle = '#FF00FF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Prop 0 (R0, C0): Cursed Chicken Bucket with Eyes
    {
      const cx = frameW / 2;
      const cy = frameH / 2 + 10;

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(cx - 34, cy - 24);
      ctx.lineTo(cx + 34, cy - 24);
      ctx.lineTo(cx + 24, cy + 38);
      ctx.lineTo(cx - 24, cy + 38);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#dc2626';
      ctx.fillRect(cx - 22, cy - 24, 10, 62);
      ctx.fillRect(cx + 12, cy - 24, 10, 62);

      ctx.fillStyle = '#b45309';
      ctx.beginPath();
      ctx.arc(cx - 16, cy - 30, 14, 0, Math.PI * 2);
      ctx.arc(cx + 14, cy - 32, 16, 0, Math.PI * 2);
      ctx.arc(cx, cy - 40, 15, 0, Math.PI * 2);
      ctx.fill();

      // Blinking Human Eyes
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - 8, cy - 32, 7, 0, Math.PI * 2);
      ctx.arc(cx + 16, cy - 28, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(cx - 8, cy - 32, 3.5, 0, Math.PI * 2);
      ctx.arc(cx + 16, cy - 28, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Prop 1 (R0, C1): Yellow Freezer Keycard
    {
      const cx = frameW + frameW / 2;
      const cy = frameH / 2;

      ctx.fillStyle = '#ca8a04';
      ctx.beginPath();
      ctx.roundRect(cx - 32, cy - 22, 64, 44, 8);
      ctx.fill();

      ctx.fillStyle = '#eab308';
      ctx.beginPath();
      ctx.roundRect(cx - 28, cy - 18, 56, 36, 6);
      ctx.fill();

      ctx.fillStyle = '#18181b';
      ctx.fillRect(cx - 28, cy - 8, 56, 8);

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(cx + 14, cy + 8, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Prop 2 (R0, C2): Deep Fryer Wire Basket
    {
      const cx = frameW * 2 + frameW / 2;
      const cy = frameH / 2;

      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx - 40, cy + 20);
      ctx.lineTo(cx - 10, cy - 10);
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(cx - 10, cy - 25, 48, 38);

      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.5;
      for (let gx = 0; gx < 5; gx++) {
        ctx.beginPath();
        ctx.moveTo(cx - 10 + gx * 10, cy - 25);
        ctx.lineTo(cx - 10 + gx * 10, cy + 13);
        ctx.stroke();
      }

      ctx.fillStyle = '#1c1917';
      ctx.fillRect(cx - 8, cy - 10, 44, 20);
    }

    // Prop 3 (R0, C3): Bloody Order #666 Ticket
    {
      const cx = frameW * 3 + frameW / 2;
      const cy = frameH / 2;

      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.roundRect(cx - 24, cy - 36, 48, 72, 4);
      ctx.fill();

      ctx.fillStyle = '#991b1b';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ORDER #666', cx, cy - 22);

      ctx.fillStyle = '#1c1917';
      ctx.font = '7px monospace';
      ctx.fillText('- 1x LIVER BUCKET', cx, cy - 8);
      ctx.fillText('- 1x FLIGHT OF BONES', cx, cy + 4);
      ctx.fillText('- ESCAPE BEFORE 3AM', cx, cy + 16);
    }

    // Prop 4 (R1, C0): Rotisserie Carcass Anomaly
    {
      const cx = frameW / 2;
      const cy = frameH + frameH / 2;

      ctx.fillStyle = '#78350f';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 28, 36, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#fef3c7';
      ctx.lineWidth = 3;
      for (let r = 0; r < 4; r++) {
        ctx.beginPath();
        ctx.arc(cx, cy - 12 + r * 8, 14, -0.6, 0.6);
        ctx.stroke();
      }
    }

    // Prop 5 (R1, C1): Toxic Grease Waste Barrel
    {
      const cx = frameW + frameW / 2;
      const cy = frameH + frameH / 2;

      ctx.fillStyle = '#15803d';
      ctx.beginPath();
      ctx.roundRect(cx - 24, cy - 32, 48, 64, 4);
      ctx.fill();

      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(cx, cy - 8, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Prop 6 (R1, C2): First Aid Chicken Box
    {
      const cx = frameW * 2 + frameW / 2;
      const cy = frameH + frameH / 2;

      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.roundRect(cx - 26, cy - 20, 52, 40, 6);
      ctx.fill();

      ctx.fillStyle = '#dc2626';
      ctx.fillRect(cx - 4, cy - 14, 8, 28);
      ctx.fillRect(cx - 14, cy - 4, 28, 8);
    }

    // Prop 7 (R1, C3): Circuit Breaker Box
    {
      const cx = frameW * 3 + frameW / 2;
      const cy = frameH + frameH / 2;

      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.roundRect(cx - 24, cy - 30, 48, 60, 4);
      ctx.fill();

      ctx.fillStyle = '#ef4444';
      ctx.fillRect(cx - 6, cy - 10, 12, 20);

      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(cx, cy + 18, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    return canvas;
  }

  // ==========================================
  // PBR TEXTURE GENERATORS (High Performance)
  // ==========================================

  static createCheckeredFloorPBR(size = 512) {
    const albedoCanvas = document.createElement('canvas');
    albedoCanvas.width = size;
    albedoCanvas.height = size;
    const aCtx = albedoCanvas.getContext('2d');

    const roughnessCanvas = document.createElement('canvas');
    roughnessCanvas.width = size;
    roughnessCanvas.height = size;
    const rCtx = roughnessCanvas.getContext('2d');

    const tiles = 4;
    const tileSize = size / tiles;

    for (let r = 0; r < tiles; r++) {
      for (let c = 0; c < tiles; c++) {
        const isRed = (r + c) % 2 === 0;
        const x = c * tileSize;
        const y = r * tileSize;

        aCtx.fillStyle = isRed ? '#5b1117' : '#a8a29e';
        aCtx.fillRect(x, y, tileSize, tileSize);

        aCtx.strokeStyle = '#1f2937';
        aCtx.lineWidth = 4;
        aCtx.strokeRect(x, y, tileSize, tileSize);

        rCtx.fillStyle = isRed ? '#666666' : '#555555';
        rCtx.fillRect(x, y, tileSize, tileSize);
      }
    }

    // Grease puddles (Glossy reflections)
    for (let i = 0; i < 5; i++) {
      const gx = (i * 113) % size;
      const gy = (i * 179) % size;
      const gr = 30 + (i * 15);

      const grad = aCtx.createRadialGradient(gx, gy, 0, gx, gy, gr);
      grad.addColorStop(0, 'rgba(80, 50, 10, 0.7)');
      grad.addColorStop(0.7, 'rgba(120, 80, 20, 0.4)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      aCtx.fillStyle = grad;
      aCtx.beginPath();
      aCtx.arc(gx, gy, gr, 0, Math.PI * 2);
      aCtx.fill();

      const rGrad = rCtx.createRadialGradient(gx, gy, 0, gx, gy, gr);
      rGrad.addColorStop(0, '#111111');
      rGrad.addColorStop(0.8, '#444444');
      rGrad.addColorStop(1, '#888888');
      rCtx.fillStyle = rGrad;
      rCtx.beginPath();
      rCtx.arc(gx, gy, gr, 0, Math.PI * 2);
      rCtx.fill();
    }

    const normalCanvas = this.generateFastNormalMap(size, 2.5);

    const albedoTex = new THREE.CanvasTexture(albedoCanvas);
    albedoTex.wrapS = THREE.RepeatWrapping;
    albedoTex.wrapT = THREE.RepeatWrapping;

    const normalTex = new THREE.CanvasTexture(normalCanvas);
    normalTex.wrapS = THREE.RepeatWrapping;
    normalTex.wrapT = THREE.RepeatWrapping;

    const roughnessTex = new THREE.CanvasTexture(roughnessCanvas);
    roughnessTex.wrapS = THREE.RepeatWrapping;
    roughnessTex.wrapT = THREE.RepeatWrapping;

    return { albedo: albedoTex, normal: normalTex, roughness: roughnessTex };
  }

  static createStainlessSteelPBR(size = 512) {
    const albedoCanvas = document.createElement('canvas');
    albedoCanvas.width = size;
    albedoCanvas.height = size;
    const aCtx = albedoCanvas.getContext('2d');

    const roughnessCanvas = document.createElement('canvas');
    roughnessCanvas.width = size;
    roughnessCanvas.height = size;
    const rCtx = roughnessCanvas.getContext('2d');

    const metalnessCanvas = document.createElement('canvas');
    metalnessCanvas.width = size;
    metalnessCanvas.height = size;
    const mCtx = metalnessCanvas.getContext('2d');

    aCtx.fillStyle = '#9ca3af';
    aCtx.fillRect(0, 0, size, size);

    // Seams
    aCtx.strokeStyle = '#4b5563';
    aCtx.lineWidth = 6;
    aCtx.strokeRect(0, 0, size, size);
    aCtx.beginPath();
    aCtx.moveTo(0, size / 2);
    aCtx.lineTo(size, size / 2);
    aCtx.stroke();

    // Rivets
    aCtx.fillStyle = '#d1d5db';
    for (let i = 20; i < size; i += 60) {
      aCtx.beginPath();
      aCtx.arc(i, 12, 5, 0, Math.PI * 2);
      aCtx.arc(i, size - 12, 5, 0, Math.PI * 2);
      aCtx.arc(i, size / 2, 5, 0, Math.PI * 2);
      aCtx.fill();
    }

    rCtx.fillStyle = '#555555';
    rCtx.fillRect(0, 0, size, size);

    mCtx.fillStyle = '#e5e5e5';
    mCtx.fillRect(0, 0, size, size);

    const normalCanvas = this.generateFastNormalMap(size, 3.0);

    const albedoTex = new THREE.CanvasTexture(albedoCanvas);
    albedoTex.wrapS = THREE.RepeatWrapping;
    albedoTex.wrapT = THREE.RepeatWrapping;

    const normalTex = new THREE.CanvasTexture(normalCanvas);
    normalTex.wrapS = THREE.RepeatWrapping;
    normalTex.wrapT = THREE.RepeatWrapping;

    const roughnessTex = new THREE.CanvasTexture(roughnessCanvas);
    roughnessTex.wrapS = THREE.RepeatWrapping;
    roughnessTex.wrapT = THREE.RepeatWrapping;

    const metalnessTex = new THREE.CanvasTexture(metalnessCanvas);
    metalnessTex.wrapS = THREE.RepeatWrapping;
    metalnessTex.wrapT = THREE.RepeatWrapping;

    return { albedo: albedoTex, normal: normalTex, roughness: roughnessTex, metalness: metalnessTex };
  }

  static createCeilingPBR(size = 512) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#3a3835';
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = '#1e1c1a';
    ctx.lineWidth = 8;
    ctx.strokeRect(0, 0, size, size);

    const normalCanvas = this.generateFastNormalMap(size, 1.8);

    const albedoTex = new THREE.CanvasTexture(canvas);
    albedoTex.wrapS = THREE.RepeatWrapping;
    albedoTex.wrapT = THREE.RepeatWrapping;

    const normalTex = new THREE.CanvasTexture(normalCanvas);
    normalTex.wrapS = THREE.RepeatWrapping;
    normalTex.wrapT = THREE.RepeatWrapping;

    return { albedo: albedoTex, normal: normalTex };
  }

  static createMenuBoardTexture(width = 1024, height = 512) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0b1117';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(20, 20, width - 40, 80);
    ctx.fillStyle = '#fef08a';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('KENTUCKY FRIED CARNAGE - TODAY\'S SPECIALS', width / 2, 72);

    const colW = (width - 60) / 4;
    const items = [
      { num: 'COMBO 1', title: '3PC FINGERS', desc: 'CRISPY HUMAN DIGITS', price: '$6.66' },
      { num: 'COMBO 2', title: 'ROAST CARCASS', desc: 'EXTRA PLUCKED FLESH', price: '$9.99' },
      { num: 'COMBO 3', title: '11 SECRET ORGANS', desc: 'BOILED IN GREASE', price: '$13.33' },
      { num: 'SPECIAL', title: 'SHIFTPERSON MEAL', desc: 'NO ESCAPE AT 3 AM', price: 'FREE' }
    ];

    items.forEach((item, idx) => {
      const x = 30 + idx * (colW + 5);
      const y = 120;

      ctx.fillStyle = '#1e1111';
      ctx.fillRect(x, y, colW, height - 150);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, colW, height - 150);

      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 20px monospace';
      ctx.fillText(item.num, x + colW / 2, y + 36);

      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 18px monospace';
      ctx.fillText(item.title, x + colW / 2, y + 70);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '13px monospace';
      ctx.fillText(item.desc, x + colW / 2, y + 105);

      ctx.fillStyle = '#dc2626';
      ctx.fillRect(x + 20, y + 140, colW - 40, 40);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px monospace';
      ctx.fillText(item.price, x + colW / 2, y + 168);
    });

    return new THREE.CanvasTexture(canvas);
  }

  static createFreezerDoorTexture(width = 512, height = 512) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const steelGradient = ctx.createLinearGradient(0, 0, width, 0);
    steelGradient.addColorStop(0, '#1e293b');
    steelGradient.addColorStop(0.45, '#64748b');
    steelGradient.addColorStop(0.55, '#334155');
    steelGradient.addColorStop(1, '#111827');
    ctx.fillStyle = steelGradient;
    ctx.fillRect(0, 0, width, height);

    // Subtle vertical brushed-metal bands so the door reads as steel rather
    // than a flat red rectangle under the flashlight.
    for (let x = 18; x < width; x += 28) {
      ctx.fillStyle = x % 56 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
      ctx.fillRect(x, 0, 3, height);
    }

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 16;
    ctx.strokeRect(0, 0, width, height);

    for (let i = -width; i < width * 2; i += 40) {
      ctx.fillStyle = '#ca8a04';
      ctx.beginPath();
      ctx.moveTo(i, height - 80);
      ctx.lineTo(i + 20, height - 80);
      ctx.lineTo(i - 10, height);
      ctx.lineTo(i - 30, height);
      ctx.fill();
    }

    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(width / 2 - 142, 72, 284, 92);
    ctx.fillStyle = '#111827';
    ctx.fillRect(width / 2 - 132, 82, 264, 72);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 4;
    ctx.strokeRect(width / 2 - 132, 82, 264, 72);
    ctx.fillStyle = '#fef2f2';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MEAT FREEZER #04', width / 2, 115);
    ctx.font = '14px monospace';
    ctx.fillText('KEYCARD REQUIRED', width / 2, 140);

    return new THREE.CanvasTexture(canvas);
  }

  /**
   * Fast flat normal map generator (avoids heavy Sobel loop freezing)
   */
  static generateFastNormalMap(size = 512, strength = 2.0) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgb(128, 128, 255)'; // standard tangent-space normal (0, 0, 1)
    ctx.fillRect(0, 0, size, size);
    return canvas;
  }
}
