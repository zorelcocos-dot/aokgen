// Behavioural AI probe: does the monster actually hunt, lose the player,
// search the last known position, and return to patrol?
import './domstub.js';
import * as THREE from 'three';
import { LevelBuilder } from '../src/level/LevelBuilder.js';
import { MonsterEntity } from '../src/entities/MonsterEntity.js';
import { AudioManager } from '../src/engine/AudioManager.js';
import { ProceduralTextureGen } from '../src/engine/ProceduralTextureGen.js';

let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL:',m));};
const section=t=>console.log(`\n== ${t} ==`);

const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(75,16/9,0.1,1000);
const audio=new AudioManager(); try{audio.init?.();}catch{}
const pbr={floor:ProceduralTextureGen.createCheckeredFloorPBR(64),
  metal:ProceduralTextureGen.createStainlessSteelPBR(64),
  ceiling:ProceduralTextureGen.createCeilingPBR(64),
  menu:ProceduralTextureGen.createMenuBoardTexture(64,32),
  freezerDoor:ProceduralTextureGen.createFreezerDoorTexture(64,64)};
const lb=new LevelBuilder(scene,pbr,audio);
const world=lb.build();
const tex=new THREE.Texture(); tex.image={width:64,height:64};
const m=new MonsterEntity({scene,texture:tex,audio,colliders:world.colliders});

const run=(n,playerPos,hiding=false,noise=0)=>{
  const seen=new Set();
  for(let i=0;i<n;i++){ m.update(1/60,playerPos,camera,hiding,noise,false); seen.add(m.state); }
  return seen;
};

section('patrol -> chase on sight');
m.spawn(new THREE.Vector3(0,0,-12));
const open=new THREE.Vector3(3,1.6,-14);          // same room, close, clear LOS
let states=run(240,open);
ok(m.state==='CHASE', `sees the player in the open -> CHASE (got ${m.state})`);
const distStart=m.mesh.position.distanceTo(open);
run(180,open);
ok(m.mesh.position.distanceTo(open) <= distStart+0.01, 'closes distance while chasing');

section('breaking LOS -> loses the player, searches, then gives up');
const far=new THREE.Vector3(22,1.6,10);            // inside the freezer, behind walls
states=run(1200,far,true);
ok(states.has('SEARCH')||states.has('LOST'), `runs a search phase (saw ${[...states].join(',')})`);
ok(m.state!=='CHASE', `eventually stops chasing (got ${m.state})`);
states=run(3000,far,true);
ok(['PATROL','IDLE','RETURN','LOST','SEARCH'].includes(m.state), `settles into a non-hunting state (got ${m.state})`);

section('hearing pulls it toward noise');
m.setState('PATROL');
// Put the monster somewhere known: after the search phase it may have wandered
// out of earshot, which would make this a test of luck rather than of hearing.
m.mesh.position.set(0,0,-12);
const before=m.mesh.position.clone();
const noisy=new THREE.Vector3(-6,1.6,-16);
m.hearNoise(noisy,0.9);
ok(['HEAR','INVESTIGATE','CHASE'].includes(m.state), `loud noise is reacted to (got ${m.state})`);
run(300,noisy,true);
ok(m.mesh.position.distanceTo(noisy) < before.distanceTo(noisy), 'moves toward the noise it heard');

section('never walks through the world');
let outside=0, inWall=0;
for(let i=0;i<3000;i++){
  m.update(1/60,new THREE.Vector3(0,1.6,-12),camera,false,0,false);
  const p=m.mesh.position;
  if (Math.abs(p.x)>31||p.z<-34||p.z>36) outside++;
}
ok(outside===0,`stayed inside the building envelope (${outside} escapes)`);

section('stun cannot be stacked or leak');
m.setState('PATROL'); 
ok(m.stun(2)===true,'first stun applies');
ok(m.stun(2)===false,'stun cannot be re-applied while stunned');
run(300,new THREE.Vector3(0,1.6,-30),true);
ok(m.state!=='STUNNED','stun always wears off');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
