/**
 * Map scanner: builds the real level, then flood-fills the walkable floor with
 * the player's own collidesAt() so we can see exactly where the player can go.
 *
 * Reports:
 *  - reachable cells that sit over NO floor mesh (fall-through / void)
 *  - reachable cells outside the intended playfield
 *  - rooms that are unreachable from the spawn (soft-lock geometry)
 *
 * Usage: node .qa/mapscan.mjs [--ascii]
 */
import './domstub.js';
import * as THREE from 'three';
import { LevelBuilder } from '../src/level/LevelBuilder.js';
import { PlayerController } from '../src/engine/PlayerController.js';
import { LightingSystem } from '../src/engine/LightingSystem.js';
import { AudioManager } from '../src/engine/AudioManager.js';
import { StoryManager } from '../src/engine/StoryManager.js';
import { EventManager } from '../src/engine/EventManager.js';
import { MonsterEntity } from '../src/entities/MonsterEntity.js';
import { QuestManager } from '../src/level/QuestManager.js';
import { ProceduralTextureGen } from '../src/engine/ProceduralTextureGen.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
const audio = new AudioManager();
const lighting = new LightingSystem(scene, camera);
const pbr = {
  floor: ProceduralTextureGen.createCheckeredFloorPBR(32),
  metal: ProceduralTextureGen.createStainlessSteelPBR(32),
  ceiling: ProceduralTextureGen.createCeilingPBR(32),
  menu: ProceduralTextureGen.createMenuBoardTexture(32, 16),
  freezerDoor: ProceduralTextureGen.createFreezerDoorTexture(32, 32)
};
const lb = new LevelBuilder(scene, pbr, audio);
const world = lb.build();
const colliders = world.colliders;
const story = new StoryManager();
const player = new PlayerController(camera, document.getElementById('app'), colliders, audio, lighting);
const events = new EventManager({ scene, audio, lighting, story, player });
const tex = new THREE.Texture(); tex.image = { width: 32, height: 32 };
const monster = new MonsterEntity({ scene, texture: tex, audio, colliders });
const qm = new QuestManager({
  scene, audio, lighting, levelBuilder: lb, monster, player, storyManager: story,
  eventManager: events, colliders, game: {}, colonelTexture: tex, hatchlingTexture: tex, propsTexture: tex
});
player.questManager = qm;
for (const leaf of qm.doorSystem.getColliders()) if (!colliders.includes(leaf)) colliders.push(leaf);
player.syncColliders();

// Every door open: this is the maximum reachable set.
for (const door of qm.doorSystem.doors.values()) {
  door.locked = false;
  if (door.mesh) door.mesh.visible = false;
}
if (lb.secretWall) {
  lb.secretWall.position.set(lb.secretWall.userData.open.x, lb.secretWall.position.y, lb.secretWall.userData.open.z);
  lb.secretWall.rotation.y = lb.secretWall.userData.open.ry;
  lb.secretWall.updateMatrixWorld(true);
}
player.syncColliders();
if (lb.secretWall) player.refreshCollider(lb.secretWall);

// --- collect horizontal floor surfaces ---
const floors = [];
scene.traverse(o => {
  if (!o.isMesh || !o.geometry) return;
  o.updateWorldMatrix(true, false);
  const box = new THREE.Box3().setFromObject(o);
  const h = box.max.y - box.min.y;
  const area = (box.max.x - box.min.x) * (box.max.z - box.min.z);
  // A floor is a thin, wide, low surface.
  if (h < 0.35 && area > 20 && box.max.y < 1.0) floors.push(box);
});

function hasFloor(x, z) {
  for (const b of floors) {
    if (x >= b.min.x - 0.05 && x <= b.max.x + 0.05 && z >= b.min.z - 0.05 && z <= b.max.z + 0.05) return true;
  }
  return false;
}

// --- flood fill from the spawn point beside the car ---
const STEP = 0.25;
const MINX = -60, MAXX = 60, MINZ = -100, MAXZ = 60;
const W = Math.round((MAXX - MINX) / STEP);
const H = Math.round((MAXZ - MINZ) / STEP);
const key = (i, j) => j * W + i;
const seen = new Set();
const reach = [];

player.position.y = player.playerHeight;
// Must match Game.exitCar()'s spawn: the point the player actually stands on
// when they step out of the car. Seeding the fill anywhere else (e.g. inside
// the car's own collider) reports the entire map as unreachable.
const SPAWN = { x: 4.94, z: -41.5 };
const startI = Math.round((SPAWN.x - MINX) / STEP);
const startJ = Math.round((SPAWN.z - MINZ) / STEP);
const stack = [[startI, startJ]];
seen.add(key(startI, startJ));

