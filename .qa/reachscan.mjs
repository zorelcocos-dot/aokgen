/**
 * Reachability scan: can the player actually stand somewhere that lets the
 * interact ray (3.8 m, from eye height) touch every interactable in the level?
 *
 * Anything reported here is either an unreachable pickup (soft-lock / missing
 * clue) or a prop buried inside geometry.
 *
 * Usage: node .qa/reachscan.mjs
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
for (const door of qm.doorSystem.doors.values()) { door.locked = false; if (door.mesh) door.mesh.visible = false; }
player.syncColliders();

// The secret panel stays CLOSED here: that is the state the player has to be
// able to see and interact with. (mapscan.mjs opens it to prove the room
// behind becomes reachable once it has been.) Anything inside that room is
// therefore expected to be unreachable in this pass, and is reported
// separately rather than as a failure.
const SECRET_ROOM = { minX: -2, maxX: 8, minZ: 31, maxZ: 35 };
const inSecretRoom = (p) => p.x > SECRET_ROOM.minX && p.x < SECRET_ROOM.maxX &&
                            p.z > SECRET_ROOM.minZ && p.z < SECRET_ROOM.maxZ;

// --- walkable set (same flood fill as mapscan) ---
const STEP = 0.25;
const MINX = -60, MINZ = -100;
const W = 480;
const seen = new Set(); const reach = [];
const key = (i, j) => j * W + i;
const wb = player.worldBounds;
player.position.y = player.playerHeight;
const si = Math.round((3.4 - MINX) / STEP), sj = Math.round((-40.2 - MINZ) / STEP);
const stack = [[si, sj]]; seen.add(key(si, sj));
while (stack.length) {
  const [i, j] = stack.pop();
  reach.push([MINX + i * STEP, MINZ + j * STEP]);
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const ni = i + di, nj = j + dj, k = key(ni, nj);
    if (seen.has(k)) continue;
    const nx = MINX + ni * STEP, nz = MINZ + nj * STEP;
    if (nx < wb.minX || nx > wb.maxX || nz < wb.minZ || nz > wb.maxZ) continue;
    seen.add(k);
    if (player.collidesAt(nx, nz)) continue;
    stack.push([ni, nj]);
  }
}
console.log(`walkable cells: ${reach.length}`);

// --- test every interactable ---
const RAY = 3.6;      // slightly under the real 3.8 for margin
const EYE = 1.62;
const ray = new THREE.Raycaster();
ray.far = RAY;
const dir = new THREE.Vector3();
const origin = new THREE.Vector3();
const targetPos = new THREE.Vector3();

// Invisible collision proxies must not count as sight blockers - they are
// physics-only volumes that the interact ray passes straight through.
const blockers = colliders.filter(c => c && c.visible !== false && c.material?.visible !== false);

const items = [];
scene.traverse(o => { if (o.userData?.type && o.visible !== false) items.push(o); });
for (const o of lb.propFactory.interactables) if (!items.includes(o)) items.push(o);

const unreachable = [];
const behindSecret = [];
for (const obj of items) {
  obj.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(obj);
  if (!isFinite(box.min.x)) { continue; }
  box.getCenter(targetPos);

  // Nearby standing spots only.
  let ok = false;
  for (const [x, z] of reach) {
    const dx = x - targetPos.x, dz = z - targetPos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > RAY * RAY) continue;
    origin.set(x, EYE, z);
    dir.copy(targetPos).sub(origin);
    const dist = dir.length();
    if (dist > RAY) continue;
    dir.normalize();
    ray.set(origin, dir);
    ray.far = dist + 0.01;
    // Is a wall between the eye and the prop?
    const hits = ray.intersectObjects(blockers, false);
    const blocked = hits.some(h => h.distance < dist - 0.12 && !obj.getObjectById(h.object.id) && h.object !== obj);
    if (!blocked) { ok = true; break; }
  }
  if (!ok) {
    const rec = { type: obj.userData?.type, doc: obj.userData?.docId, pos: targetPos.clone(), name: obj.name };
    (inSecretRoom(targetPos) ? behindSecret : unreachable).push(rec);
  }
}

console.log(`\ninteractables scanned: ${items.length}`);
if (behindSecret.length) {
  console.log(`(${behindSecret.length} behind the closed secret panel, as designed: ` +
    behindSecret.map(b => b.doc || b.type).join(', ') + ')');
}
if (!unreachable.length) console.log('all interactables reachable');
for (const u of unreachable) {
  console.log(`  UNREACHABLE ${u.type}${u.doc ? ' (' + u.doc + ')' : ''}${u.name ? ' [' + u.name + ']' : ''} @ ${u.pos.x.toFixed(2)}, ${u.pos.y.toFixed(2)}, ${u.pos.z.toFixed(2)}`);
}

// --- are all story clues obtainable? ---
const docIds = new Set();
scene.traverse(o => { if (o.userData?.docId) docIds.add(o.userData.docId); });
const missing = [...story.documents.keys()].filter(id => !docIds.has(id));
console.log(`\nclues in StoryManager: ${story.documents.size}; pickups placed: ${docIds.size}`);
if (missing.length) console.log('  NO PICKUP IN WORLD:', missing.join(', '));
const unreachableDocs = unreachable.filter(u => u.doc).map(u => u.doc);
if (unreachableDocs.length) console.log('  PLACED BUT UNREACHABLE:', unreachableDocs.join(', '));

const failed = unreachable.length + missing.length;
console.log(failed ? `\n${failed} FAILED` : '\nreach OK: every interactable and clue is obtainable');
process.exit(failed ? 1 : 0);
