import * as THREE from 'three';
import { PropFactory } from './PropFactory.js';

/**
 * LevelBuilder constructs the expanded 65m x 65m Horror KFC facility:
 * - Zone 1: Main Dining Hall, Cursed Ball Pit PlayPlace, Restrooms
 * - Zone 2: Industrial Kitchen, Fryer Banks, Rotisserie Ovens, Prep Island
 * - Zone 3: Walk-in Deep Meat Freezer Vault Labyrinth
 * - Zone 4: Manager's Security Office & Surveillance Suite
 * - Zone 5: Sub-Basement Grinder Incubator & Loading Bay
 * - Zone 6: Drive-Thru Window & Rainy Parking Lot
 */
export class LevelBuilder {
  constructor(scene, pbrTextures, audio) {
    this.scene = scene;
    this.pbr = pbrTextures;
    this.audio = audio;

    this.colliders = [];
    this.initMaterials();
    this.propFactory = new PropFactory(scene, this.materials, audio);
  }

  initMaterials() {
    this.materials = {
      floor: new THREE.MeshStandardMaterial({
        map: this.pbr.floor.albedo,
        normalMap: this.pbr.floor.normal,
        roughnessMap: this.pbr.floor.roughness,
        roughness: 0.5,
        metalness: 0.1
      }),

      metal: new THREE.MeshStandardMaterial({
        map: this.pbr.metal.albedo,
        normalMap: this.pbr.metal.normal,
        roughnessMap: this.pbr.metal.roughness,
        metalnessMap: this.pbr.metal.metalness,
        metalness: 0.85,
        roughness: 0.35
      }),

      ceiling: new THREE.MeshStandardMaterial({
        map: this.pbr.ceiling.albedo,
        normalMap: this.pbr.ceiling.normal,
        roughness: 0.8
      }),

      diningWall: new THREE.MeshStandardMaterial({
        color: 0x4a1818,
        roughness: 0.7
      }),

      menuBoard: new THREE.MeshBasicMaterial({
        map: this.pbr.menu
      }),

      freezerDoor: new THREE.MeshStandardMaterial({
        map: this.pbr.freezerDoor,
        roughness: 0.3,
        metalness: 0.8
      }),

      glass: new THREE.MeshStandardMaterial({
        color: 0x88ccff,
        roughness: 0.05,
        metalness: 0.1,
        transparent: true,
        opacity: 0.55
      }),

      tileWall: new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.3,
        metalness: 0.1
      })
    };

    this.pbr.floor.albedo.repeat.set(24, 24);
    this.pbr.floor.normal.repeat.set(24, 24);
    this.pbr.floor.roughness.repeat.set(24, 24);

    this.pbr.metal.albedo.repeat.set(8, 2);
    this.pbr.metal.normal.repeat.set(8, 2);
    this.pbr.metal.roughness.repeat.set(8, 2);
    this.pbr.metal.metalness.repeat.set(8, 2);

    this.pbr.ceiling.albedo.repeat.set(20, 20);
    this.pbr.ceiling.normal.repeat.set(20, 20);
  }

  build() {
    this.buildArchitecture();
    this.buildProps();
    return {
      colliders: this.colliders,
      interactables: this.propFactory.interactables,
      propFactory: this.propFactory
    };
  }

  buildArchitecture() {
    const wallThickness = 0.4;
    const roomHeight = 4.2;

    // --- Expanded Main Floor (60m x 70m, Z: -30 to 35, X: -30 to 30) ---
    const floorGeo = new THREE.PlaneGeometry(60, 70);
    const floor = new THREE.Mesh(floorGeo, this.materials.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 2.5);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // --- Ceiling ---
    const ceilingGeo = new THREE.PlaneGeometry(60, 70);
    const ceiling = new THREE.Mesh(ceilingGeo, this.materials.ceiling);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, roomHeight, 2.5);
    this.scene.add(ceiling);

    // ==========================================
    // 1. EXTERIOR BOUNDARY WALLS
    // ==========================================
    // North Wall (Front facade, Z = -30)
    this.createWall(0, roomHeight / 2, -30, 60, roomHeight, wallThickness, this.materials.diningWall);
    // South Wall (Back dock & loading bay, Z = 35)
    this.createWall(0, roomHeight / 2, 35, 60, roomHeight, wallThickness, this.materials.metal);
    // East Wall (Full perimeter, X = 30)
    this.createWall(30, roomHeight / 2, 2.5, wallThickness, roomHeight, 70, this.materials.metal);
    // West Wall (with Drive-Thru Window Cutout at Z: 4 to 6)
    this.createWall(-30, roomHeight / 2, -13, wallThickness, roomHeight, 34, this.materials.metal); // Z: -30 to 4
    this.createWall(-30, roomHeight / 2, 20.5, wallThickness, roomHeight, 29, this.materials.metal); // Z: 6 to 35
    this.createWall(-30, 0.5, 5, wallThickness, 1.0, 2.0, this.materials.metal); // Sill
    this.createWall(-30, 3.6, 5, wallThickness, 1.2, 2.0, this.materials.metal); // Lintel

    // ==========================================
    // 2. ZONE 1: FRONT DINING WING (Z: -30 to -4)
    // ==========================================
    // Dividing Wall between Dining Room and Kitchen (Z = -4) with Center Service Passage Opening (X: -3 to 3)
    this.createWall(-18, roomHeight / 2, -4, 24, roomHeight, wallThickness, this.materials.metal); // X: -30 to -6
    this.createWall(18, roomHeight / 2, -4, 24, roomHeight, wallThickness, this.materials.metal);  // X: 6 to 30
    this.createWall(0, 3.6, -4, 6.0, 1.2, wallThickness, this.materials.metal); // Top Lintel over service opening

    // Menu Board mounted above front service counter opening
    const menuGeo = new THREE.BoxGeometry(6.0, 1.15, 0.2);
    const menu = new THREE.Mesh(menuGeo, this.materials.menuBoard);
    menu.position.set(0, 3.15, -3.9);
    this.scene.add(menu);

    // --- Cursed PlayPlace Ball Pit Room (East Wing: X: 15 to 30, Z: -30 to -4) ---
    // Wall separating PlayPlace from Dining Room (X = 15) with Archway Door (Z: -16 to -14)
    this.createWall(15, roomHeight / 2, -23, wallThickness, roomHeight, 14, this.materials.diningWall);
    this.createWall(15, roomHeight / 2, -9, wallThickness, roomHeight, 10, this.materials.diningWall);
    this.createWall(15, 3.6, -15, wallThickness, 1.2, 2.0, this.materials.diningWall);

    // --- Restrooms (West Wing: X: -30 to -15, Z: -30 to -16) ---
    this.createWall(-22.5, roomHeight / 2, -16, 15, roomHeight, wallThickness, this.materials.tileWall); // South Restroom Wall
    this.createWall(-15, roomHeight / 2, -24, wallThickness, roomHeight, 12, this.materials.tileWall); // East Restroom Wall
    this.createWall(-15, 3.6, -17, wallThickness, 1.2, 2.0, this.materials.tileWall);

    // ==========================================
    // 3. ZONE 3: WALK-IN FREEZER VAULT (East: X: 14 to 30, Z: 0 to 22)
    // ==========================================
    // North Wall of Freezer (Z = 0)
    this.createWall(22, roomHeight / 2, 0, 16, roomHeight, wallThickness, this.materials.metal);
    // South Wall of Freezer (Z = 22)
    this.createWall(22, roomHeight / 2, 22, 16, roomHeight, wallThickness, this.materials.metal);
    // West Wall of Freezer (X = 14) with Doorway at Z: 10 to 12
    this.createWall(14, roomHeight / 2, 5, wallThickness, roomHeight, 10, this.materials.metal);
    this.createWall(14, roomHeight / 2, 17, wallThickness, roomHeight, 10, this.materials.metal);
    this.createWall(14, 3.6, 11, wallThickness, 1.2, 2.0, this.materials.metal);

    // Heavy Walk-in Freezer Vault Door (Interactive)
    const doorGeo = new THREE.BoxGeometry(0.2, 3.0, 2.0);
    this.freezerDoorMesh = new THREE.Mesh(doorGeo, this.materials.freezerDoor);
    this.freezerDoorMesh.position.set(14, 1.5, 11);
    this.freezerDoorMesh.castShadow = true;
    this.freezerDoorMesh.userData = {
      type: 'freezer_door',
      isLocked: true,
      isOpen: false
    };
    this.propFactory.interactables.push(this.freezerDoorMesh);
    this.colliders.push(this.freezerDoorMesh);
    this.scene.add(this.freezerDoorMesh);

    // Yellow hazard frame
    const frameGeo = new THREE.BoxGeometry(0.25, 3.1, 0.15);
    const frameMat = new THREE.MeshBasicMaterial({ color: 0xeab308 });
    const fLeft = new THREE.Mesh(frameGeo, frameMat);
    fLeft.position.set(14, 1.5, 10);
    const fRight = new THREE.Mesh(frameGeo, frameMat);
    fRight.position.set(14, 1.5, 12);
    this.scene.add(fLeft);
    this.scene.add(fRight);

    // ==========================================
    // 4. ZONE 4: MANAGER'S OFFICE & SURVEILLANCE (West: X: -30 to -14, Z: 0 to 22)
    // ==========================================
    // North Wall of Office (Z = 0)
    this.createWall(-22, roomHeight / 2, 0, 16, roomHeight, wallThickness, this.materials.metal);
    // South Wall of Office (Z = 22)
    this.createWall(-22, roomHeight / 2, 22, 16, roomHeight, wallThickness, this.materials.metal);
    // East Wall of Office (X = -14) with Doorway at Z: 10 to 12
    this.createWall(-14, roomHeight / 2, 5, wallThickness, roomHeight, 10, this.materials.metal);
    this.createWall(-14, roomHeight / 2, 17, wallThickness, roomHeight, 10, this.materials.metal);
    this.createWall(-14, 3.6, 11, wallThickness, 1.2, 2.0, this.materials.metal);

    const oFrameMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8 });
    const oLeft = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.1, 0.15), oFrameMat);
    oLeft.position.set(-14, 1.5, 10);
    const oRight = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.1, 0.15), oFrameMat);
    oRight.position.set(-14, 1.5, 12);
    this.scene.add(oLeft);
    this.scene.add(oRight);

    // ==========================================
    // 5. ZONE 5: SOUTH PROCESSING CELLAR & DOCK (Z: 22 to 35, X: -30 to 30)
    // ==========================================
    // Dividing Wall between Kitchen and South Cellar (Z = 22, X: -14 to 14) with Archway at X: -2 to 2
    this.createWall(-8, roomHeight / 2, 22, 12, roomHeight, wallThickness, this.materials.metal);
    this.createWall(8, roomHeight / 2, 22, 12, roomHeight, wallThickness, this.materials.metal);
    this.createWall(0, 3.6, 22, 4.0, 1.2, wallThickness, this.materials.metal);
  }

  createWall(x, y, z, width, height, depth, material) {
    const geo = new THREE.BoxGeometry(width, height, depth);
    const wall = new THREE.Mesh(geo, material);
    wall.position.set(x, y, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    this.scene.add(wall);
    this.colliders.push(wall);
    return wall;
  }

  createCollisionProxy(x, y, z, width, height, depth) {
    const proxy = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    proxy.position.set(x, y, z);
    proxy.updateMatrixWorld(true);
    this.colliders.push(proxy);
    return proxy;
  }

  buildProps() {
    // 1. Service Counter with Cash Registers (Front counter, Z = -4.5)
    this.propFactory.createServiceCounter(0, 0, -4.5);
    this.createCollisionProxy(-2.85, 0.55, -4.5, 4.35, 1.1, 1.2);
    this.createCollisionProxy(2.85, 0.55, -4.5, 4.35, 1.1, 1.2);

    // 2. Dining Booths (6 clusters in Dining Hall)
    const boothConfigs = [
      { x: -8, z: -22, rot: Math.PI / 2 },
      { x: -8, z: -14, rot: Math.PI / 2 },
      { x: -8, z: -8,  rot: Math.PI / 2 },
      { x: 8,  z: -22, rot: -Math.PI / 2 },
      { x: 8,  z: -14, rot: -Math.PI / 2 },
      { x: 8,  z: -8,  rot: -Math.PI / 2 }
    ];

    boothConfigs.forEach(b => {
      this.propFactory.createDiningBooth(b.x, 0, b.z, b.rot);
      this.createCollisionProxy(b.x, 0.5, b.z, 2.0, 1.0, 2.6);
    });

    // 3. Deep Fryer Bank in Kitchen (X: -4, Z: 4)
    this.fryerStation = this.propFactory.createDeepFryerBank(-4, 0, 4);
    this.createCollisionProxy(-4, 0.6, 4, 3.6, 1.2, 1.2);

    // 4. Rotisserie Ovens in Kitchen (X: 4, Z: 4 and Z: 8)
    this.propFactory.createRotisserieOven(4, 0, 4);
    this.propFactory.createRotisserieOven(4, 0, 8);
    this.createCollisionProxy(4, 1.1, 4, 1.6, 2.2, 1.2);
    this.createCollisionProxy(4, 1.1, 8, 1.6, 2.2, 1.2);

    // 5. Stainless Prep Island Table in Kitchen Center
    const prepTableGeo = new THREE.BoxGeometry(4.0, 1.0, 1.6);
    const prepTable = new THREE.Mesh(prepTableGeo, this.materials.metal);
    prepTable.position.set(0, 0.5, 10);
    prepTable.castShadow = true;
    this.scene.add(prepTable);
    this.colliders.push(prepTable);

    // 6. Interactive Grease Spills
    this.greaseSpills = [
      this.propFactory.createGreaseSpill(-4, 0, 6.0),
      this.propFactory.createGreaseSpill(2, 0, 6.0),
      this.propFactory.createGreaseSpill(0, 0, -12.0)
    ];
    this.greaseSpill = this.greaseSpills[0];

    // 7. Interactive Circuit Breaker Box #1 in Manager's Office (X: -29.7, Z: 14)
    this.breakerBox = this.propFactory.createBreakerBox(-29.7, 2.0, 14, Math.PI / 2);

    // 8. High Detail Commercial Janitor Mop Bucket near Service Counter
    this.mopBucket = this.propFactory.createMopBucket(-5, 0, -3.2);

    // 9. HIGH-VISIBILITY 3D DRIVE-THRU WINDOW ASSEMBLY on West Wall (X: -30, Z: 5)
    const dtGroup = new THREE.Group();
    dtGroup.position.set(-30.0, 2.0, 5.0);

    const dtFrame = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 2.0, 2.0),
      new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.3, metalness: 0.6 })
    );
    dtGroup.add(dtFrame);

    this.dtWindow = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 1.8, 1.8),
      this.materials.glass
    );
    this.dtWindow.userData = { type: 'drive_thru_window', isOpen: false };
    dtGroup.add(this.dtWindow);
    this.propFactory.interactables.push(this.dtWindow);

    // Glowing Neon Sign
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.45, 1.8),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    sign.position.set(0.15, 1.25, 0);
    dtGroup.add(sign);

    // Outdoor Night Rainy Backdrop
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 8),
      new THREE.MeshBasicMaterial({ color: 0x050c1a })
    );
    sky.rotation.y = Math.PI / 2;
    sky.position.set(-3.5, 0, 0);
    dtGroup.add(sky);

    // Outside Streetlamp Post & Light
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x334155 })
    );
    pole.position.set(-2.5, 0, 3.0);
    dtGroup.add(pole);

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    bulb.position.set(-2.5, 1.8, 3.0);
    dtGroup.add(bulb);

    this.scene.add(dtGroup);

    // 10. CURSED BALL PIT POOL in PlayPlace (X: 22, Z: -18)
    const ballPitGroup = new THREE.Group();
    ballPitGroup.position.set(22, 0, -18);

    // Padded Wood Enclosure Border
    const pitWallMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.4 });
    const pitBorder = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.8, 8.0), pitWallMat);
    pitBorder.position.y = 0.4;
    ballPitGroup.add(pitBorder);
    this.createCollisionProxy(22, 0.4, -18, 8.0, 0.8, 8.0);

    // Colorful Plastic Ball Surface
    const ballsMat = new THREE.MeshStandardMaterial({ color: 0xec4899, roughness: 0.2, metalness: 0.1 });
    const balls = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.4, 7.6), ballsMat);
    balls.position.y = 0.5;
    ballPitGroup.add(balls);

    this.scene.add(ballPitGroup);

    // 11. EMERGENCY DIESEL GENERATOR in South Cellar (X: 0, Z: 28)
    const genGroup = new THREE.Group();
    genGroup.position.set(0, 0, 28);

    const genBodyMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.4 });
    const genBody = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.8, 2.0), genBodyMat);
    genBody.position.y = 0.9;
    genGroup.add(genBody);
    this.createCollisionProxy(0, 0.9, 28, 3.2, 1.8, 2.2);

    // Exhaust Chimney Tube
    const chimney = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 2.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9 })
    );
    chimney.position.set(1.0, 2.4, 0);
    genGroup.add(chimney);

    genGroup.userData = {
      type: 'generator',
      fueled: false,
      fuelCount: 0,
      requiredFuel: 2
    };
    // All interactables live in PropFactory so PlayerController receives the
    // same array used by every other pickup and quest object.
    this.propFactory.interactables.push(genGroup);
    this.scene.add(genGroup);

    // 12. Vintage Horror Posters & Bloodied Menu Boards
    const loader = new THREE.TextureLoader();
    loader.load('/assets/poster1.jpg', (tex) => {
      const pMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3 });
      const pGeo = new THREE.PlaneGeometry(2.6, 2.6);

      // Poster in Dining Hall North Wall
      const poster1 = new THREE.Mesh(pGeo, pMat);
      poster1.position.set(-8, 2.2, -29.7);
      this.scene.add(poster1);

      // Poster in PlayPlace East Wall
      const poster2 = new THREE.Mesh(pGeo, pMat);
      poster2.rotation.y = -Math.PI / 2;
      poster2.position.set(29.7, 2.2, -18);
      this.scene.add(poster2);
    });

    loader.load('/assets/menu_horror.jpg', (tex) => {
      const mMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.2 });
      const mGeo = new THREE.PlaneGeometry(2.4, 2.4);

      // Bloody Menu in South Cellar Entrance
      const menu1 = new THREE.Mesh(mGeo, mMat);
      menu1.position.set(0, 2.3, 21.7);
      this.scene.add(menu1);

      // Bloody Menu in Manager's Office Wall
      const menu2 = new THREE.Mesh(mGeo, mMat);
      menu2.rotation.y = Math.PI / 2;
      menu2.position.set(-29.7, 2.2, 11);
      this.scene.add(menu2);
    });

    // Cursed Colonel Antique Gold Frame Portrait in Main Dining Hall Center
    loader.load('/assets/cursed_portrait.jpg', (tex) => {
      const portraitMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25 });
      const portraitGeo = new THREE.PlaneGeometry(3.0, 3.0);
      const portrait = new THREE.Mesh(portraitGeo, portraitMat);
      portrait.position.set(0, 2.4, -29.7);
      this.scene.add(portrait);
    });

    // Visceral Meat Grinder Horror Mural in South Cellar
    loader.load('/assets/meat_grinder.jpg', (tex) => {
      const grinderMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 });
      const grinderGeo = new THREE.PlaneGeometry(5.0, 3.2);
      const grinder = new THREE.Mesh(grinderGeo, grinderMat);
      grinder.position.set(0, 2.1, 34.7);
      this.scene.add(grinder);
    });

    // Surveillance CCTV Glitch Monitor TV in Manager's Office
    loader.load('/assets/cctv_glitch.jpg', (tex) => {
      const tvGroup = new THREE.Group();
      tvGroup.position.set(-29.6, 1.8, 8.0);
      tvGroup.rotation.y = Math.PI / 2;

      const tvHousing = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 1.8, 0.4),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 })
      );
      tvGroup.add(tvHousing);

      const screenMat = new THREE.MeshBasicMaterial({ map: tex });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), screenMat);
      screen.position.set(0, 0, 0.21);
      tvGroup.add(screen);

      this.scene.add(tvGroup);
    });
  }
}