// Emulate the player's own bound clamp so we test what the game actually allows.
const wb = player.worldBounds;
while (stack.length) {
  const [i, j] = stack.pop();
  const x = MINX + i * STEP;
  const z = MINZ + j * STEP;
  reach.push([x, z]);
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const ni = i + di, nj = j + dj;
    if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
    const k = key(ni, nj);
    if (seen.has(k)) continue;
    const nx = MINX + ni * STEP;
    const nz = MINZ + nj * STEP;
    if (nx < wb.minX || nx > wb.maxX || nz < wb.minZ || nz > wb.maxZ) continue;
    seen.add(k);
    if (player.collidesAt(nx, nz)) continue;
    stack.push([ni, nj]);
  }
}

const voids = reach.filter(([x, z]) => !hasFloor(x, z));
let failures = 0;
console.log(`reachable cells: ${reach.length}  (${(reach.length * STEP * STEP).toFixed(0)} m2)`);
console.log(`VOID cells (reachable but no floor under them): ${voids.length}`);
if (voids.length) failures++;

if (voids.length) {
  // cluster them roughly for a readable report
  const clusters = [];
  for (const [x, z] of voids) {
    let put = false;
    for (const c of clusters) {
      if (Math.abs(c.cx - x) < 6 && Math.abs(c.cz - z) < 6) {
        c.n++; c.minX = Math.min(c.minX, x); c.maxX = Math.max(c.maxX, x);
        c.minZ = Math.min(c.minZ, z); c.maxZ = Math.max(c.maxZ, z);
        c.cx = (c.minX + c.maxX) / 2; c.cz = (c.minZ + c.maxZ) / 2;
        put = true; break;
      }
    }
    if (!put) clusters.push({ cx: x, cz: z, minX: x, maxX: x, minZ: z, maxZ: z, n: 1 });
  }
  clusters.sort((a, b) => b.n - a.n);
  for (const c of clusters.slice(0, 12)) {
    console.log(`  void region x[${c.minX.toFixed(1)}..${c.maxX.toFixed(1)}] z[${c.minZ.toFixed(1)}..${c.maxZ.toFixed(1)}] cells=${c.n}`);
  }
}

// --- key rooms reachable? ---
const rooms = {
  'car spawn': [4.94, -41.5],
  'parking lot': [0, -34],
  'front door': [0, -29],
  'dining': [0, -18],
  'playplace': [19, -25],
  'restroom': [-22, -20],
  'janitor closet': [-22.5, -27],
  'kitchen': [0, 6],
  'freezer vault': [22, 11],
  'office': [-20, 6],
  'storage': [-22, 26],
  'hallway': [0, 20],
  'generator room': [3, 28],
  'grinder room': [3, 33],
  'gen room south': [3, 31],
  'behind counter': [0, -6],
  'freezer back': [26, 18],
  'dining east': [12, -20],
  'road north': [0, -52]
};
const inReach = (tx, tz) => reach.some(([x, z]) => Math.abs(x - tx) < 0.4 && Math.abs(z - tz) < 0.4);
console.log('\nroom reachability:');
for (const [name, [x, z]] of Object.entries(rooms)) {
  const good = inReach(x, z);
  if (!good) failures++;
  console.log(`  ${good ? 'OK  ' : 'FAIL'} ${name}  (${x}, ${z})`);
}

// --- outside the building but on the map? ---
const outside = reach.filter(([x, z]) => z < -30.2);
const oxMin = Math.min(...outside.map(p => p[0]));
const oxMax = Math.max(...outside.map(p => p[0]));
const ozMin = Math.min(...outside.map(p => p[1]));
console.log(`\noutdoor extent: x[${oxMin.toFixed(1)}..${oxMax.toFixed(1)}] z min ${ozMin.toFixed(1)}`);
console.log(`player worldBounds: x[${wb.minX}..${wb.maxX}] z[${wb.minZ}..${wb.maxZ}]`);

if (process.argv.includes('--ascii')) {
  const cell = 1.0;
  const cw = Math.round((MAXX - MINX) / cell);
  const ch = Math.round((MAXZ - MINZ) / cell);
  const grid = Array.from({ length: ch }, () => Array(cw).fill(' '));
  for (const [x, z] of reach) {
    const i = Math.round((x - MINX) / cell), j = Math.round((z - MINZ) / cell);
    if (grid[j]) grid[j][i] = hasFloor(x, z) ? '.' : 'X';
  }
  console.log('\nmap (. = walkable floor, X = walkable VOID):');
  grid.forEach((row, j) => console.log(String(Math.round(MINZ + j * cell)).padStart(5) + ' ' + row.join('')));
}

console.log(failures ? `\n${failures} FAILED` : '\nmap OK: no void, every room reachable');
process.exit(failures ? 1 : 0);
