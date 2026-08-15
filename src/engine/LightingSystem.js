import * as THREE from 'three';

/**
 * LightingSystem - Cinematic horror lighting:
 * - Zones with different color temperatures
 * - Volumetric fog feeling via fog density
 * - Emergency red lights, neon signs, freezer cyan
 * - Power outage & surge sequences
 * - Flashlight with realistic battery flicker and wide beam
 * - Flickering fluorescent tubes with individual timers
 */

export class LightingSystem {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    this.fluorescents = [];
    this.neonLights = [];
    this.emergencyLights = [];
    this.freezerLights = [];
    this.outdoorLights = [];

    this.powerActive = true;
    this.generatorPower = false;
    this.flickerTimer = 0;
    this.powerSurgeTimer = -1;
    this.flashlightFlickerTimer = 0;
    this.forward = new THREE.Vector3();
    this.zone = 'outdoor';

    this.initLights();
    this.initFlashlight();
  }

  initLights() {
    // Base ambient. The old 0.45 of near-black (0x0a0a12) left every surface
    // at roughly 2% grey, so the textures, the props and the level geometry
    // were all invisible until a light happened to touch them - the game read
    // as flat black shapes. This is still dark enough to need the flashlight,
    // but the world is legible instead of absent.
    // Ambient presets, so setPower() cannot silently re-hardcode a different
    // (and much darker) value than the one initLights chose.
    this.AMBIENT_POWERED = { color: 0x1c2030, intensity: 0.85 };
    this.AMBIENT_BLACKOUT = { color: 0x2a0a0c, intensity: 0.42 };
    this.ambientLight = new THREE.AmbientLight(
      this.AMBIENT_POWERED.color, this.AMBIENT_POWERED.intensity
    );
    this.scene.add(this.ambientLight);

    // Cool hemisphere fill so floors and ceilings are not lit identically.
    // Cheap (no shadow pass) and it stops interiors looking like flat cutouts.
    this.hemiLight = new THREE.HemisphereLight(0x4a5570, 0x0e0c10, 0.5);
    this.hemiLight.position.set(0, 12, 0);
    this.scene.add(this.hemiLight);

    // Directional moonlight from the north for the exterior.
    this.moonLight = new THREE.DirectionalLight(0x8fa4c8, 0.85);
    this.moonLight.position.set(-20, 28, -40);
    this.moonLight.castShadow = false;
    this.scene.add(this.moonLight);

    // --- FLUORESCENT TUBES (Interior) ---
    const tubeConfigs = [
      // dining west
      { x: -10, y: 3.85, z: -22, intensity: 1.4, flickerChance: 0.025, zone: 'dining', active: true },
      // dining center front
      { x: 0, y: 3.85, z: -20, intensity: 1.2, flickerChance: 0.03, zone: 'dining', active: true },
      // dining east
      { x: 10, y: 3.85, z: -22, intensity: 1.3, flickerChance: 0.04, zone: 'dining', active: true },
      // playplace
      { x: 22, y: 3.85, z: -18, intensity: 1.1, flickerChance: 0.12, zone: 'playplace', active: false }, // broken, flickers hard
      // restrooms corridor
      { x: -22, y: 3.85, z: -22, intensity: 0.9, flickerChance: 0.07, zone: 'bathroom', active: true },
      // kitchen fryer row north
      { x: -4, y: 3.85, z: -1, intensity: 1.6, flickerChance: 0.02, zone: 'kitchen', active: true },
      // kitchen south
      { x: 4, y: 3.85, z: 4, intensity: 1.5, flickerChance: 0.02, zone: 'kitchen', active: true },
      // kitchen prep island
      { x: 0, y: 3.85, z: 11, intensity: 1.3, flickerChance: 0.03, zone: 'kitchen', active: true },
      // office north
      { x: -22, y: 3.85, z: 8, intensity: 1.0, flickerChance: 0.09, zone: 'office', active: true },
      // office south
      { x: -22, y: 3.85, z: 16, intensity: 0.8, flickerChance: 0.11, zone: 'office', active: false }, // failing in office
      // storage
      { x: -18, y: 3.85, z: 23, intensity: 0.7, flickerChance: 0.14, zone: 'storage', active: false },
      // generator room
      { x: 4, y: 3.85, z: 28, intensity: 0.6, flickerChance: 0.16, zone: 'basement', active: false },
      // hallway south
      { x: 0, y: 3.85, z: 22, intensity: 0.9, flickerChance: 0.05, zone: 'hallway', active: true },
    ];

    tubeConfigs.forEach((cfg, idx) => {
      const fixtureGeo = new THREE.BoxGeometry(2.2, 0.12, 0.45);
      const fixtureMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.8 });
      const fixture = new THREE.Mesh(fixtureGeo, fixtureMat);
      fixture.position.set(cfg.x, cfg.y + 0.12, cfg.z);
      this.scene.add(fixture);

      const tubeGeo = new THREE.BoxGeometry(1.9, 0.06, 0.22);
      const tubeMat = new THREE.MeshBasicMaterial({ color: 0xfef9c3 });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      tubeMesh.position.set(cfg.x, cfg.y, cfg.z);
      // Slight emissive
      tubeMesh.material = new THREE.MeshStandardMaterial({
        color: 0xfef9c3,
        emissive: 0xfef9c3,
        emissiveIntensity: cfg.active ? 0.8 : 0.05
      });
      this.scene.add(tubeMesh);

      const light = cfg.active ? new THREE.PointLight(0xfff2c5, cfg.intensity, 14, 2) : new THREE.PointLight(0xfff2c5, 0, 14, 2);
      light.position.set(cfg.x, cfg.y - 0.25, cfg.z);
      this.scene.add(light);

      this.fluorescents.push({
        light,
        mesh: tubeMesh,
        baseIntensity: cfg.intensity,
        flickerChance: cfg.flickerChance,
        flickerSeed: Math.random() * 100,
        zone: cfg.zone,
        active: cfg.active,
        originallyActive: cfg.active
      });
    });

    // --- HEAT LAMPS (Warm orange over service counter) ---
    const heatPositions = [
      { x: -3, y: 2.6, z: -4.6 },
      { x: 0, y: 2.6, z: -4.6 },
      { x: 3, y: 2.6, z: -4.6 }
    ];
    heatPositions.forEach((pos, i) => {
      const hl = i === 1 ? new THREE.PointLight(0xff4500, 1.9, 7, 2) : null;
      if (hl) {
        hl.position.set(pos.x, pos.y, pos.z);
        this.scene.add(hl);
      }
      const bulbGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.08, 10);
      const bulbMat = new THREE.MeshStandardMaterial({ color: 0x7a1a1a, emissive: 0x441111, emissiveIntensity: 0.5 });
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(pos.x, pos.y - 0.05, pos.z);
      this.scene.add(bulb);
    });

    // --- EMERGENCY RED LIGHTS ---
    const emergencyPositions = [
      { x: -28, y: 3.2, z: -18 },
      { x: 28, y: 3.2, z: -18 },
      { x: -28, y: 3.2, z: 12 },
      { x: 28, y: 3.2, z: 12 },
      { x: 0, y: 3.3, z: 28 }
    ];
    emergencyPositions.forEach(p => {
      const eLight = new THREE.PointLight(0xff0a0a, 0, 10, 2);
      eLight.position.set(p.x, p.y, p.z);
      this.scene.add(eLight);
      const eMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.14, 0.16),
        new THREE.MeshBasicMaterial({ color: 0x440000 })
      );
      eMesh.position.set(p.x, p.y, p.z);
      this.scene.add(eMesh);
      this.emergencyLights.push({ light: eLight, mesh: eMesh, pulse: Math.random() * Math.PI * 2 });
    });

    // --- FREEZER CYAN CHILL ---
    const freezerLight = new THREE.PointLight(0x3abfff, 1.3, 18, 1.6);
    freezerLight.position.set(22, 3.0, 11);
    this.scene.add(freezerLight);
    this.freezerLights.push(freezerLight);

    const freezerLight2 = new THREE.PointLight(0x1a8aff, 0.9, 12, 1.6);
    freezerLight2.position.set(22, 1.8, 4);
    this.scene.add(freezerLight2);
    this.freezerLights.push(freezerLight2);

    // --- OUTDOOR DRIVE-THRU AMBER + PARKING ---
    this.driveThruLight = new THREE.PointLight(0xffe4a0, 2.6, 22, 1.6);
    this.driveThruLight.position.set(-30, 3.6, 5);
    this.scene.add(this.driveThruLight);

    this.parkingLight = new THREE.PointLight(0xffe4a0, 1.4, 16, 1.6);
    this.parkingLight.position.set(0, 5, -35);
    this.scene.add(this.parkingLight);

    // --- NEON SIGN "AOKGEN" Exterior ---
    const neonLight = new THREE.PointLight(0xff2040, 2.2, 18, 1.8);
    neonLight.position.set(0, 4.2, -30.5);
    this.scene.add(neonLight);
    this.neonLights.push({ light: neonLight, base: 2.2 });

    // --- GENERATOR ROOM DIRTY BULB ---
    this.generatorBulb = new THREE.PointLight(0xeab308, 0.0, 10, 2);
    this.generatorBulb.position.set(0, 3.0, 28);
    this.scene.add(this.generatorBulb);
  }

  initFlashlight() {
    // Single source of truth for flashlight tuning - the focus beam and the
    // flicker code both derive from these instead of re-hardcoding numbers.
    this.flashlightBaseIntensity = 4.8;
    this.flashlightBaseAngle = Math.PI / 4.2;
    this.flashlightFocusAngle = Math.PI / 12;
    this.flashlightFocusBoost = 1.6;
    this.focusBeamActive = false;
    this.flashlight = new THREE.SpotLight(
      0xfff7e8, this.flashlightBaseIntensity, 32, this.flashlightBaseAngle, 0.52, 1.3
    );
    this.flashlight.position.set(0, 0, 0);
    this.flashlight.castShadow = false;

    this.flashlightTarget = new THREE.Object3D();
    this.scene.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;

    this.scene.add(this.flashlight);
    this.flashlightOn = true;
    this.flashlightBattery = 100;
    this.flashlightFlickerTimer = 0;
    this.lowBatteryFlicker = false;

    // Helper cone visual (very faint dust)
    const coneGeo = new THREE.ConeGeometry(1.8, 8, 16, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xfff4c0,
      transparent: true,
      opacity: 0.04,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.flashlightCone = new THREE.Mesh(coneGeo, coneMat);
    this.flashlightCone.rotation.x = Math.PI;
    this.flashlightCone.visible = false;
    // We won't add cone to maintain performance, but keep for optional
  }

  toggleFlashlight() {
    this.flashlightOn = !this.flashlightOn;
    this.flashlight.visible = this.flashlightOn;
    if (!this.flashlightOn) this.setFocusBeam(false);
    return this.flashlightOn;
  }

  /** Narrow, brighter beam while the player holds right mouse. */
  setFocusBeam(active) {
    if (!this.flashlight || this.focusBeamActive === active) return;
    this.focusBeamActive = active;
    this.flashlight.angle = active ? this.flashlightFocusAngle : this.flashlightBaseAngle;
    this.flashlight.intensity = this.currentFlashlightIntensity();
  }

  /** Target intensity for the current beam mode. */
  currentFlashlightIntensity() {
    return this.flashlightBaseIntensity * (this.focusBeamActive ? this.flashlightFocusBoost : 1);
  }

  setBatteryLevel(pct) {
    this.flashlightBattery = pct;
    const low = pct < 22;
    if (low !== this.lowBatteryFlicker) {
      this.lowBatteryFlicker = low;
    }
  }

  setPower(active) {
    this.powerActive = active;
    this.generatorPower = active;
    if (!active) {
      // Blackout - kill fluorescents, enable emergency reds
      this.fluorescents.forEach(f => {
        if (f.light) {
          f.light.intensity = 0;
        }
        if (f.mesh && f.mesh.material) {
          f.mesh.material.emissiveIntensity = 0.03;
        }
      });
      this.emergencyLights.forEach(e => {
        e.light.intensity = 1.8;
        if (e.mesh) e.mesh.material.color.setHex(0xff0000);
      });
      this.ambientLight.color.setHex(this.AMBIENT_BLACKOUT.color);
      this.ambientLight.intensity = this.AMBIENT_BLACKOUT.intensity;
      if (this.hemiLight) this.hemiLight.intensity = 0.18;
      this.generatorBulb.intensity = 0.0;
      this.driveThruLight.intensity = 0.15;
      this.parkingLight.intensity = 0.08;
      this.neonLights.forEach(n => n.light.intensity = 0.08);
      // Darken fog for horror
      if (this.scene.fog) {
        this.scene.fog.color.setHex(0x050202);
      }
    } else {
      // Restore
      this.fluorescents.forEach(f => {
        if (f.originallyActive && f.light) f.light.intensity = f.baseIntensity;
        if (f.mesh?.material) f.mesh.material.emissiveIntensity = 0.85;
      });
      this.emergencyLights.forEach(e => {
        e.light.intensity = 0;
        if (e.mesh) e.mesh.material.color.setHex(0x440000);
      });
      this.ambientLight.color.setHex(this.AMBIENT_POWERED.color);
      this.ambientLight.intensity = this.AMBIENT_POWERED.intensity;
      if (this.hemiLight) this.hemiLight.intensity = 0.5;
      this.generatorBulb.intensity = 1.2;
      this.driveThruLight.intensity = 2.6;
      this.parkingLight.intensity = 1.4;
      this.neonLights.forEach(n => n.light.intensity = n.base);
      if (this.scene.fog) {
        this.scene.fog.color.setHex(0x0a0405);
      }
    }
  }

  powerSurgeSequence() {
    this.powerSurgeTimer = 0;
    this.powerSurgePhase = -1;
    // Start with blackout then rapid flashes
    this.setPower(false);
  }

  triggerFlickerBurst(duration = 1, intensityMultiplier = 1.8) {
    this.flickerBurst = { time: duration, intensity: intensityMultiplier };
  }

  update(delta, time) {
    // Update flashlight to follow camera
    if (this.flashlight && this.camera) {
      this.flashlight.position.copy(this.camera.position);
      this.camera.getWorldDirection(this.forward);
      this.flashlightTarget.position.copy(this.camera.position).addScaledVector(this.forward, 11);
      // Subtle sway breathing
      if (this.flashlightOn) {
        this.flashlightFlickerTimer -= delta;
        if (this.flashlightFlickerTimer <= 0) {
          if (this.lowBatteryFlicker) {
            // Low battery flicker more frequent and dramatic
            const r = Math.random();
            if (r < 0.12) {
              this.flashlight.intensity = Math.random() * 0.4 + 0.2;
              this.flashlightFlickerTimer = 0.04 + Math.random() * 0.07;
            } else if (r < 0.18) {
              this.flashlight.intensity = 0;
              this.flashlightFlickerTimer = 0.12;
            } else {
              this.flashlight.intensity = this.currentFlashlightIntensity() + Math.random() * 0.6 - 0.3;
              this.flashlightFlickerTimer = 0.18;
            }
          } else {
            // Normal subtle flicker
            if (Math.random() < 0.018) {
              this.flashlight.intensity = this.currentFlashlightIntensity() * 0.3 + Math.random() * 0.8;
              this.flashlightFlickerTimer = 0.06;
            } else {
              this.flashlight.intensity = this.currentFlashlightIntensity();
              this.flashlightFlickerTimer = 0.16;
            }
          }
        }
      }
    }

    // Power surge sequence. Each phase applies its lighting change exactly
    // once on the frame it is entered - setPower() touches every light in the
    // level, so calling it per frame was both wasteful and visibly stuttery.
    if (this.powerSurgeTimer >= 0) {
      this.powerSurgeTimer += delta;
      const t = this.powerSurgeTimer;
      const phase = t < 0.25 ? 0 : t < 0.4 ? 1 : t < 0.55 ? 2 : t < 0.7 ? 3 : t < 1.2 ? 4 : 5;
      if (phase !== this.powerSurgePhase) {
        this.powerSurgePhase = phase;
        switch (phase) {
          case 0: this.setPower(false); break;
          case 1: this.fluorescents.forEach(f => { if (f.light) f.light.intensity = f.baseIntensity * 2.2; }); break;
          case 2: this.fluorescents.forEach(f => { if (f.light) f.light.intensity = 0; }); break;
          case 3: this.fluorescents.forEach(f => { if (f.light) f.light.intensity = f.baseIntensity * 1.5; }); break;
          case 4: this.setPower(true); this.generatorBulb.intensity = 2.5; break;
          default:
            this.generatorBulb.intensity = 1.2;
            this.powerSurgeTimer = -1;
            this.powerSurgePhase = -1;
            break;
        }
      }
      return; // Skip normal flicker during the surge
    }

    // Flicker burst from events
    let burstFactor = 1;
    if (this.flickerBurst) {
      this.flickerBurst.time -= delta;
      if (this.flickerBurst.time <= 0) this.flickerBurst = null;
      else burstFactor = this.flickerBurst.intensity;
    }

    // Fluorescent flicker logic
    this.flickerTimer -= delta;
    if (this.powerActive && this.flickerTimer <= 0) {
      this.flickerTimer = 0.07;
      this.fluorescents.forEach(f => {
        if (!f.active) return;
        const wave = Math.sin(time * 18 + f.flickerSeed) * Math.cos(time * 31 + f.flickerSeed);
        const chance = f.flickerChance * burstFactor;
        if (Math.random() < chance || wave > 0.91 * burstFactor) {
          if (f.light) f.light.intensity = Math.random() * 0.25;
          if (f.mesh?.material) f.mesh.material.emissiveIntensity = 0.05;
        } else {
          if (f.light) f.light.intensity = f.baseIntensity + (Math.random() - 0.5) * 0.18;
          if (f.mesh?.material) f.mesh.material.emissiveIntensity = 0.85;
        }
      });
    }

    // Emergency light pulse
    this.emergencyLights.forEach(e => {
      e.pulse += delta * (2.2 + Math.random() * 0.3);
      if (e.light.intensity > 0) {
        e.light.intensity = 1.3 + Math.sin(e.pulse) * 0.6;
      }
    });

    // Neon flicker
    this.neonLights.forEach(n => {
      if (!this.powerActive) return;
      if (Math.random() < 0.025) {
        n.light.intensity = Math.random() < 0.5 ? 0.15 : n.base * (0.8 + Math.random() * 0.5);
      } else {
        n.light.intensity = n.base + Math.sin(time * 2.5) * 0.15;
      }
    });
  }

  /**
   * Zone lookup, derived from the actual wall layout built by LevelBuilder:
   *   outdoor    z < -30
   *   playplace  x > 15,  z -30..-4      dining    x -15..15, z -30..-4
   *   bathroom   x < -15, z -30..-16     janitor   x < -15, z -30..-24
   *   kitchen    x -14..14, z -4..22     freezer   x > 14,  z 0..22
   *   office     x < -14, z 0..22        storage   x < -14, z 22..35
   *   basement   z > 22 (generator room and the dock behind it)
   */
  getCurrentZone(pos) {
    if (!pos) return this.zone;
    const { x, z } = pos;

    if (z < -30.2) return 'outdoor';

    if (z < -4) {
      if (x > 15) return 'playplace';
      if (x < -15) return z < -24 ? 'janitor' : 'bathroom';
      return 'dining';
    }

    if (z < 22) {
      if (x > 14) return 'freezer';
      if (x < -14) return 'office';
      // The kitchen's south strip in front of the basement door reads as the
      // staff corridor, which has its own ambience.
      return z > 18 ? 'hallway' : 'kitchen';
    }

    if (x < -14) return 'storage';
    return 'basement';
  }

  /**
   * Restores the opening lighting state for a restart: power on (exterior),
   * flashlight off, no surge or burst mid-flight.
   */
  reset() {
    this.powerSurgeTimer = -1;
    this.powerSurgePhase = -1;
    this.flickerBurst = null;
    this.flickerTimer = 0;
    this.flashlightFlickerTimer = 0;
    this.lowBatteryFlicker = false;
    this.flashlightBattery = 100;
    this.focusBeamActive = false;
    if (this.flashlightOn) this.toggleFlashlight();
    this.zone = 'outdoor';
    this.setPower(true);
  }
}
