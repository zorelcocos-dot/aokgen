import * as THREE from 'three';
import { AnimatedSprite } from '../entities/AnimatedSprite.js';

/**
 * PropFactory builds 3D PBR props and interactive items:
 * - Stainless Steel Deep Fryers with boiling bubbling black oil
 * - Rotisserie Oven with rotating roasting anomaly
 * - Service Counter with Vintage Cash Registers
 * - Food Warming Racks with Heat Lamps
 * - Circuit Breaker Box (with interactive switch)
 * - Mop Bucket & Grease Spill Decals
 * - Drive-Thru Window
 * - Cursed Items & Keycards
 */
export class PropFactory {
  constructor(scene, materials, audio) {
    this.scene = scene;
    this.materials = materials;
    this.audio = audio;
    this.interactables = [];
  }

  /**
   * Deep Fryer Station (Stainless steel bank of 3 fryers)
   */
  createDeepFryerBank(x, y, z) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    // Main Stainless Steel Body
    const bodyGeo = new THREE.BoxGeometry(3.6, 1.2, 1.2);
    const body = new THREE.Mesh(bodyGeo, this.materials.metal);
    body.position.y = 0.6;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Top fryer vat openings (3 deep oil wells)
    for (let i = -1; i <= 1; i++) {
      const wellGeo = new THREE.BoxGeometry(0.9, 0.4, 0.8);
      const wellMat = new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.9
      });
      const well = new THREE.Mesh(wellGeo, wellMat);
      well.position.set(i * 1.1, 1.1, 0);
      group.add(well);

      // Boiling Black Foul Grease / Oil Surface
      const oilGeo = new THREE.PlaneGeometry(0.85, 0.75);
      const oilMat = new THREE.MeshStandardMaterial({
        color: 0x1a120b,
        roughness: 0.05, // highly reflective boiling liquid
        metalness: 0.2
      });
      const oil = new THREE.Mesh(oilGeo, oilMat);
      oil.rotation.x = -Math.PI / 2;
      oil.position.set(i * 1.1, 1.15, 0);
      group.add(oil);

      // Fryer Wire Basket
      const basketGeo = new THREE.BoxGeometry(0.5, 0.4, 0.6);
      const basketMat = new THREE.MeshStandardMaterial({
        color: 0x888888,
        wireframe: true
      });
      const basket = new THREE.Mesh(basketGeo, basketMat);
      basket.position.set(i * 1.1, 1.3, 0);
      group.add(basket);
    }

    // The quest uses this as a real interaction point. Previously the fryer
    // was only visual, making Phase 3 impossible to complete.
    group.userData = {
      type: 'fryer_station',
      loadedCount: 0,
      maxMeat: 2
    };
    this.interactables.push(group);

    // Overhead Exhaust Hood
    const hoodGeo = new THREE.BoxGeometry(4.0, 0.8, 1.6);
    const hood = new THREE.Mesh(hoodGeo, this.materials.metal);
    hood.position.set(0, 3.2, 0);
    hood.castShadow = true;
    group.add(hood);

    this.scene.add(group);
    return group;
  }

  /**
   * Rotisserie Roasting Oven with glass door and glowing heating coils
   */
  createRotisserieOven(x, y, z) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    // Outer Cabinet
    const cabinetGeo = new THREE.BoxGeometry(1.6, 2.2, 1.2);
    const cabinet = new THREE.Mesh(cabinetGeo, this.materials.metal);
    cabinet.position.y = 1.1;
    cabinet.castShadow = true;
    group.add(cabinet);

    // Glass Window
    const glassGeo = new THREE.PlaneGeometry(1.2, 1.4);
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.1,
      transparent: true,
      opacity: 0.55
    });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.set(0, 1.2, 0.61);
    group.add(glass);

    // Glowing Orange Roasting Spits inside
    const spitGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8);
    const spitMat = new THREE.MeshBasicMaterial({ color: 0xff4500 });
    const spit = new THREE.Mesh(spitGeo, spitMat);
    spit.rotation.z = Math.PI / 2;
    spit.position.set(0, 1.2, 0);
    group.add(spit);

    this.scene.add(group);
    return group;
  }

  /**
   * Fast Food Dining Booth & Table
   */
  createDiningBooth(x, y, z, rotationY = 0) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotationY;

    const seatMat = new THREE.MeshStandardMaterial({
      color: 0x801010, // Vintage retro red vinyl booth seat
      roughness: 0.4
    });

    // Left Bench
    const benchGeo = new THREE.BoxGeometry(0.7, 0.5, 1.8);
    const bench1 = new THREE.Mesh(benchGeo, seatMat);
    bench1.position.set(-0.8, 0.25, 0);
    group.add(bench1);

    const backGeo = new THREE.BoxGeometry(0.2, 0.8, 1.8);
    const back1 = new THREE.Mesh(backGeo, seatMat);
    back1.position.set(-1.05, 0.8, 0);
    group.add(back1);

    // Right Bench
    const bench2 = new THREE.Mesh(benchGeo, seatMat);
    bench2.position.set(0.8, 0.25, 0);
    group.add(bench2);

    const back2 = new THREE.Mesh(backGeo, seatMat);
    back2.position.set(1.05, 0.8, 0);
    group.add(back2);

    // Center Table
    const tableTopGeo = new THREE.BoxGeometry(0.9, 0.08, 1.6);
    const tableTopMat = new THREE.MeshStandardMaterial({
      color: 0xdfd7ca,
      roughness: 0.3
    });
    const tableTop = new THREE.Mesh(tableTopGeo, tableTopMat);
    tableTop.position.set(0, 0.75, 0);
    group.add(tableTop);

    // Table Leg
    const legGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.75, 8);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 });
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(0, 0.375, 0);
    group.add(leg);

    this.scene.add(group);
    return group;
  }

  /**
   * Service Counter with Cash Registers
   */
  createServiceCounter(x, y, z) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    // Main counter body split into two modules. The center is a real
    // pass-through, so the player sees the kitchen instead of a giant red
    // wall with a black rectangle pasted over it.
    const counterGeo = new THREE.BoxGeometry(4.35, 1.1, 1.2);
    const counterMat = new THREE.MeshStandardMaterial({
      color: 0x5a1818, // KFC dark red laminate
      roughness: 0.5,
      metalness: 0.08
    });
    [-2.85, 2.85].forEach((xPos) => {
      const counter = new THREE.Mesh(counterGeo, counterMat);
      counter.position.set(xPos, 0.55, 0);
      counter.castShadow = true;
      counter.receiveShadow = true;
      group.add(counter);
    });

    // Counter Top
    const topGeo = new THREE.BoxGeometry(4.55, 0.1, 1.4);
    const topMat = new THREE.MeshStandardMaterial({
      color: 0xb8c4cf,
      roughness: 0.32,
      metalness: 0.4
    });
    [-2.75, 2.75].forEach((xPos) => {
      const top = new THREE.Mesh(topGeo, topMat);
      top.position.set(xPos, 1.15, 0);
      top.castShadow = true;
      group.add(top);
    });

    // Small illuminated service sign above the opening, kept thin so it does
    // not read as another floating wall.
    const serviceSign = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 0.18, 0.08),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 })
    );
    serviceSign.position.set(0, 1.42, -0.68);
    group.add(serviceSign);

    // 2 Vintage Cash Registers, one on each counter module.
    [-2.85, 2.85].forEach((xPos) => {
      const regGeo = new THREE.BoxGeometry(0.6, 0.4, 0.6);
      const regMat = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.6
      });
      const reg = new THREE.Mesh(regGeo, regMat);
      reg.position.set(xPos, 1.4, 0);
      reg.castShadow = true;
      group.add(reg);

      // Green CRT Screen on Register
      const screenGeo = new THREE.BoxGeometry(0.3, 0.25, 0.1);
      const screenMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
      const screen = new THREE.Mesh(screenGeo, screenMat);
      screen.position.set(xPos, 1.7, 0.1);
      group.add(screen);
    });

    this.scene.add(group);
    return group;
  }

  /**
   * Interactive Circuit Breaker Box on wall
   */
  createBreakerBox(x, y, z, rotationY = 0) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotationY;

    // Metal Box
    const boxGeo = new THREE.BoxGeometry(0.8, 1.2, 0.3);
    const boxMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.5,
      metalness: 0.6
    });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.castShadow = true;
    group.add(box);

    // Breaker Switch Lever
    const leverGeo = new THREE.BoxGeometry(0.12, 0.3, 0.15);
    const leverMat = new THREE.MeshStandardMaterial({
      color: 0xef4444, // Red switch
      roughness: 0.3
    });
    const lever = new THREE.Mesh(leverGeo, leverMat);
    lever.position.set(0, 0, 0.16);
    group.add(lever);

    // Indicator Light
    const indGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const indMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
    const ind = new THREE.Mesh(indGeo, indMat);
    ind.position.set(0, 0.4, 0.16);
    group.add(ind);

    group.userData = {
      type: 'breaker',
      isTripped: false,
      indicator: indMat,
      lever: lever
    };

    this.interactables.push(group);
    this.scene.add(group);
    return group;
  }

  /**
   * Interactive Grease Spill Puddle on floor to clean with Mop
   */
  createGreaseSpill(x, y, z) {
    const puddleGeo = new THREE.CircleGeometry(1.6, 16);
    const puddleMat = new THREE.MeshStandardMaterial({
      color: 0x3d230d, // Dark foul rancid grease
      roughness: 0.05,
      metalness: 0.3,
      transparent: true,
      opacity: 0.9
    });
    const puddle = new THREE.Mesh(puddleGeo, puddleMat);
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(x, y + 0.02, z);
    puddle.receiveShadow = true;

    puddle.userData = {
      type: 'grease_spill',
      cleaned: false,
      cleanProgress: 0
    };

    this.interactables.push(puddle);
    this.scene.add(puddle);
    return puddle;
  }

  /**
   * Mop Bucket Prop
   */
  /**
   * High-detail 3D Commercial Janitor Mop Bucket with Wringer, Wheels, and Standing Mop
   */
  createMopBucket(x, y, z) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const plasticYellowMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b, // Vibrant commercial safety yellow
      roughness: 0.35,
      metalness: 0.1
    });

    const darkSteelMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.7,
      metalness: 0.8
    });

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.15,
      metalness: 0.95
    });

    const rubberMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.8
    });

    // 1. Yellow Rectangular Bucket Tub
    const tubGeo = new THREE.BoxGeometry(0.7, 0.45, 0.55);
    const tub = new THREE.Mesh(tubGeo, plasticYellowMat);
    tub.position.y = 0.32;
    tub.castShadow = true;
    tub.receiveShadow = true;
    group.add(tub);

    // Bucket Rim Lip
    const rimGeo = new THREE.BoxGeometry(0.76, 0.06, 0.61);
    const rim = new THREE.Mesh(rimGeo, plasticYellowMat);
    rim.position.y = 0.54;
    group.add(rim);

    // Dirty Wash Water inside tub
    const waterGeo = new THREE.PlaneGeometry(0.62, 0.48);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x3d3a28,
      roughness: 0.05,
      metalness: 0.3,
      transparent: true,
      opacity: 0.85
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.42;
    group.add(water);

    // 2. 4 Swivel Caster Wheels
    const wheelPositions = [
      { x: -0.28, z: -0.22 },
      { x: 0.28,  z: -0.22 },
      { x: -0.28, z: 0.22 },
      { x: 0.28,  z: 0.22 }
    ];

    wheelPositions.forEach(pos => {
      // Chrome Swivel Bracket
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.08), chromeMat);
      bracket.position.set(pos.x, 0.1, pos.z);
      group.add(bracket);

      // Black Rubber Wheel
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), rubberMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(pos.x, 0.06, pos.z);
      group.add(wheel);
    });

    // 3. Curved Wire Carry Handle
    const handleGeo = new THREE.TorusGeometry(0.32, 0.018, 8, 16, Math.PI);
    const handle = new THREE.Mesh(handleGeo, chromeMat);
    handle.rotation.z = Math.PI;
    handle.position.set(0, 0.65, 0);
    group.add(handle);

    // 4. Heavy Down-Press Wringer Housing
    const wringerBox = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.32), darkSteelMat);
    wringerBox.position.set(0.16, 0.65, 0);
    wringerBox.castShadow = true;
    group.add(wringerBox);

    // Wringer Lever Handle (Angled up with red grip)
    const leverBar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 8), chromeMat);
    leverBar.position.set(0.26, 0.92, 0.15);
    leverBar.rotation.x = -Math.PI / 4;
    leverBar.rotation.z = -Math.PI / 6;
    group.add(leverBar);

    const gripMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.6 });
    const leverGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 8), gripMat);
    leverGrip.position.set(0.36, 1.12, 0.3);
    leverGrip.rotation.x = -Math.PI / 4;
    leverGrip.rotation.z = -Math.PI / 6;
    group.add(leverGrip);

    // 5. Standing Industrial Mop leaning in bucket
    const mopGroup = new THREE.Group();
    mopGroup.position.set(-0.08, 0.35, 0);
    mopGroup.rotation.z = 0.12; // compact, believable tilt

    // Wooden Handle
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.6,
      metalness: 0.25
    });
    const mopPole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 1.15, 8), woodMat);
    mopPole.position.y = 0.58;
    mopGroup.add(mopPole);

    // Blue Mop Head Clamp
    const clampMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, metalness: 0.7 });
    const mopClamp = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.12), clampMat);
    mopClamp.position.y = 0.15;
    mopGroup.add(mopClamp);

    // Cotton Yarn Mop Strands
    const cottonMat = new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.95 });
    const yarn = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.25, 8), cottonMat);
    yarn.position.y = 0.02;
    mopGroup.add(yarn);

    group.add(mopGroup);

    // Keep the full prop readable at close range without letting the handle
    // dominate the camera like a giant red pole.
    group.scale.setScalar(0.72);

    // 6. Caution Wet Floor Graphic Sign Plate on Front
    const signPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.025, 0.22, 0.35),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5 })
    );
    signPlate.position.set(-0.36, 0.32, 0);
    group.add(signPlate);

    const signInset = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.12, 0.22),
      new THREE.MeshBasicMaterial({ color: 0x111827 })
    );
    signInset.position.set(-0.38, 0.32, 0);
    group.add(signInset);

    group.userData = { type: 'mop_pickup' };
    this.interactables.push(group);
    this.scene.add(group);
    return group;
  }
}
