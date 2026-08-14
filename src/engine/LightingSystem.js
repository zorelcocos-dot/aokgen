import * as THREE from 'three';

/**
 * LightingSystem manages PBR lights:
 * - Flickering fluorescent tubes with realistic timing jitter
 * - Infrared heat lamps over food warmers
 * - Eerie cyan walk-in freezer chill lights
 * - Emergency exit signs
 * - Player-mounted Flashlight Spotlight
 * - Global power failure blackout state
 */
export class LightingSystem {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    this.fluorescents = [];
    this.heatLamps = [];
    this.freezerLights = [];
    this.exitLights = [];
    this.powerActive = true;
    this.flickerTimer = 0;
    this.flashlightFlickerTimer = 0;
    this.forward = new THREE.Vector3();

    this.initLights();
    this.initFlashlight();
  }

  initLights() {
    // Subtle low ambient light so shadows aren't pitch pitch black
    this.ambientLight = new THREE.AmbientLight(0x100808, 0.85);
    this.scene.add(this.ambientLight);

    // --- Fluorescent Tubes across Expanded Facility ---
    const tubePositions = [
      { x: -8, y: 3.8, z: -20 }, // Dining Hall West
      { x: 8,  y: 3.8, z: -20 }, // Dining Hall East
      { x: 0,  y: 3.8, z: -10 }, // Dining Hall Center
      { x: 22, y: 3.8, z: -18 }, // PlayPlace Ball Pit
      { x: -22, y: 3.8, z: -22 }, // Restrooms
      { x: -4, y: 3.8, z: 4 },   // Kitchen Fryer Row
      { x: 4,  y: 3.8, z: 4 },   // Kitchen Rotisserie Row
      { x: 0,  y: 3.8, z: 12 },  // Kitchen Prep Island
      { x: -22, y: 3.8, z: 11 }, // Manager's Office
      { x: 0,  y: 3.8, z: 28 },  // South Cellar & Generator
    ];

    const activeTubeIndices = new Set([0, 2, 3, 5, 7, 8, 9]);

    tubePositions.forEach((pos, idx) => {
      const fixtureGeo = new THREE.BoxGeometry(2.0, 0.1, 0.4);
      const fixtureMat = new THREE.MeshStandardMaterial({
        color: 0x222222,
        roughness: 0.8
      });
      const fixture = new THREE.Mesh(fixtureGeo, fixtureMat);
      fixture.position.set(pos.x, pos.y + 0.1, pos.z);
      this.scene.add(fixture);

      const tubeGeo = new THREE.BoxGeometry(1.8, 0.05, 0.2);
      const tubeMat = new THREE.MeshBasicMaterial({ color: 0xfef9c3 });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      tubeMesh.position.set(pos.x, pos.y, pos.z);
      this.scene.add(tubeMesh);

      const light = activeTubeIndices.has(idx)
        ? new THREE.PointLight(0xfef08a, 1.8, 16, 1.8)
        : null;
      if (light) {
        light.position.set(pos.x, pos.y - 0.2, pos.z);
        light.castShadow = false;
        this.scene.add(light);
      }

      this.fluorescents.push({
        light,
        mesh: tubeMesh,
        baseIntensity: 1.8,
        flickerSeed: Math.random() * 100,
        flickerChance: idx === 3 || idx === 8 || idx === 9 ? 0.08 : 0.02
      });
    });

    // --- Heat Lamps (Warm Orange Glowing Over Food Warmers at Z: -4.5) ---
    const heatPositions = [
      { x: -2.5, y: 2.2, z: -4.5 },
      { x: 0,    y: 2.2, z: -4.5 },
      { x: 2.5,  y: 2.2, z: -4.5 }
    ];

    heatPositions.forEach((pos, idx) => {
      const heatLight = idx === 1 ? new THREE.PointLight(0xff2200, 2.5, 8, 2.0) : null;
      if (heatLight) {
        heatLight.position.set(pos.x, pos.y, pos.z);
        heatLight.castShadow = false;
        this.scene.add(heatLight);
      }

      const bulbGeo = new THREE.BoxGeometry(0.28, 0.05, 0.16);
      const bulbMat = new THREE.MeshBasicMaterial({ color: 0x991b1b });
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(pos.x, pos.y - 0.06, pos.z);
      this.scene.add(bulb);

      this.heatLamps.push({ light: heatLight, bulb });
    });

    // --- Walk-in Freezer Cyan Chill Light (X: 22, Z: 11) ---
    const freezerLight = new THREE.PointLight(0x06b6d4, 1.6, 16, 1.5);
    freezerLight.position.set(22, 3.2, 11);
    freezerLight.castShadow = false;
    this.scene.add(freezerLight);
    this.freezerLights.push(freezerLight);

    // --- Drive-Thru Outside Streetlamp Amber Light (X: -32, Z: 5) ---
    this.driveThruLight = new THREE.PointLight(0xfef08a, 2.8, 18, 1.5);
    this.driveThruLight.position.set(-32, 3.2, 5);
    this.driveThruLight.castShadow = false;
    this.scene.add(this.driveThruLight);
  }

  initFlashlight() {
    // Player mounted Spotlight (Bright & wide beam for clear visibility)
    this.flashlight = new THREE.SpotLight(0xfffaed, 4.2, 28, Math.PI / 4.2, 0.45, 1.2);
    this.flashlight.position.set(0, 0, 0);
    this.flashlight.castShadow = false;

    this.flashlightTarget = new THREE.Object3D();
    this.scene.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;

    this.scene.add(this.flashlight);

    this.flashlightOn = true;
    this.flashlightBattery = 100;
  }

  toggleFlashlight() {
    this.flashlightOn = !this.flashlightOn;
    this.flashlight.visible = this.flashlightOn;
    return this.flashlightOn;
  }

  setPower(active) {
    this.powerActive = active;
    if (!active) {
      // Power outage! Blackout all fluorescents, turn on eerie red emergency lights
      this.fluorescents.forEach((f) => {
        if (f.light) f.light.intensity = 0;
        f.mesh.material.color.setHex(0x111111);
      });
      this.ambientLight.color.setHex(0x220505);
      this.ambientLight.intensity = 0.24;
    } else {
      this.ambientLight.color.setHex(0x100808);
      this.ambientLight.intensity = 0.85;
    }
  }

  update(delta, time) {
    // Update Flashlight position & target to match player camera
    if (this.flashlight && this.camera) {
      this.flashlight.position.copy(this.camera.position);

      this.camera.getWorldDirection(this.forward);
      this.flashlightTarget.position.copy(this.camera.position).addScaledVector(this.forward, 10);

      // Flashlight subtle sway / breathing jitter
      if (this.flashlightOn) {
        this.flashlightFlickerTimer -= delta;
        if (this.flashlightFlickerTimer <= 0) {
          this.flashlight.intensity = Math.random() < 0.02 ? 0.8 : 4.2;
          this.flashlightFlickerTimer = 0.12;
        }
      }
    }

    // Update Fluorescent lights flickering
    this.flickerTimer -= delta;
    if (this.powerActive && this.flickerTimer <= 0) {
      this.flickerTimer = 0.08;
      this.fluorescents.forEach((f) => {
        const noise = Math.sin(time * 15 + f.flickerSeed) * Math.cos(time * 33 + f.flickerSeed);
        if (Math.random() < f.flickerChance || noise > 0.92) {
          if (f.light) f.light.intensity = Math.random() * 0.3;
          f.mesh.material.color.setHex(0x333322);
        } else {
          if (f.light) f.light.intensity = f.baseIntensity + (Math.random() - 0.5) * 0.2;
          f.mesh.material.color.setHex(0xfef9c3);
        }
      });
    }

    // Heat lamps pulsing warm glow
    this.heatLamps.forEach((h, idx) => {
      const pulse = Math.sin(time * 3 + idx) * 0.3;
      if (h.light) h.light.intensity = 2.5 + pulse;
    });
  }
}
