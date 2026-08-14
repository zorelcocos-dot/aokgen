// Long-running soak: drives the real update loop for thousands of frames
// across several full runs, watching for runaway growth (scene children,
// listeners, timers, colliders) and any thrown error.
import './domstub.js';
import * as THREE from 'three';
import { QuestManager, STEP } from '../src/level/QuestManager.js';
import { PlayerController } from '../src/engine/PlayerController.js';
import { LightingSystem } from '../src/engine/LightingSystem.js';
import { AudioManager } from '../src/engine/AudioManager.js';
import { StoryManager } from '../src/engine/StoryManager.js';
import { EventManager } from '../src/engine/EventManager.js';
import { LevelBuilder } from '../src/level/LevelBuilder.js';
import { MonsterEntity } from '../src/entities/MonsterEntity.js';
import { ProceduralTextureGen } from '../src/engine/ProceduralTextureGen.js';

let pass=0, fail=0;
const ok=(c,m)=>{ c?pass++:(fail++,console.log('  FAIL:',m)); };
const section=(t)=>console.log(`\n== ${t} ==`);

const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(75,16/9,0.1,1000);
const audio=new AudioManager();
try{ audio.init?.(); }catch{}
const lighting=new LightingSystem(scene);
const pbr={
  floor: ProceduralTextureGen.createCheckeredFloorPBR(64),
  metal: ProceduralTextureGen.createStainlessSteelPBR(64),
  ceiling: ProceduralTextureGen.createCeilingPBR(64),
  menu: ProceduralTextureGen.createMenuBoardTexture(64,32),
  freezerDoor: ProceduralTextureGen.createFreezerDoorTexture(64,64)
};
const lb=new LevelBuilder(scene,pbr,audio);
const world=lb.build();
const colliders=world.colliders;
const story=new StoryManager();
const app=document.getElementById('app');
const player=new PlayerController(camera,app,colliders,audio,lighting);
const em=new EventManager({scene,audio,lighting,story,player});
const tex=new THREE.Texture(); tex.image={width:64,height:64};
const monster=new MonsterEntity({scene,texture:tex,audio,colliders});
const game={_pendingGeneratorEvent:false};
const qm=new QuestManager({scene,audio,lighting,levelBuilder:lb,monster,player,storyManager:story,
  eventManager:em,colliders,game,colonelTexture:tex,hatchlingTexture:tex,propsTexture:tex});
player.questManager=qm;

// Play one full run through the real handlers.
function playthrough(){
  qm.hasExitedCar=true; qm.evaluateProgress();
  qm.handleInteraction({type:'punch_clock'},null);
  qm.handleInteraction({type:'office_key_pickup'},null);
  qm.handleDoorInteraction('office_main');
  qm.handleInteraction({type:'keycard_pickup'},null);
  qm.handleDoorInteraction('freezer_vault');
  for(let i=0;i<qm.totalMysteryMeat;i++) qm.handleInteraction({type:'meat_pickup'},null);
  const fryer={type:'fryer_station',maxMeat:qm.totalMysteryMeat,loadedCount:0};
  for(let i=0;i<qm.totalMysteryMeat;i++) qm.handleInteraction(fryer,null);
  for(let i=0;i<qm.requiredFuel;i++) qm.handleInteraction({type:'fuel_can_pickup'},null);
  const gen={type:'generator',requiredFuel:qm.requiredFuel,fuelCount:0};
  for(let i=0;i<qm.requiredFuel;i++) qm.handleInteraction(gen,null);
  qm.handleInteraction({type:'shutter_key_pickup'},null);
  qm.handleInteraction({type:'safe'},null);
  qm.handleInteraction({type:'car_key_pickup'},null);
  qm.handleInteraction({type:'car'},null);
}

// Simulate frames the way main.js does.
function frames(n){
  const d=1/60;
  for(let i=0;i<n;i++){
    player.update(d, world.interactables);
    qm.update(d);
    monster.update(d, player.position, camera, player.isHiding, player.noiseLevel, false);
    lighting.update(d, player.position);
    em.update(d, {time:i*d, phase:qm.currentStep, zone:'kitchen', distToBallPit:9,
      enteredBallPit:false, enteredGeneratorRoom:false, justEnteredCorridor:false,
      nearCar:false, isAlone:true, seenPortrait:0, watchCCTV:false, justFueledGenerator:false});
  }
}

const snap=()=>({
  scene: scene.children.length,
  colliders: colliders.length,
  interactables: world.interactables.length,
  timersQ: qm.timers?.size?.() ?? qm.timers?._timeouts?.size ?? 0,
  timersE: em.timers?.size?.() ?? em.timers?._timeouts?.size ?? 0,
  spawned: qm.spawnedObjects.length,
  hatchlings: qm.hatchlings.length,
  docListeners: document.listenerCount('keydown'),
  winListeners: (globalThis.window?.listenerCount?.('keydown')) ?? 0
});

section('baseline');
player.isStarted=true; player.isLocked=true;
frames(120);
const base=snap();
console.log('  ', JSON.stringify(base));

section('5 full run/restart cycles do not grow the world');
let prev=null;
for(let run=1; run<=5; run++){
  playthrough();
  frames(400);
  ok(qm.gameWon===true, `run ${run} completed`);
  qm.reset(); player.reset(); story.reset(); em.reset(); lighting.reset(); audio.reset?.();
  monster.reset?.();
  frames(120);
  const s=snap();
  if(prev){
    ok(s.scene===prev.scene, `run ${run}: scene children stable (${prev.scene} -> ${s.scene})`);
    ok(s.colliders===prev.colliders, `run ${run}: colliders stable (${prev.colliders} -> ${s.colliders})`);
    ok(s.interactables===prev.interactables, `run ${run}: interactables stable (${prev.interactables} -> ${s.interactables})`);
    ok(s.docListeners<=prev.docListeners, `run ${run}: no listener growth (${prev.docListeners} -> ${s.docListeners})`);
  }
  ok(s.spawned===0, `run ${run}: spawned props cleared on reset`);
  ok(s.hatchlings===0, `run ${run}: hatchlings cleared on reset`);
  prev=s;
}
console.log('  final', JSON.stringify(prev));

section('10k frame soak with a live monster never throws');
qm.hasExitedCar=true; qm.evaluateProgress();
monster.spawn(new THREE.Vector3(0,0,-12));
let threw=null;
try{ frames(10000); }catch(e){ threw=e; }
ok(!threw, `10k frames clean${threw? ' - '+threw.message:''}`);
ok(monster.mesh.position.length()<200,'monster stayed inside the world');
const st=snap();
ok(st.scene<=prev.scene+8, `scene did not balloon during soak (${prev.scene} -> ${st.scene})`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
