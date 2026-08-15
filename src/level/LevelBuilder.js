import * as THREE from 'three';
import { PropFactory } from './PropFactory.js';

/**
 * LevelBuilder - Cinematic polished horror level:
 * Outdoor: Forest road, broken-down car, parking lot, trash, fog
 * Indoor: Dining, PlayPlace, Restrooms, Kitchen, Hallways,
 *         Office (security), Storage, Freezer Vault, Generator/Basement,
 *         Staff corridor, Secret grinder room
 * Each zone has purpose, coherent props, blood trails, dirt, papers.
 */

export class LevelBuilder {
  constructor(scene, pbrTextures, audio, textureLibrary = null) {
    this.scene = scene;
    this.pbr = pbrTextures;
    this.audio = audio;
    /**
     * Shared texture/material cache. Every surface in the level asks this for
     * its material, so tiling, filtering and colour space are consistent
     * everywhere instead of being re-invented per mesh.
     */
    this.tex = textureLibrary;
    this.colliders = [];
    this.initMaterials();
    this.propFactory = new PropFactory(scene, this.materials, audio, textureLibrary);
  }

  /**
   * Textured material for a surface of a known world size, falling back to the
   * legacy flat material when no TextureLibrary is present (the headless QA
   * harness builds the level without a renderer).
   */
  surface(name, width, height, overrides) {
    if (this.tex) return this.tex.get(name, width, height, overrides);
    return this.materials[this._fallbackKey(name)] || this.materials.dirtyWall;
  }

  _fallbackKey(name) {
    return {
      floorDining: 'floor', floorKitchen: 'floor', floorFreezer: 'metal',
      floorOffice: 'officeWall', floorConcrete: 'concrete',
      asphalt: 'outdoorFloor', ground: 'forestGround',
      wallDining: 'diningWall', wallTile: 'tileWall', wallOffice: 'officeWall',
      wallConcrete: 'concrete', wallBrick: 'dirtyWall', metal: 'metal',
      ceiling: 'ceiling', wood: 'dirtyWall'
    }[name] || 'dirtyWall';
  }

  /**
   * Deterministic PRNG. The level used Math.random() for debris, papers and
   * ceiling tiles, so every reload produced a different world and no two QA
   * runs (or two players' screenshots) ever matched. Seeded here so the
   * dressing is identical every time while still looking scattered.
   */
  rand() {
    this._seed = (this._seed ?? 0x2f6e2b1) * 1664525 + 1013904223 >>> 0;
    return this._seed / 0x100000000;
  }

  initMaterials() {
    this.materials = {
      floor: new THREE.MeshStandardMaterial({
        map: this.pbr.floor.albedo,
        normalMap: this.pbr.floor.normal,
        roughnessMap: this.pbr.floor.roughness,
        roughness: 0.55,
        metalness: 0.06
      }),
      outdoorFloor: new THREE.MeshStandardMaterial({
        color: 0x1a1a1e,
        roughness: 0.92,
        metalness: 0.02
      }),
      metal: new THREE.MeshStandardMaterial({
        map: this.pbr.metal.albedo,
        normalMap: this.pbr.metal.normal,
        roughnessMap: this.pbr.metal.roughness,
        metalnessMap: this.pbr.metal.metalness,
        metalness: 0.82,
        roughness: 0.38
      }),
      ceiling: new THREE.MeshStandardMaterial({
        map: this.pbr.ceiling.albedo,
        normalMap: this.pbr.ceiling.normal,
        roughness: 0.85
      }),
      diningWall: new THREE.MeshStandardMaterial({ color: 0x3f1616, roughness: 0.78 }),
      dirtyWall: new THREE.MeshStandardMaterial({ color: 0x2b2621, roughness: 0.9 }),
      tileWall: new THREE.MeshStandardMaterial({ color: 0x1f2a38, roughness: 0.35, metalness: 0.08 }),
      officeWall: new THREE.MeshStandardMaterial({ color: 0xc1b8a6, roughness: 0.85 }),
      forestGround: new THREE.MeshStandardMaterial({ color: 0x12140e, roughness: 1.0 }),
      menuBoard: new THREE.MeshBasicMaterial({ map: this.pbr.menu }),
      freezerDoor: new THREE.MeshStandardMaterial({ map: this.pbr.freezerDoor, roughness: 0.32, metalness: 0.72 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.48 }),
      concrete: new THREE.MeshStandardMaterial({ color: 0x3c3c3d, roughness: 0.9 }),
      // Shared one-off materials. These were allocated inside loops before, so
      // 24 debris boxes meant 24 identical materials and 24 draw states.
      parkingLine: new THREE.MeshStandardMaterial({ color: 0x9a9a94, roughness: 0.85 }),
      roadDash: new THREE.MeshStandardMaterial({ color: 0x8a7420, roughness: 0.8 }),
      debris: new THREE.MeshStandardMaterial({ color: 0x2e2e30, roughness: 0.95 }),
      trunk: new THREE.MeshStandardMaterial({ color: 0x15100e, roughness: 0.98 }),
      leaves: new THREE.MeshStandardMaterial({ color: 0x0a1410, roughness: 0.95 }),
      paper: new THREE.MeshStandardMaterial({ color: 0xbfb597, roughness: 0.9 })
    };

    if (this.pbr.floor.albedo) {
      this.pbr.floor.albedo.repeat.set(28, 32);
      this.pbr.floor.normal.repeat.set(28, 32);
      this.pbr.floor.roughness.repeat.set(28, 32);
    }
    if (this.pbr.metal.albedo) {
      this.pbr.metal.albedo.repeat.set(10, 3);
      this.pbr.metal.normal.repeat.set(10, 3);
    }
    if (this.pbr.ceiling.albedo) {
      this.pbr.ceiling.albedo.repeat.set(24, 28);
    }
  }

