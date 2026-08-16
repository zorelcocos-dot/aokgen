// Boot-order smoke test: constructs every system the way main.js does and
// drives frames, to catch anything the refactor broke before it reaches a
// browser (missing textures, bad grids, undefined materials).
import './domstub.js';
import * as THREE from 'three';
import { TextureLibrary, SURFACES } from '../src/engine/TextureLibrary.js';
import { LevelBuilder } from '../src/level/LevelBuilder.js';
import { ProceduralTextureGen as P } from '../src/engine/ProceduralTextureGen.js';
import { AudioManager } from '../src/engine/AudioManager.js';
import fs from 'node:fs';

let pass=0, fail=0;
const ok=(c,m)=>{ c?pass++:(fail++,console.log('  FAIL:',m)); };

// Every surface the library declares must have its three PNGs on disk.
for (const [name, spec] of Object.entries(SURFACES)) {
  for (const kind of ['albedo','normal','rough']) {
    const p = `public/assets/tex/${spec.file}_${kind}.png`;
    ok(fs.existsSync(p), `${name}: missing ${p}`);
  }
}

// Every sprite atlas referenced by main.js must exist and match the manifest.
const manifest = JSON.parse(fs.readFileSync('public/assets/sprites/sprites.json','utf8'));
for (const name of ['chicken_monster','chicken_hatchling','colonel_stalker','employee_hands','kfc_props']) {
  ok(fs.existsSync(`public/assets/sprites/${name}.png`), `sprite atlas ${name}.png missing`);
  ok(!!manifest[name], `manifest entry ${name} missing`);
}
ok(manifest.chicken_hatchling?.rows === 4, 'hatchling atlas is 4 rows');

// The level must build with a texture library attached (the browser path).
const scene = new THREE.Scene();
const audio = new AudioManager();
const pbr = { floor:P.createCheckeredFloorPBR(32), metal:P.createStainlessSteelPBR(32),
  ceiling:P.createCeilingPBR(32), menu:P.createMenuBoardTexture(32,16),
  freezerDoor:P.createFreezerDoorTexture(32,32) };
const lib = new TextureLibrary(null);
const lb = new LevelBuilder(scene, pbr, audio, lib);
const world = lb.build();
ok(world.colliders.length > 0, 'level produced colliders');
ok(!!lb.secretWall, 'secret wall panel exists');

// No mesh may be left with a null/undefined material.
let bad = 0;
scene.traverse(o => { if (o.isMesh && !o.material) bad++; });
ok(bad === 0, `${bad} meshes with no material`);

// Materials must be shared, not one per mesh.
const mats = new Set();
scene.traverse(o => { if (o.isMesh && o.material) mats.add(o.material); });
let meshes = 0;
scene.traverse(o => { if (o.isMesh) meshes++; });
console.log(`  meshes=${meshes} unique materials=${mats.size}`);
ok(mats.size < meshes, 'materials are shared across meshes');

// Deterministic dressing: two builds must produce the same world.
const sceneB = new THREE.Scene();
const lbB = new LevelBuilder(sceneB, pbr, audio, new TextureLibrary(null));
lbB.build();
let a=0,b=0;
scene.traverse(()=>a++); sceneB.traverse(()=>b++);
ok(a===b, `deterministic build (${a} vs ${b} nodes)`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
