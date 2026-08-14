import * as THREE from 'three';

/**
 * PropFactory - Creates all interactive and environmental props with story purpose.
 * No random filler - every object has logical placement.
 */

export class PropFactory {
  constructor(scene, materials, audio) {
    this.scene = scene;
    this.materials = materials;
    this.audio = audio;
    this.interactables = [];
  }

  // --- CORE PROPS (Improved) ---

  createDeepFryerBank(x, y, z) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const bodyGeo = new THREE.BoxGeometry(3.8, 1.25, 1.3);
    const body = new THREE.Mesh(bodyGeo, this.materials.metal);
    body.position.y = 0.625;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // 3 wells
    for (let i = -1; i <= 1; i++) {
      const wellGeo = new THREE.BoxGeometry(0.95, 0.45, 0.95);
      const wellMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.95 });
      const well = new THREE.Mesh(wellGeo, wellMat);
      well.position.set(i * 1.15, 1.15, 0);
      group.add(well);

      const oilGeo = new THREE.PlaneGeometry(0.9, 0.9);
      const oilMat = new THREE.MeshStandardMaterial({ color: 0x1a150d, roughness: 0.08, metalness: 0.18 });
      const oil = new THREE.Mesh(oilGeo, oilMat);
      oil.rotation.x = -Math.PI / 2;
      oil.position.set(i * 1.15, 1.20, 0);
      // Subtle bubble animation will be done via material shift in render loop? keep static
      group.add(oil);

      const basket = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.62), new THREE.MeshStandardMaterial({ color: 0x888888, wireframe: true }));
      basket.position.set(i * 1.15, 1.38, 0);
      group.add(basket);
    }

    group.userData = { type: 'fryer_station', loadedCount: 0, maxMeat: 2 };
    this.interactables.push(group);

    const hood = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.85, 1.7), this.materials.metal);
    hood.position.set(0, 3.25, 0);
    hood.castShadow = true;
    group.add(hood);

    // Temperature gauge decals
    const gaugeMat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
    for (let i = -1; i <= 1; i++) {
      const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.08, 12), gaugeMat);
      gauge.position.set(i * 1.15, 1.0, 0.66);
      group.add(gauge);
    }

    this.scene.add(group);
    return group;
  }

  createRotisserieOven(x, y, z) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.65, 2.25, 1.25), this.materials.metal);
    cabinet.position.y = 1.125;
    cabinet.castShadow = true;
    group.add(cabinet);

    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.45), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.12, transparent: true, opacity: 0.55 }));
    glass.position.set(0, 1.25, 0.635);
    group.add(glass);

    // Glow
    const spit = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8), new THREE.MeshBasicMaterial({ color: 0xff4d12 }));
    spit.rotation.z = Math.PI / 2;
    spit.position.set(0, 1.25, 0);
    group.add(spit);

    // Meat inside - disturbing
    const meat = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), new THREE.MeshStandardMaterial({ color: 0x6b1a1a, roughness: 0.6 }));
    meat.position.set(0, 1.25, 0);
    group.add(meat);

    this.scene.add(group);
    return group;
  }

  createDiningBooth(x, y, z, rotationY = 0, broken = false) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotationY;

    const seatMat = new THREE.MeshStandardMaterial({ color: broken ? 0x5e1010 : 0x7f1515, roughness: 0.44 });
    const benchGeo = new THREE.BoxGeometry(0.7, 0.5, 1.8);
    const bench1 = new THREE.Mesh(benchGeo, seatMat);
    bench1.position.set(-0.8, 0.25, 0);
    group.add(bench1);
    const backGeo = new THREE.BoxGeometry(0.2, 0.8, 1.8);
    const back1 = new THREE.Mesh(backGeo, seatMat);
    back1.position.set(-1.05, 0.8, 0);
    group.add(back1);

    const bench2 = new THREE.Mesh(benchGeo, seatMat);
    bench2.position.set(0.8, 0.25, 0);
    if (broken) {
      bench2.rotation.z = 0.3;
      bench2.position.y = 0.12;
    }
    group.add(bench2);
    const back2 = new THREE.Mesh(backGeo, seatMat);
    back2.position.set(1.05, 0.8, 0);
    group.add(back2);

    const tableTopGeo = new THREE.BoxGeometry(0.92, 0.09, 1.65);
    const tableMat = new THREE.MeshStandardMaterial({ color: 0xdbd2c2, roughness: 0.34, metalness: 0.15 });
    const tableTop = new THREE.Mesh(tableTopGeo, tableMat);
    tableTop.position.set(0, 0.75, 0);
    if (broken) {
      tableTop.rotation.z = 0.12;
      tableTop.position.set(0.2, 0.65, 0.2);
    }
    group.add(tableTop);

    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.75, 8), new THREE.MeshStandardMaterial({ color: 0x212121, metalness: 0.8 }));
    leg.position.set(0, 0.375, 0);
    group.add(leg);

    // On table: tray, cup, papers for storytelling if not broken
    if (!broken && Math.random() < 0.7) {
      const tray = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.35), new THREE.MeshStandardMaterial({ color: 0xc0392b }));
      tray.position.set(0, 0.81, 0);
      group.add(tray);
      if (Math.random() < 0.5) {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.18, 10), new THREE.MeshStandardMaterial({ color: 0xf5f5f5 }));
        cup.position.set(0.18, 0.9, 0.12);
        group.add(cup);
      }
    }

    this.scene.add(group);
    return group;
  }

  createServiceCounter(x, y, z) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const counterMat = new THREE.MeshStandardMaterial({ color: 0x5a1d1d, roughness: 0.55 });
    const topMat = new THREE.MeshStandardMaterial({ color: 0xb8c4cf, roughness: 0.32, metalness: 0.35 });

    [-2.85, 2.85].forEach(xPos => {
      const counter = new THREE.Mesh(new THREE.BoxGeometry(4.35, 1.1, 1.2), counterMat);
      counter.position.set(xPos, 0.55, 0);
      counter.castShadow = true;
      group.add(counter);
      const top = new THREE.Mesh(new THREE.BoxGeometry(4.55, 0.12, 1.4), topMat);
      top.position.set(xPos, 1.16, 0);
      top.castShadow = true;
      group.add(top);
    });

    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 0.08), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
    sign.position.set(0, 1.44, -0.68);
    group.add(sign);

    [-2.85, 2.85].forEach(xPos => {
      const reg = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.42, 0.6), new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6 }));
      reg.position.set(xPos, 1.42, 0);
      reg.castShadow = true;
      group.add(reg);
      const screen = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.26, 0.1), new THREE.MeshBasicMaterial({ color: 0x22c55e }));
      screen.position.set(xPos, 1.73, 0.12);
      group.add(screen);
    });

    this.scene.add(group);
    return group;
  }

  createBreakerBox(x, y, z, rotationY = 0) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotationY;

    const box = new THREE.Mesh(new THREE.BoxGeometry(0.82, 1.25, 0.32), new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.55, metalness: 0.55 }));
    box.castShadow = true;
    group.add(box);

    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 0.15), new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.28 }));
    lever.position.set(0, 0, 0.17);
    group.add(lever);

    const indMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
    const ind = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), indMat);
    ind.position.set(0, 0.42, 0.17);
    group.add(ind);

    group.userData = { type: 'breaker', isTripped: false, indicator: indMat, lever };

    this.interactables.push(group);
    this.scene.add(group);
    return group;
  }

  createGreaseSpill(x, y, z) {
    const puddleGeo = new THREE.CircleGeometry(1.25 + Math.random() * 0.5, 14);
    const puddleMat = new THREE.MeshStandardMaterial({ color: 0x2e1f0f, roughness: 0.04, metalness: 0.28, transparent: true, opacity: 0.88 });
    const puddle = new THREE.Mesh(puddleGeo, puddleMat);
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(x, y + 0.02, z);
    puddle.receiveShadow = true;
    puddle.userData = { type: 'grease_spill', cleaned: false, cleanProgress: 0 };
    this.interactables.push(puddle);
    this.scene.add(puddle);
    return puddle;
  }

  createMopBucket(x, y, z) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const yellowMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.35 });
    const darkSteel = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7, metalness: 0.8 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.15, metalness: 0.95 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });

    const tub = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.46, 0.56), yellowMat);
    tub.position.y = 0.32;
    tub.castShadow = true;
    group.add(tub);

    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.06, 0.62), yellowMat);
    rim.position.y = 0.54;
    group.add(rim);

    const waterMat = new THREE.MeshStandardMaterial({ color: 0x3d3a28, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.85 });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.48), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.42;
    group.add(water);

    const wheelPositions = [{ x: -0.28, z: -0.22 }, { x: 0.28, z: -0.22 }, { x: -0.28, z: 0.22 }, { x: 0.28, z: 0.22 }];
    wheelPositions.forEach(pos => {
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.08), chrome);
      bracket.position.set(pos.x, 0.1, pos.z);
      group.add(bracket);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), rubber);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(pos.x, 0.06, pos.z);
      group.add(wheel);
    });

    const handleGeo = new THREE.TorusGeometry(0.32, 0.018, 8, 16, Math.PI);
    const handle = new THREE.Mesh(handleGeo, chrome);
    handle.rotation.z = Math.PI;
    handle.position.set(0, 0.65, 0);
    group.add(handle);

    const wringerBox = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.32), darkSteel);
    wringerBox.position.set(0.16, 0.65, 0);
    wringerBox.castShadow = true;
    group.add(wringerBox);

    const leverBar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 8), chrome);
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

    const mopGroup = new THREE.Group();
    mopGroup.position.set(-0.08, 0.35, 0);
    mopGroup.rotation.z = 0.12;

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.6, metalness: 0.25 });
    const mopPole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 1.15, 8), woodMat);
    mopPole.position.y = 0.58;
    mopGroup.add(mopPole);

    const clampMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, metalness: 0.7 });
    const mopClamp = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.12), clampMat);
    mopClamp.position.y = 0.15;
    mopGroup.add(mopClamp);

    const cottonMat = new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.95 });
    const yarn = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.25, 8), cottonMat);
    yarn.position.y = 0.02;
    mopGroup.add(yarn);

    group.add(mopGroup);
    group.scale.setScalar(0.72);

    const signPlate = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.22, 0.35), new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5 }));
    signPlate.position.set(-0.36, 0.32, 0);
    group.add(signPlate);

    const signInset = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.22), new THREE.MeshBasicMaterial({ color: 0x111827 }));
    signInset.position.set(-0.38, 0.32, 0);
    group.add(signInset);

    group.userData = { type: 'mop_pickup' };
    this.interactables.push(group);
    this.scene.add(group);
    return group;
  }

  // --- NEW STORY-PROPS ---

  createDocument(x, y, z, data) {
    // Visual paper
    const paperGroup = new THREE.Group();
    paperGroup.position.set(x, y, z);
    paperGroup.rotation.y = data.rotation || 0;

    const pageGeo = new THREE.PlaneGeometry(0.52, 0.68);
    const pageMat = new THREE.MeshStandardMaterial({ color: 0xefe6c7, roughness: 0.9, side: THREE.DoubleSide });
    const page = new THREE.Mesh(pageGeo, pageMat);
    page.rotation.x = data.flat ? -Math.PI / 2 : 0;
    if (!data.flat) page.rotation.y = 0;
    else page.position.y = 0.03;
    paperGroup.add(page);

    if (!data.flat) {
      paperGroup.rotation.y = Math.PI / 2; // face out from wall
    }

    paperGroup.userData = {
      type: 'document',
      docId: data.docId,
      docTitle: data.title,
      content: data.content
    };

    // Add subtle emissive glow if important
    if (data.important) {
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.74, 0.02), new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.08 }));
      glow.position.z = -0.02;
      paperGroup.add(glow);
    }

    this.interactables.push(paperGroup);
    this.scene.add(paperGroup);
    return paperGroup;
  }

  createClipboard(x, y, z, docId) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = Math.PI / 2;

    const board = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.03), new THREE.MeshStandardMaterial({ color: 0x5a3e22 }));
    group.add(board);
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.46), new THREE.MeshStandardMaterial({ color: 0xfffef0, side: THREE.DoubleSide }));
    paper.position.set(0, -0.02, 0.02);
    group.add(paper);

    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.04), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.8 }));
    clip.position.set(0, 0.22, 0.03);
    group.add(clip);

    group.userData = { type: 'document', docId, docTitle: 'Clipboard', content: '' };
    this.interactables.push(group);
    this.scene.add(group);
    return group;
  }

  createPhotoFrame(x, y, z, docId, textureUrl) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = Math.PI / 2;

    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.42), new THREE.MeshStandardMaterial({ color: 0x3a2a1a }));
    group.add(frame);

    if (textureUrl) {
      const loader = new THREE.TextureLoader();
      loader.load(textureUrl, tex => {
        const photo = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.42), new THREE.MeshStandardMaterial({ map: tex }));
        photo.position.set(0.025, 0, 0);
        photo.rotation.y = 0;
        group.add(photo);
      });
    }

    group.userData = { type: 'document', docId, docTitle: 'Photo', content: '' };
    this.interactables.push(group);
    this.scene.add(group);
    return group;
  }

  createBatteryPickup(x, y, z) {
    const batMat = new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.5, roughness: 0.32, emissive: 0x553300, emissiveIntensity: 0.18 });
    const bat = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.22, 0.12), batMat);
    bat.position.set(x, y, z);
    bat.userData = { type: 'battery_pickup' };
    this.scene.add(bat);
    this.interactables.push(bat);
    return bat;
  }

  createFuelCan(x, y, z) {
    const fuelMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.32, metalness: 0.35, emissive: 0x440000, emissiveIntensity: 0.22 });
    const can = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.52, 0.34), fuelMat);
    can.position.set(x, y, z);
    can.userData = { type: 'fuel_can_pickup' };
    this.scene.add(can);
    this.interactables.push(can);
    return can;
  }

  createKeyCard(x, y, z) {
    const keyMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.22, emissive: 0x6b4a00, emissiveIntensity: 0.45 });
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.64), keyMat);
    card.position.set(x, y, z);
    card.userData = { type: 'keycard_pickup' };
    this.scene.add(card);
    this.interactables.push(card);
    return card;
  }

  createOfficeKey(x, y, z) {
    const keyMat = new THREE.MeshStandardMaterial({ color: 0xc0a060, metalness: 0.85, roughness: 0.25 });
    const keyGroup = new THREE.Group();
    keyGroup.position.set(x, y, z);
    const head = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 8, 16), keyMat);
    head.rotation.x = Math.PI / 2;
    head.position.set(0, 0.1, 0);
    keyGroup.add(head);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.28), keyMat);
    shaft.position.set(0, 0, 0.18);
    keyGroup.add(shaft);
    keyGroup.userData = { type: 'office_key_pickup' };
    this.scene.add(keyGroup);
    this.interactables.push(keyGroup);
    return keyGroup;
  }

  createSodaCan(x, y, z) {
    const sodaMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.75, roughness: 0.22 });
    const soda = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.28, 12), sodaMat);
    soda.position.set(x, y, z);
    soda.userData = { type: 'soda_pickup' };
    this.scene.add(soda);
    this.interactables.push(soda);
    return soda;
  }

  createCarKey(x, y, z) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x252525, roughness: 0.7 });
    const fob = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.26), mat);
    fob.position.set(x, y, z);
    fob.userData = { type: 'car_key_pickup' };
    this.scene.add(fob);
    this.interactables.push(fob);
    return fob;
  }

  createSafe(x, y, z) {
    const safe = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.6), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.75, roughness: 0.35 }));
    safe.position.set(x, y, z);
    safe.userData = { type: 'safe', isOpen: false };
    this.scene.add(safe);
    this.interactables.push(safe);
    return safe;
  }

  createPhone(x, y, z) {
    const phone = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.32), new THREE.MeshStandardMaterial({ color: 0x1e1e22 }));
    phone.position.set(x, y, z);
    phone.userData = { type: 'phone' };
    this.scene.add(phone);
    this.interactables.push(phone);
    return phone;
  }

  createCCTVMonitor(x, y, z, camId) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.35), new THREE.MeshStandardMaterial({ color: 0x1a1f2a }));
    group.add(body);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.32), new THREE.MeshBasicMaterial({ color: 0x88ff88 }));
    screen.position.set(0, 0, 0.18);
    group.add(screen);
    group.userData = { type: 'cctv_monitor', camId };
    this.scene.add(group);
    this.interactables.push(group);
    return group;
  }
}