  build() {
    this.buildOutdoor();
    this.buildArchitecture();
    this.buildProps();
    this.buildEnvironmentalStorytelling();
    this.buildHidingSpots();
    this.buildDecalsAndDirt();

    return {
      colliders: this.colliders,
      interactables: this.propFactory.interactables,
      propFactory: this.propFactory
    };
  }

  // --- OUTDOOR ---
  /**
   * The outdoor shell. Two things matter here and both used to be wrong:
   *
   * 1. Ground coverage. The player's worldBounds are x[-34..34] z[-54..38],
   *    but the ground plane only covered z -77..13 around x +-40, so walking
   *    south-east or along the south wall put the camera over open space with
   *    the skybox visible below the feet - the "falling off the map" the
   *    build was reported with. The ground now covers the entire clamp box
   *    with margin, so there is floor under every legal position.
   *
   * 2. Z-fighting. Ground, parking and road were stacked at y=0/0.01/0.02
   *    with overlapping footprints, so the whole lot strobed as the camera
   *    moved. They are now disjoint in plan and separated by GROUND_STEP.
   */
  buildOutdoor() {
    const GROUND_STEP = 0.012;

    // Base terrain: covers the full walkable clamp box (+8m of visual margin)
    // so the horizon never shows a cut edge.
    const outFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 140),
      this.surface('ground', 120, 140)
    );
    outFloor.rotation.x = -Math.PI / 2;
    outFloor.position.set(0, 0, -20);
    outFloor.receiveShadow = true;
    outFloor.name = 'ground_base';
    this.scene.add(outFloor);

    // Asphalt parking apron in front of the store.
    const parking = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 26),
      this.surface('asphalt', 46, 26)
    );
    parking.rotation.x = -Math.PI / 2;
    parking.position.set(0, GROUND_STEP, -42);
    parking.receiveShadow = true;
    parking.name = 'parking_apron';
    this.scene.add(parking);

    // Parking bay lines, painted onto the apron.
    const lineMat = this.materials.parkingLine;
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 8), lineMat);
      line.position.set(i * 3.2, GROUND_STEP + 0.01, -38);
      this.scene.add(line);
    }

    // Route 17 running north, clear of the apron so the two never overlap.
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 42),
      this.surface('asphalt', 12, 42)
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, GROUND_STEP, -76);
    road.name = 'route_17';
    this.scene.add(road);

    for (let z = -96; z < -56; z += 4) {
      const dash = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.03, 1.6),
        this.materials.roadDash
      );
      dash.position.set(0, GROUND_STEP + 0.01, z);
      this.scene.add(dash);
    }

    // A hard treeline wall so the player cannot wander into the void even if
    // the clamp is ever widened, plus the visual forest.
    this.addForestRing();
    this.buildOuterBarrier();

    // Trash and debris, kept on the ground plane.
    const debrisMat = this.materials.debris;
    for (let i = 0; i < 24; i++) {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.2 + this.rand() * 0.4, 0.15, 0.2),
        debrisMat
      );
      box.position.set((this.rand() - 0.5) * 46, 0.08, -28 - this.rand() * 26);
      box.rotation.y = this.rand() * Math.PI;
      this.scene.add(box);
    }
  }

  /**
   * Invisible collision wall just inside the player's clamp box.
   *
   * The clamp alone was not enough: it stopped the *position* at the boundary
   * but the player could still slide along an edge that had nothing under it.
   * With a real collider the movement code refuses the step in the first
   * place, so the edge behaves like a wall instead of an invisible cliff.
   */
  buildOuterBarrier() {
    const h = 6;
    const t = 1.0;
    const minX = -35, maxX = 35, minZ = -55, maxZ = 39;
    const spans = [
      [(minX + maxX) / 2, h / 2, minZ - t / 2, maxX - minX + t * 2, h, t],
      [(minX + maxX) / 2, h / 2, maxZ + t / 2, maxX - minX + t * 2, h, t],
      [minX - t / 2, h / 2, (minZ + maxZ) / 2, t, h, maxZ - minZ + t * 2],
      [maxX + t / 2, h / 2, (minZ + maxZ) / 2, t, h, maxZ - minZ + t * 2]
    ];
    for (const [x, y, z, w, hh, d] of spans) {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(w, hh, d),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      wall.position.set(x, y, z);
      wall.name = 'world_barrier';
      wall.updateMatrixWorld(true);
      this.scene.add(wall);
      this.colliders.push(wall);
    }
  }

  /**
   * Perimeter forest. Two instanced meshes instead of 120 separate ones: the
   * old loop added 60 trunk meshes and 60 leaf spheres as individual scene
   * children, which is 120 draw calls of pure background.
   */
  addForestRing() {
    const COUNT = 96;
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.34, 1, 6);
    const leavesGeo = new THREE.ConeGeometry(1.5, 4.2, 7);

    const trunks = new THREE.InstancedMesh(trunkGeo, this.materials.trunk, COUNT);
    const leaves = new THREE.InstancedMesh(leavesGeo, this.materials.leaves, COUNT);
    trunks.frustumCulled = false;
    leaves.frustumCulled = false;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    let n = 0;

    for (let i = 0; i < COUNT * 3 && n < COUNT; i++) {
      const angle = (i / COUNT) * Math.PI * 2;
      const radius = 44 + this.rand() * 20;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius - 26;
      // Keep the approach to the front door and the road clear.
      if (Math.abs(x) < 9 && z < -26) continue;

      const h = 6 + this.rand() * 6;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rand() * Math.PI);

      pos.set(x, h / 2, z);
      scl.set(1, h, 1);
      m.compose(pos, q, scl);
      trunks.setMatrixAt(n, m);

      pos.set(x, h * 0.86, z);
      const s = 0.8 + this.rand() * 0.7;
      scl.set(s, s, s);
      m.compose(pos, q, scl);
      leaves.setMatrixAt(n, m);
      n++;
    }
    trunks.count = n;
    leaves.count = n;
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    this.scene.add(trunks);
    this.scene.add(leaves);
  }

  // --- ARCHITECTURE INDOOR ---
  buildArchitecture() {
    const wallThickness = 0.38;
    const roomHeight = 4.25;

    // --- FLOORS ---
    // One flat plane used to cover the entire interior, which meant the
    // dining room, the kitchen, the walk-in freezer and the carpeted office
    // all shared the same checkerboard. Each zone now gets its own surface,
    // matching the zone map in LightingSystem.getCurrentZone(), so rooms are
    // visually distinct and the footstep audio matches what you can see.
    //
    // They sit fractionally above y=0 (the interior slab) so they can never
    // z-fight with the exterior ground that passes underneath the building.
    const FLOOR_Y = 0.02;
    const zoneFloors = [
      // [name, centreX, centreZ, width, depth, surface]
      ['dining',   0,   -17,   60, 26, 'floorDining'],
      ['kitchen',  0,     9,   28, 26, 'floorKitchen'],
      ['freezer', 22,    11,   16, 22, 'floorFreezer'],
      ['office', -22,    11,   16, 22, 'floorOffice'],
      ['storage', -22,   28.5, 16, 13, 'floorConcrete'],
      ['basement', 8,    28.5, 44, 13, 'floorConcrete']
    ];
    for (const [name, cx, cz, w, d, surf] of zoneFloors) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.surface(surf, w, d));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(cx, FLOOR_Y, cz);
      mesh.receiveShadow = true;
      mesh.name = `floor_${name}`;
      this.scene.add(mesh);
    }

    // Interior slab under all of it: guarantees there is never a gap between
    // two zone floors, and gives the building a floor even where a zone
    // rectangle does not quite reach a wall.
    const slab = new THREE.Mesh(
      new THREE.PlaneGeometry(62, 72),
      this.surface('floorConcrete', 62, 72)
    );
    slab.rotation.x = -Math.PI / 2;
    slab.position.set(0, 0.008, 2.5);
    slab.receiveShadow = true;
    slab.name = 'floor_slab';
    this.scene.add(slab);

    // Ceiling
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(62, 72),
      this.surface('ceiling', 62, 72)
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, roomHeight, 2.5);
    ceiling.name = 'ceiling';
    this.scene.add(ceiling);

    // Exterior walls (restaurant shell)
    // North wall (front facade) with entrance door gap (X -2 to 2)
    this.createWall(-15, roomHeight / 2, -30, 26, roomHeight, wallThickness, 'wallDining'); // west part
    this.createWall(15, roomHeight / 2, -30, 26, roomHeight, wallThickness, 'wallDining'); // east part
    this.createWall(0, 3.6, -30, 4.0, 1.2, wallThickness, 'wallDining'); // lintel over entrance

    // Brick skin on the OUTSIDE of the front facade. The shell walls are
    // textured for the interior, so from the parking lot the building used to
    // show dining-room wallpaper - which is what made the exterior read as
    // untextured flat blocks. These are visual only (the shell already
    // collides) and sit just proud of it so they never z-fight.
    this.buildExteriorSkin(roomHeight);

    // Entrance frame (visual)
    const entranceFrameMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1e });
    this.createWall(-2, roomHeight / 2, -30, 0.25, roomHeight, wallThickness, entranceFrameMat);
    this.createWall(2, roomHeight / 2, -30, 0.25, roomHeight, wallThickness, entranceFrameMat);

    // South wall back dock Z=35
    this.createWall(0, roomHeight / 2, 35, 60, roomHeight, wallThickness, 'metal');
    // East wall X=30
    this.createWall(30, roomHeight / 2, 2.5, wallThickness, roomHeight, 70, 'metal');
    // West wall with drive-thru window gap Z 4-6 and front entrance
    this.createWall(-30, roomHeight / 2, -13, wallThickness, roomHeight, 34, 'metal'); // -30 to 4
    this.createWall(-30, roomHeight / 2, 20.5, wallThickness, roomHeight, 29, 'metal'); // 6 to 35
    this.createWall(-30, 0.5, 5, wallThickness, 1.0, 2.4, 'metal'); // sill
    this.createWall(-30, 3.6, 5, wallThickness, 1.2, 2.4, 'metal'); // lintel

    // Interior zoning:

    // 1. Dining vs Kitchen divider Z = -4 with service opening -3 to 3
    this.createWall(-18, roomHeight / 2, -4, 24, roomHeight, wallThickness, 'metal');
    this.createWall(18, roomHeight / 2, -4, 24, roomHeight, wallThickness, 'metal');
    this.createWall(0, 3.6, -4, 6.0, 1.2, wallThickness, 'metal');

    // Menu board above
    const menuGeo = new THREE.BoxGeometry(6.2, 1.2, 0.2);
    const menu = new THREE.Mesh(menuGeo, this.materials.menuBoard);
    menu.position.set(0, 3.18, -3.9);
    this.scene.add(menu);

    // 2. PlayPlace east separation X=15 Z -30 to -4 with archway
    this.createWall(15, roomHeight / 2, -23, wallThickness, roomHeight, 14, 'wallDining');
    this.createWall(15, roomHeight / 2, -9, wallThickness, roomHeight, 10, 'wallDining');
    this.createWall(15, 3.6, -15, wallThickness, 1.2, 2.0, 'wallDining');

    // 3. Restrooms west separation X -15? Actually restroom enclosure
    // Restrooms west: X -30 to -15, Z -30 to -16
    this.createWall(-22.5, roomHeight / 2, -16, 15, roomHeight, wallThickness, 'wallTile');
    this.createWall(-15, roomHeight / 2, -26, wallThickness, roomHeight, 14, 'wallTile');
    this.createWall(-15, 3.6, -18, wallThickness, 1.2, 2.2, 'wallTile');
    // Inner restroom divider (separate janitor closet and toilets)
    // ...leaving a 1.6m doorway at x -23.3..-21.7 that DoorSystem fills with
    // 'janitor_closet'. Widened from 1.2m: with the player's collision body a
    // 1.2m gap left barely any clearance and the closet read as blocked.
    this.createWall(-26.65, roomHeight / 2, -24, 6.7, roomHeight, wallThickness, 'wallTile'); // -30 to -23.3
    this.createWall(-18.35, roomHeight / 2, -24, 6.7, roomHeight, wallThickness, 'wallTile'); // -21.7 to -15
    this.createWall(-22.5, 3.6, -24, 1.6, 1.2, wallThickness, 'wallTile'); // lintel over the doorway

    // 4. Walk-in Freezer Vault east X 14 to 30, Z 0 to 22
    this.createWall(22, roomHeight / 2, 0, 16, roomHeight, wallThickness, 'metal');
    this.createWall(22, roomHeight / 2, 22, 16, roomHeight, wallThickness, 'metal');
    // West wall X=14 with doorway Z 10-12
    this.createWall(14, roomHeight / 2, 5, wallThickness, roomHeight, 10, 'metal');
    this.createWall(14, roomHeight / 2, 17, wallThickness, roomHeight, 10, 'metal');
    this.createWall(14, 3.6, 11, wallThickness, 1.2, 2.0, 'metal');

    // Freezer internal shelves to create maze feeling
    this.createWall(20, 1.2, 7, 0.3, 2.4, 6, 'metal');
    this.createWall(24, 1.2, 13, 0.3, 2.4, 6, 'metal');

    // 5. Manager Office west X -30 to -14, Z 0 to 22
    this.createWall(-22, roomHeight / 2, 0, 16, roomHeight, wallThickness, 'wallOffice');
    // (the office's south wall at z=22 is built with the storage doorway below)
    // Doorway z 10.2..11.8 exactly matches the 'office_main' leaf.
    this.createWall(-14, roomHeight / 2, 5.1, wallThickness, roomHeight, 10.2, 'metal'); // 0 to 10.2
    this.createWall(-14, roomHeight / 2, 16.9, wallThickness, roomHeight, 10.2, 'metal'); // 11.8 to 22
    this.createWall(-14, 3.6, 11, wallThickness, 1.2, 1.6, 'metal');

    // 6. South divider Kitchen vs Basement Z=22 X -14 to 14 with opening -2 to 2
    // Doorway x -2..-0.4 filled by 'generator_door'.
    this.createWall(-8, roomHeight / 2, 22, 12, roomHeight, wallThickness, 'metal'); // -14 to -2
    this.createWall(6.8, roomHeight / 2, 22, 14.4, roomHeight, wallThickness, 'metal'); // -0.4 to 14
    this.createWall(-1.2, 3.6, 22, 1.6, 1.2, wallThickness, 'metal');

    // 7. Storage room (x -30..-14, z 22..35) - its north wall carries the
    // 'storage_door' doorway at x -18.6..-17.4. Previously this was a 0.3m
    // decorative stub and the office-south wall sealed the room completely.
    this.createWall(-24.4, roomHeight / 2, 22, 11.2, roomHeight, wallThickness, 'wallConcrete'); // -30 to -18.8
    this.createWall(-15.6, roomHeight / 2, 22, 3.2, roomHeight, wallThickness, 'wallConcrete'); // -17.2 to -14
    this.createWall(-18, 3.6, 22, 1.6, 1.2, wallThickness, 'wallConcrete'); // lintel

    // 8. Generator room enclosure southeast X -2 to 8, Z 24 to 35
    this.createWall(-2, roomHeight / 2, 26, wallThickness, roomHeight, 8, 'metal');
    this.createWall(8, roomHeight / 2, 26, wallThickness, roomHeight, 8, 'metal');

    // 9. Secret grinder room, x -2..8, z 30.9..34.8.
    //
    // This used to be a 0.42m slot between two walls - narrower than the
    // player's own 1.0m collision diameter - with the grinder receipt sealed
    // inside it. The clue could only ever be grabbed by aiming through a gap
    // from the side, and the "false wall" hid nothing because the room's
    // flanks were open anyway.
    //
    // It is now an actual room: a full-width false panel closes it off, and
    // that panel is the 'secret_wall' the interaction code already had a
    // prompt for but nothing ever created.
    this.buildSecretRoom(roomHeight, wallThickness);

    // The walk-in freezer vault door itself is owned by DoorSystem
    // (QuestManager.initDoorSystem creates it at 14, 1.5, 11). Only the static
    // hazard frame lives here.

    // Hazard stripes frame
    const fMat = new THREE.MeshBasicMaterial({ color: 0xeab308 });
    const fL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.1, 0.15), fMat);
    fL.position.set(14, 1.5, 10);
    const fR = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.1, 0.15), fMat);
    fR.position.set(14, 1.5, 12);
    this.scene.add(fL);
    this.scene.add(fR);
  }

  /**
   * The hidden grinder room behind the generator bay.
   *
   * Layout (world coords):
   *   room interior  x -1.8 .. 7.8, z 31.1 .. 34.8
   *   false panel    x  1.4 .. 4.6 at z = 30.9   <- the way in
   *   fixed walls    either side of the panel
   *
   * The panel is a collider like any other wall until the player inspects it,
   * at which point QuestManager slides it aside. Because it is a normal
   * collider the room is genuinely sealed until then - no peeking through a
   * seam, and nothing inside is reachable early.
   */
  buildSecretRoom(roomHeight, wallThickness) {
    // Solid returns either side of the hidden panel.
    this.createWall(-0.4, roomHeight / 2, 30.9, 2.8, roomHeight, wallThickness, 'wallConcrete');
    this.createWall(6.2, roomHeight / 2, 30.9, 3.2, roomHeight, wallThickness, 'wallConcrete');
    // Header above the panel, so the opening is a doorway rather than a hole.
    this.createWall(3, 3.75, 30.9, 3.2, 0.95, wallThickness, 'wallConcrete');

    // The movable false panel.
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 3.28, wallThickness),
      this.surface('wallConcrete', 3.2, 3.28)
    );
    panel.position.set(3, 1.64, 30.9);
    panel.castShadow = true;
    panel.receiveShadow = true;
    panel.name = 'secret_wall_panel';
    panel.userData = {
      type: 'secret_wall',
      opened: false,
      // Closed: filling the doorway at z=30.9.
      // Open: swung a quarter turn and tucked against the room's west wall,
      //       clear of the 1.4..4.6 opening. Sliding it sideways would just
      //       move the blockage into the solid return beside it, so the panel
      //       turns rather than translates.
      closed: { x: 3, z: 30.9, ry: 0 },
      open: { x: -1.45, z: 32.7, ry: Math.PI / 2 }
    };
    // It both blocks movement and answers the crosshair.
    this.scene.add(panel);
    this.colliders.push(panel);
    this.propFactory.interactables.push(panel);
    this.secretWall = panel;

    // Back and side walls of the pocket itself.
    this.createWall(3, roomHeight / 2, 34.9, 10.2, roomHeight, wallThickness, 'wallConcrete');
    this.createWall(-2, roomHeight / 2, 33, wallThickness, roomHeight, 4.4, 'wallConcrete');
    this.createWall(8, roomHeight / 2, 33, wallThickness, roomHeight, 4.4, 'wallConcrete');
  }

  /**
   * Non-colliding brick cladding on the outward faces of the building shell,
   * plus a roof cap so the store reads as a solid volume from the parking lot
   * instead of an open-topped box of coloured planes.
   */
  buildExteriorSkin(roomHeight) {
    const skin = (x, y, z, w, h, d, rotY = 0) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        this.surface('wallBrick', Math.max(w, d), h)
      );
      mesh.position.set(x, y, z);
      mesh.rotation.y = rotY;
      mesh.receiveShadow = true;
      mesh.name = 'exterior_skin';
      this.scene.add(mesh);
      return mesh;
    };

    const t = 0.3;
    // Front facade either side of the entrance.
    skin(-15, roomHeight / 2, -30.35, 26, roomHeight, t);
    skin(15, roomHeight / 2, -30.35, 26, roomHeight, t);
    skin(0, 3.6, -30.35, 4.0, 1.2, t);
    // East and west flanks, and the back dock.
    skin(30.35, roomHeight / 2, 2.5, t, roomHeight, 70);
    skin(-30.35, roomHeight / 2, -13, t, roomHeight, 34);
    skin(-30.35, roomHeight / 2, 20.5, t, roomHeight, 29);
    skin(0, roomHeight / 2, 35.35, 60, roomHeight, t);

    // Parapet + roof cap.
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(61.4, 0.4, 71.4),
      this.surface('wallConcrete', 61.4, 71.4)
    );
    roof.position.set(0, roomHeight + 0.2, 2.5);
    roof.name = 'roof';
    this.scene.add(roof);

    const parapet = [
      [0, roomHeight + 0.75, -30.35, 61.4, 1.1, t],
      [0, roomHeight + 0.75, 35.35, 61.4, 1.1, t],
      [30.35, roomHeight + 0.75, 2.5, t, 1.1, 71.4],
      [-30.35, roomHeight + 0.75, 2.5, t, 1.1, 71.4]
    ];
    for (const [x, y, z, w, h, d] of parapet) skin(x, y, z, w, h, d);
  }

  /**
   * Walls accept either a legacy THREE.Material or a TextureLibrary surface
   * name. When given a name the material is tiled to the wall's own footprint,
   * so a 26m facade and a 1.2m lintel show the same texel density instead of
   * one texture stretched across whatever the mesh happened to be.
   */
  createWall(x, y, z, width, height, depth, material) {
    const geo = new THREE.BoxGeometry(width, height, depth);
    // Tile against the largest face of the box.
    const mat = typeof material === 'string'
      ? this.surface(material, Math.max(width, depth), height)
      : material;
    const wall = new THREE.Mesh(geo, mat);
    wall.position.set(x, y, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    this.scene.add(wall);
    this.colliders.push(wall);
    return wall;
  }

  createCollisionProxy(x, y, z, w, h, d) {
    const proxy = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshBasicMaterial({ visible: false, depthWrite: false })
    );
    proxy.position.set(x, y, z);
    proxy.updateMatrixWorld(true);
    this.colliders.push(proxy);
    return proxy;
  }

  buildProps() {
    // Service Counter front
    this.propFactory.createServiceCounter(0, 0, -4.5);
    this.createCollisionProxy(-2.85, 0.55, -4.5, 4.35, 1.1, 1.2);
    this.createCollisionProxy(2.85, 0.55, -4.5, 4.35, 1.1, 1.2);

    // Dining Booths 6 clusters with variation
    const boothConfigs = [
      { x: -8, z: -22, rot: Math.PI / 2, broken: false },
      { x: -8, z: -14, rot: Math.PI / 2, broken: true }, // flipped chair tells story
      { x: -8, z: -8, rot: Math.PI / 2, broken: false },
      { x: 8, z: -22, rot: -Math.PI / 2, broken: false },
      { x: 8, z: -14, rot: -Math.PI / 2, broken: false },
      { x: 8, z: -8, rot: -Math.PI / 2, broken: true }
    ];
    boothConfigs.forEach(b => {
      this.propFactory.createDiningBooth(b.x, 0, b.z, b.rot, b.broken);
      this.createCollisionProxy(b.x, 0.5, b.z, 2.0, 1.0, 2.6);
    });

    // Kitchen
    this.fryerStation = this.propFactory.createDeepFryerBank(-4, 0, 4);
    this.createCollisionProxy(-4, 0.6, 4, 3.6, 1.2, 1.2);

    this.propFactory.createRotisserieOven(4, 0, 4);
    this.propFactory.createRotisserieOven(4, 0, 8.5);
    this.createCollisionProxy(4, 1.1, 4, 1.6, 2.2, 1.2);
    this.createCollisionProxy(4, 1.1, 8.5, 1.6, 2.2, 1.2);

    // Prep island
    const prepTableGeo = new THREE.BoxGeometry(4.2, 1.0, 1.8);
    const prepTable = new THREE.Mesh(prepTableGeo, this.materials.metal);
    prepTable.position.set(0, 0.5, 10);
    prepTable.castShadow = true;
    this.scene.add(prepTable);
    this.colliders.push(prepTable);

    // Grease spills
    this.greaseSpills = [
      this.propFactory.createGreaseSpill(-4, 0, 6.4),
      this.propFactory.createGreaseSpill(1.2, 0, 5.6),
      this.propFactory.createGreaseSpill(0, 0, -13)
    ];
    this.greaseSpill = this.greaseSpills[0];

    // Breaker box in manager office + also in generator room
    this.breakerBox = this.propFactory.createBreakerBox(-29.6, 2.0, 14, Math.PI / 2);
    this.generatorBreaker = this.propFactory.createBreakerBox(7.7, 2.0, 26, 0);

    // Mop bucket
    this.mopBucket = this.propFactory.createMopBucket(-5.2, 0, -3.2);

    // Drive-thru window assembly
    this.buildDriveThruWindow();

    // Ball pit
    this.buildBallPit();

    // Generator
    this.buildGenerator();

    // Car exterior
    this.buildExteriorCar();

    // Manager office desk, computers, cctv
    this.buildOffice();

    // Restrooms sinks, mirrors
    this.buildRestrooms();

    // Storage shelves
    this.buildStorageRoom();

    // Posters (environmental)
    this.buildPostersAndPortraits();

    // Security CCTV monitors
    this.buildCCTVWall();
  }

  buildDriveThruWindow() {
    const dtGroup = new THREE.Group();
    dtGroup.position.set(-30.0, 2.0, 5.0);

    const dtFrame = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 2.2, 2.6),
      new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.32, metalness: 0.55 })
    );
    dtGroup.add(dtFrame);

    // The sliding pane itself is a DoorSystem door ('drive_thru_window'),
    // created in QuestManager.initDoorSystem at world (-30, 2, 5).

    // Glowing sign
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.48, 2.0),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    sign.position.set(0.15, 1.35, 0);
    dtGroup.add(sign);

    // Outdoor night
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 8),
      new THREE.MeshBasicMaterial({ color: 0x050b14 })
    );
    sky.rotation.y = Math.PI / 2;
    sky.position.set(-3.5, 0, 0);
    dtGroup.add(sky);

    // Streetlamp
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x334155 })
    );
    pole.position.set(-2.5, 0, 3);
    dtGroup.add(pole);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    bulb.position.set(-2.5, 1.9, 3);
    dtGroup.add(bulb);

    this.scene.add(dtGroup);
  }

  buildBallPit() {
    const ballPitGroup = new THREE.Group();
    ballPitGroup.position.set(22, 0, -18);

    const pitWallMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.45 });
    const pitBorder = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.9, 8.4), pitWallMat);
    pitBorder.position.y = 0.45;
    ballPitGroup.add(pitBorder);
    this.createCollisionProxy(22, 0.45, -18, 8.4, 0.9, 8.4);

    const ballsMat = new THREE.MeshStandardMaterial({ color: 0xec4899, roughness: 0.25, metalness: 0.05 });
    const balls = new THREE.Mesh(new THREE.BoxGeometry(7.9, 0.5, 7.9), ballsMat);
    balls.position.y = 0.65;
    ballPitGroup.add(balls);

    // Hidden eyes group (for event)
    const eyesGroup = new THREE.Group();
    eyesGroup.name = 'ballpit_eyes';
    eyesGroup.visible = false;
    eyesGroup.position.set(0, 0.7, 0);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });
    for (let i = 0; i < 5; i++) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), eyeMat);
      eye.position.set((this.rand() - 0.5) * 5, 0.1, (this.rand() - 0.5) * 5);
      eyesGroup.add(eye);
    }
    ballPitGroup.add(eyesGroup);

    this.scene.add(ballPitGroup);
  }

  buildGenerator() {
    const genGroup = new THREE.Group();
    genGroup.position.set(0, 0, 28);

    const genBodyMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.72, roughness: 0.42 });
    const genBody = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.9, 2.2), genBodyMat);
    genBody.position.y = 0.95;
    genGroup.add(genBody);
    this.createCollisionProxy(0, 0.95, 28, 3.4, 1.9, 2.4);

    const chimney = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 2.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9 })
    );
    chimney.position.set(1.0, 2.6, 0);
    genGroup.add(chimney);

    genGroup.userData = { type: 'generator', fueled: false, fuelCount: 0, requiredFuel: 2 };
    this.propFactory.interactables.push(genGroup);
    this.scene.add(genGroup);
    this.generatorMesh = genGroup;
  }

  buildExteriorCar() {
    const carGroup = new THREE.Group();
    carGroup.name = 'car';
    carGroup.position.set(3, 0, -42);
    carGroup.rotation.y = Math.PI * 0.92;

    // Simple car body
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2e3a38, roughness: 0.35, metalness: 0.25 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 4.2), bodyMat);
    body.position.y = 0.7;
    body.castShadow = true;
    carGroup.add(body);

    // Roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.6, 2.2), bodyMat);
    roof.position.set(0, 1.25, -0.2);
    carGroup.add(roof);

    // Windows (black)
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.05, metalness: 0.9 });
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.52, 0.1), glassMat);
    windshield.position.set(0, 1.2, 0.95);
    windshield.rotation.x = 0.25;
    carGroup.add(windshield);

    const rear = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.45, 0.1), glassMat);
    rear.position.set(0, 1.2, -1.35);
    rear.rotation.x = -0.2;
    carGroup.add(rear);

    // Headlights (glow when near)
    const hlGeo = new THREE.BoxGeometry(0.2, 0.16, 0.08);
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xfef9c3 });
    const hlLeft = new THREE.Mesh(hlGeo, hlMat);
    hlLeft.position.set(-0.7, 0.55, 2.12);
    carGroup.add(hlLeft);
    const hlRight = hlLeft.clone();
    hlRight.position.set(0.7, 0.55, 2.12);
    carGroup.add(hlRight);

    // Interior steering wheel / seat blocked view could be added
    // Interactable car
    const carProxy = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 1.4, 4.6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    carProxy.position.y = 0.7;
    carProxy.userData = { type: 'car' };
    carGroup.add(carProxy);
    this.propFactory.interactables.push(carProxy);

    this.scene.add(carGroup);
    this.carGroup = carGroup;

    // Small flashlight battery near car as lure
    const bat = this.propFactory.createBatteryPickup(-1, 0.2, -40);
    // Fuel can near trunk
    const fuelInTrunk = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.45, 0.32),
      new THREE.MeshStandardMaterial({ color: 0x991b1b, emissive: 0x440000, emissiveIntensity: 0.15 })
    );
    fuelInTrunk.position.set(3.5, 0.32, -43.5);
    fuelInTrunk.userData = { type: 'fuel_can_pickup' };
    this.scene.add(fuelInTrunk);
    this.propFactory.interactables.push(fuelInTrunk);
  }

  buildOffice() {
    // Desk
    const deskGeo = new THREE.BoxGeometry(2.4, 0.75, 1.2);
    const deskMat = new THREE.MeshStandardMaterial({ color: 0x4a3422, roughness: 0.7 });
    const desk = new THREE.Mesh(deskGeo, deskMat);
    desk.position.set(-22, 0.38, 10);
    desk.castShadow = true;
    this.scene.add(desk);
    this.createCollisionProxy(-22, 0.38, 10, 2.4, 0.75, 1.2);

    // Chair
    const chair = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.8, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x1e1e1e })
    );
    chair.position.set(-22, 0.4, 11.2);
    this.scene.add(chair);

    // Office plant dead
    const plant = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.9, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x2a3a1a })
    );
    plant.position.set(-24, 0.45, 7);
    this.scene.add(plant);
  }

  buildRestrooms() {
    // Simple toilet proxies
    const toiletMat = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.2 });
    const toilet1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.7), toiletMat);
    toilet1.position.set(-26, 0.25, -21);
    this.scene.add(toilet1);
    const toilet2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.7), toiletMat);
    toilet2.position.set(-26, 0.25, -19);
    this.scene.add(toilet2);
    // Sink
    const sink = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.6), new THREE.MeshStandardMaterial({ color: 0xdbeafe }));
    sink.position.set(-29.3, 0.85, -20);
    this.scene.add(sink);
  }

  buildStorageRoom() {
    // Shelves in storage SW
    const shelfMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, metalness: 0.6, roughness: 0.45 });
    for (let i = 0; i < 3; i++) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.8, 0.5), shelfMat);
      shelf.position.set(-22 - i * 0.1, 0.9, 23 + i * 1.2);
      this.scene.add(shelf);
      this.createCollisionProxy(-22, 0.9, 23 + i * 1.2, 3.0, 1.8, 0.6);
    }

    // Boxes
    for (let j = 0; j < 6; j++) {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.5, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x9a8c72 })
      );
      box.position.set(-21 + (j % 3) * 0.6, 0.25 + Math.floor(j / 3) * 0.55, 23.5 + this.rand());
      this.scene.add(box);
    }
  }

  /**
   * Wall art. These are real painted images (not sprite sheets), so they only
   * need correct colour handling: without SRGBColorSpace they render washed
   * out and desaturated against the sRGB-corrected world.
   */
  buildPostersAndPortraits() {
    const loader = new THREE.TextureLoader();

    /** Loads a piece of wall art with the right colour space and filtering. */
    const art = (url, onReady) => loader.load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = this.tex?.maxAnisotropy ?? 1;
      onReady(tex);
    });

    art('/assets/poster1.jpg', (tex) => {
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35 });
      const geo = new THREE.PlaneGeometry(2.6, 2.6);
      const p1 = new THREE.Mesh(geo, mat);
      p1.position.set(-8, 2.2, -29.7);
      this.scene.add(p1);
      const p2 = new THREE.Mesh(geo, mat);
      p2.rotation.y = -Math.PI / 2;
      p2.position.set(29.7, 2.2, -18);
      this.scene.add(p2);
    });

    art('/assets/menu_horror.jpg', (tex) => {
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25 });
      const geo = new THREE.PlaneGeometry(2.4, 2.4);
      const m1 = new THREE.Mesh(geo, mat);
      m1.position.set(0, 2.3, 21.7);
      this.scene.add(m1);
      const m2 = new THREE.Mesh(geo, mat);
      m2.rotation.y = Math.PI / 2;
      m2.position.set(-29.7, 2.2, 11);
      this.scene.add(m2);
    });

    art('/assets/cursed_portrait.jpg', (tex) => {
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.28 });
      const geo = new THREE.PlaneGeometry(3.0, 3.0);
      const portrait = new THREE.Mesh(geo, mat);
      portrait.position.set(0, 2.5, -29.7);
      portrait.name = 'cursed_portrait_plane';
      this.scene.add(portrait);

      // Changed version (eyes darker, smile wider) - same texture but tinted red for now, will be swapped by event
      const changedMat = new THREE.MeshStandardMaterial({ map: tex, color: 0xffaaaa, roughness: 0.28 });
      const changed = new THREE.Mesh(geo, changedMat);
      changed.position.copy(portrait.position);
      changed.position.z += 0.01;
      changed.name = 'cursed_portrait_changed';
      changed.visible = false;
      this.scene.add(changed);
    });

    art('/assets/meat_grinder.jpg', (tex) => {
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 });
      const geo = new THREE.PlaneGeometry(5.0, 3.2);
      const grinder = new THREE.Mesh(geo, mat);
      grinder.position.set(0, 2.1, 34.7);
      this.scene.add(grinder);
    });

    // Poster of the Colonel in the generator bay.
    //
    // This used to map the raw colonel_stalker.jpg SPRITE SHEET onto the
    // wall - all eight animation frames at once, on their magenta chroma
    // background, complete with grid rules. It rendered as a bright pink
    // checkerboard hanging in the room. It now shows a single keyed frame
    // from the baked atlas, cropped by UV to one cell.
    loader.load('/assets/sprites/colonel_stalker.png', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      // One cell of the 4x2 atlas: top-left frame.
      tex.repeat.set(1 / 4, 1 / 2);
      tex.offset.set(0, 1 / 2);

      const mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, alphaTest: 0.2, depthWrite: false
      });
      const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.4), mat);
      poster.position.set(3, 1.6, 26.9);
      poster.rotation.y = Math.PI;
      poster.name = 'colonel_poster_generator';
      this.scene.add(poster);
    });
  }

  buildCCTVWall() {
    const loader = new THREE.TextureLoader();
    loader.load('/assets/cctv_glitch.jpg', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const tvGroup = new THREE.Group();
      tvGroup.position.set(-29.6, 1.85, 8.0);
      tvGroup.rotation.y = Math.PI / 2;

      const tvHousing = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 2.0, 0.45),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 })
      );
      tvGroup.add(tvHousing);

      const screenMat = new THREE.MeshBasicMaterial({ map: tex });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.8), screenMat);
      screen.position.set(0, 0, 0.24);
      tvGroup.add(screen);

      // Interactable CCTV monitor - second screen
      const secondMonitor = new THREE.Group();
      secondMonitor.position.set(0, -1.2, 0);
      const housing2 = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 1.2, 0.35),
        new THREE.MeshStandardMaterial({ color: 0x1e293b })
      );
      secondMonitor.add(housing2);
      const screen2 = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshBasicMaterial({ map: tex, color: 0x88ff88 }));
      screen2.position.set(0, 0, 0.18);
      secondMonitor.add(screen2);
      secondMonitor.userData = { type: 'cctv_monitor', camId: 'cam1' };
      this.propFactory.interactables.push(secondMonitor);
      tvGroup.add(secondMonitor);

      this.scene.add(tvGroup);
    });
  }

  buildEnvironmentalStorytelling() {
    // Blood trail from kitchen to generator
    const bloodTrail = new THREE.Group();
    bloodTrail.name = 'blood_trail';
    bloodTrail.visible = false;
    const bloodMat = new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.35, transparent: true, opacity: 0.88 });
    for (let i = 0; i < 12; i++) {
      const spot = new THREE.Mesh(new THREE.CircleGeometry(0.18 + this.rand() * 0.22, 8), bloodMat);
      spot.rotation.x = -Math.PI / 2;
      spot.position.set(
        THREE.MathUtils.lerp(0, 0, i / 11) + (this.rand() - 0.5) * 0.6,
        0.03,
        THREE.MathUtils.lerp(10, 28, i / 11) + (this.rand() - 0.5) * 0.8
      );
      bloodTrail.add(spot);
    }
    this.scene.add(bloodTrail);

    // Papers scattered in dining
    const paperMat = new THREE.MeshStandardMaterial({ color: 0xefe5c5 });
    for (let i = 0; i < 18; i++) {
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.45), paperMat);
      paper.rotation.x = -Math.PI / 2;
      paper.rotation.z = this.rand() * Math.PI;
      paper.position.set(
        (this.rand() - 0.5) * 18,
        0.02,
        -22 + this.rand() * 18
      );
      this.scene.add(paper);
    }

    // Footprints (bloody, leading out)
    const printMat = new THREE.MeshBasicMaterial({ color: 0x991b1b, transparent: true, opacity: 0.55 });
    for (let i = 0; i < 8; i++) {
      const print = new THREE.Mesh(new THREE.CircleGeometry(0.12, 6), printMat);
      print.rotation.x = -Math.PI / 2;
      print.position.set(-1.5 + Math.sin(i) * 0.6, 0.025, 23 + i * 0.9);
      this.scene.add(print);
    }
  }

  buildHidingSpots() {
    // Under service counter
    const hideSpot1 = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.9, 1.0),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hideSpot1.position.set(-2.8, 0.45, -5.2);
    hideSpot1.userData = { type: 'hiding_spot', name: 'counter_hide' };
    this.scene.add(hideSpot1);
    this.propFactory.interactables.push(hideSpot1);

    // Inside freezer between shelves
    const hideSpot2 = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.6, 1.2),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hideSpot2.position.set(22, 0.8, 15);
    hideSpot2.userData = { type: 'hiding_spot', name: 'freezer_hide' };
    this.scene.add(hideSpot2);
    this.propFactory.interactables.push(hideSpot2);

    // Office closet
    const hideSpot3 = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 1.8, 1.0),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hideSpot3.position.set(-26, 0.9, 19);
    hideSpot3.userData = { type: 'hiding_spot', name: 'closet_hide' };
    this.scene.add(hideSpot3);
    this.propFactory.interactables.push(hideSpot3);
  }

  buildDecalsAndDirt() {
    // Dirt overlay via dark planes slightly above floor in corners already implied by floor texture?
    // Add some broken ceiling tiles
    const tileMat = new THREE.MeshStandardMaterial({ color: 0x2f2a26, roughness: 1 });
    for (let i = 0; i < 6; i++) {
      const tile = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.55), tileMat);
      tile.position.set(
        (this.rand() - 0.5) * 20,
        0.03,
        (this.rand() - 0.5) * 40
      );
      tile.rotation.y = this.rand() * Math.PI;
      this.scene.add(tile);
    }
  }
}
