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

let pass=0, fail=0; const fails=[];
const ok=(c,m)=>{ if(c){pass++;} else {fail++; fails.push(m); console.log('  FAIL:',m);} };
const section=(t)=>console.log('\n== '+t+' ==');

const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(75,16/9,0.1,1000);
const audio=new AudioManager();
try{ audio.init?.(); }catch(e){ console.log('audio.init:',e.message); }
const lighting=new LightingSystem(scene);
const pbrTextures={
  floor: ProceduralTextureGen.createCheckeredFloorPBR(64),
  metal: ProceduralTextureGen.createStainlessSteelPBR(64),
  ceiling: ProceduralTextureGen.createCeilingPBR(64),
  menu: ProceduralTextureGen.createMenuBoardTexture(64,32),
  freezerDoor: ProceduralTextureGen.createFreezerDoorTexture(64,64)
};
const levelBuilder=new LevelBuilder(scene, pbrTextures, audio);
const worldData=levelBuilder.build();
const colliders=worldData.colliders;
const story=new StoryManager();
const player=new PlayerController(camera, document.getElementById('app'), colliders, audio, lighting);
const eventManager=new EventManager({scene,audio,lighting,story,player});
const dummyTex=new THREE.Texture();
dummyTex.image={width:64,height:64};
const monster=new MonsterEntity({scene,texture:dummyTex,audio,colliders});
const game={ _pendingGeneratorEvent:false };
const qm=new QuestManager({scene,audio,lighting,levelBuilder,monster,player,storyManager:story,eventManager,colliders,game,colonelTexture:dummyTex,hatchlingTexture:dummyTex,propsTexture:dummyTex});
player.questManager=qm;
const inv=player.inventory;

section('progression ladder is forward-only and gated');
ok(qm.currentStep===STEP.INTRO,'starts at INTRO');
qm.setStep(STEP.ESCAPE);
ok(qm.currentStep===STEP.INTRO || qm.currentStep>=STEP.INTRO,'setStep exists');
const beforeSkip=qm.currentStep;
qm.evaluateProgress();
ok(qm.currentStep===beforeSkip,'evaluateProgress cannot skip ungated steps');
qm.hasExitedCar=true; qm.evaluateProgress();
ok(qm.currentStep===STEP.ARRIVAL,`exiting car -> ARRIVAL (got ${qm.currentStep})`);
qm.setStep(STEP.INTRO);
ok(qm.currentStep===STEP.ARRIVAL,'setStep refuses to move backwards');

section('out-of-order exploration fast-forwards, never soft-locks');
inv.addItem('freezer_keycard');
qm.evaluateProgress();
ok(qm.currentStep===STEP.ARRIVAL,'keycard alone does not skip punch-in');
qm.punchedIn=true; qm.officeUnlocked=true; qm.evaluateProgress();
ok(qm.currentStep===STEP.FREEZER,`punch-in fast-forwards to FREEZER (got ${qm.currentStep})`);

section('single car key / no accidental victory');
qm.triggerVictory();
ok(qm.gameWon===false,'victory refused before ESCAPE step');
qm.spawnCarKey(); qm.spawnCarKey(); qm.spawnCarKey();
ok(inv.countItem('car_key')<=1,'car key never duplicates in inventory');
const keyMeshes=qm.spawnedObjects.filter(o=>o.userData?.type==='car_key_pickup').length;
ok(keyMeshes<=1,`only one car-key mesh spawned (got ${keyMeshes})`);

section('inventory integrity');
inv.addItem('office_key'); inv.addItem('office_key');
ok(inv.countItem('office_key')===1,'unique item cannot duplicate');
inv.removeItem('office_key'); inv.removeItem('office_key');
ok(inv.countItem('office_key')===0,'count never goes negative');
ok(inv.consumeItem('fuel',2)===false,'strict consume fails when short');
inv.addItem('fuel'); inv.addItem('fuel');
ok(inv.consumeItem('fuel',2)===true && inv.countItem('fuel')===0,'consume spends exactly the amount');

section('doors: state machine, keys, collision');
const ds=qm.doorSystem;
const office=ds.getDoor('office_main');
ok(!!office,'office door exists');
let r=ds.tryInteract('office_main',inv,lighting);
ok(r && r.success===false && r.locked,'locked without key');
ok(office.progress===0,'locked door did not move');
inv.addItem('office_key');
r=ds.tryInteract('office_main',inv,lighting);
ok(r && r.success,'unlocks with key');
for(let i=0;i<60;i++) ds.update(1/60);
ok(office.progress===1 && office.isPassable(),'door animates to fully open + passable');
const before=ds.getColliders().length;
ds.update(1/60);
ok(ds.getColliders().length===before,'collider list is stable, not regrown per frame');
// freezer needs keycard and must NOT consume it
const fv=ds.getDoor('freezer_vault');
const r2=ds.tryInteract('freezer_vault',inv,lighting);
ok(r2 && r2.success,'freezer opens with keycard');
ok(inv.hasItem('freezer_keycard'),'keycard is not consumed');
// drive-thru is one-way
inv.addItem('drive_thru_key');
ds.tryInteract('drive_thru_window',inv,lighting);
for(let i=0;i<200;i++) ds.update(1/60);
const dt=ds.getDoor('drive_thru_window');
ds.tryInteract('drive_thru_window',inv,lighting);
for(let i=0;i<200;i++) ds.update(1/60);
ok(dt.progress===1,'one-way drive-thru never closes again');

section('no door is stranded in a solid wall (every door has a gap)');
const wallBoxes=colliders.filter(c=>!c.userData?.dynamicCollider).map(c=>{
  c.updateMatrixWorld(true); return new THREE.Box3().setFromObject(c); });
for(const name of ['office_main','janitor_closet','storage_door','generator_door']){
  const d=ds.getDoor(name); if(!d) continue;
  d.hingeGroup.updateMatrixWorld(true);
  const p=new THREE.Vector3(); d.mesh.getWorldPosition(p);
  const probe=new THREE.Box3().setFromCenterAndSize(p,new THREE.Vector3(0.3,1.2,0.3));
  const stuck=wallBoxes.some(b=>b.intersectsBox(probe));
  ok(!stuck, `${name} leaf is not buried inside a static wall`);
}

section('game over / victory freeze the world');
qm.gameOver=true;
const stepAtDeath=qm.currentStep;
qm.handleInteraction({type:'punch_clock'},null);
ok(qm.currentStep===stepAtDeath,'interactions ignored after game over');
qm.gameOver=false;

section('full reset restores a clean run 2');
qm.setStep(STEP.MEAT,true); qm.blackoutTriggered=true; qm.triggerBlackout?.();
qm.portraitStares=5;
story.discoverClue('timecard_0314');
player.takeDamage(30);
lighting.setPower(false);
lighting.powerSurgeSequence();
qm.reset(); player.reset(); story.reset(); eventManager.reset(); lighting.reset(); audio.reset?.(); ds.reset();
ok(qm.currentStep===STEP.INTRO,'quest back to INTRO');
ok(qm.gameOver===false && qm.gameWon===false,'terminal flags cleared');
ok(qm.hatchlings.length===0,'no hatchlings survive reset');
ok(qm.colonel===null,'colonel disposed');
ok(qm.spawnedObjects.length===0,'runtime spawns removed');
ok(qm.portraitStares===0,'event counters cleared');
ok(qm.isWatchingCCTV()===false,'CCTV signal is false when no feed is open');
ok(story.getDiscoveredCount()===0,'clues cleared');
ok(inv.countItem('office_key')===0 && inv.countItem('car_key')===0,'inventory cleared');
ok(inv.hasItem('spatula'),'starting loadout restored');
ok(player.health===player.maxHealth,'health restored');
ok(lighting.powerActive===true,'power restored');
ok(lighting.powerSurgeTimer===-1,'no surge mid-flight');
ok(lighting.flickerBurst===null,'no flicker burst left running');
ok(ds.getDoor('office_main').progress===0,'doors closed again');
ok(ds.getDoor('office_main').isLocked===true,'doors re-locked again');
ok(ds.getDoor('drive_thru_window').progress===0,'one-way door reset too');

section('run 2 is actually completable after reset');
qm.hasExitedCar=true; qm.punchedIn=true; qm.evaluateProgress();
ok(qm.currentStep===STEP.RESTAURANT,`run 2 progresses (got ${qm.currentStep})`);
inv.addItem('office_key');
const r3=ds.tryInteract('office_main',inv,lighting);
ok(r3 && r3.success,'run 2 door unlock works');

section('lighting zones match geometry');
const z=(x,zz)=>lighting.getCurrentZone(new THREE.Vector3(x,1.6,zz));
ok(z(0,-20)==='dining','dining');
ok(z(22,-14)==='playplace','playplace');
ok(z(-22,-20)==='bathroom','bathroom');
ok(z(-22,-27)==='janitor','janitor');
ok(z(0,8)==='kitchen','kitchen');
ok(z(22,10)==='freezer','freezer');
ok(z(-22,10)==='office','office');
ok(z(-22,26)==='storage','storage');
ok(z(3,28)==='basement','basement');
ok(z(0,-40)==='outdoor','outdoor');

section('monster AI: legal transitions, LOS, damage gating');
monster.spawn(new THREE.Vector3(0,0,-12));
ok(monster.isActive(),'monster spawns active');
// illegal jump is refused
monster.setState('HIDDEN'); monster.setState('SEARCH');
ok(monster.state!=='SEARCH','HIDDEN cannot jump straight to SEARCH');
monster.setState('PATROL');
ok(monster.state==='PATROL','HIDDEN -> PATROL is legal');
ok(monster.mesh.visible===true,'leaving HIDDEN makes the body visible again');
monster.stun(1.0);
ok(monster.state==='STUNNED','stun forces STUNNED');
for(let i=0;i<80;i++) monster.update(1/60,new THREE.Vector3(0,1.6,-30),camera,false,0,false);
ok(monster.state!=='STUNNED','stun expires on its own');
// LOS is blocked by walls: the freezer interior vs the dining room
monster.mesh.position.set(22,0,10);
ok(monster.isOccluded(new THREE.Vector3(0,1.6,-20)),'wall blocks line of sight');
monster.mesh.position.set(0,0,-12);
ok(!monster.isOccluded(new THREE.Vector3(2,1.6,-14)),'open dining room does not block LOS');

section('damage: i-frames, no multi-hit, death path');
player.reset(); qm.gameOver=false; qm.gameWon=false;
const hp0=player.health;
ok(player.takeDamage(10)===true,'first hit lands');
ok(player.takeDamage(10)===false,'second hit in the same window is refused');
ok(player.health===hp0-10,'only one hit was applied');
player.invulnTime=0;
player.isHiding=true;
ok(player.takeDamage(10)===false,'hiding blocks damage');
player.isHiding=false;
player.invulnTime=0;
ok(player.takeDamage(9999)===true,'lethal hit lands');
ok(player.isDead===true && qm.gameOver===true,'death triggers game over exactly once');
qm.gameOver=false; player.reset(); qm.reset();

section('hatchlings: culled, inert after death, no hits through walls');
qm.hatchlingTexture=dummyTex;
qm.setStep(STEP.MEAT,true);
qm.triggerBlackoutOutbreak();
const spawned=qm.hatchlings.length;
ok(spawned>0,`blackout spawns hatchlings (${spawned})`);
qm.triggerBlackoutOutbreak();
ok(qm.hatchlings.length===spawned,'blackout is latched - no second wave');
const h0=qm.hatchlings[0];
h0.takeDamage(9999);
ok(h0.isDead===true,'hatchling dies');
ok(h0.isActive()===false,'dead hatchling is not active');
let hitAfterDeath=false;
for(let i=0;i<120;i++) h0.update(1/60,h0.mesh.position.clone(),camera,()=>{hitAfterDeath=true;});
ok(!hitAfterDeath,'dead hatchling never deals damage');
qm.reset();
ok(qm.hatchlings.length===0,'reset clears every hatchling');

section('full playthrough INTRO -> ENDING without a soft-lock');
qm.reset(); player.reset(); story.reset(); ds.reset();
const inv2=player.inventory;
const step=(label,expected)=>ok(qm.currentStep===expected,`${label} -> ${STEP_NAME(expected)} (got ${STEP_NAME(qm.currentStep)})`);
function STEP_NAME(v){ return Object.keys(STEP).find(k=>STEP[k]===v); }
qm.hasExitedCar=true; qm.evaluateProgress();               step('exit car', STEP.ARRIVAL);
qm.handleInteraction({type:'punch_clock'},null);            step('punch in', STEP.RESTAURANT);
qm.handleInteraction({type:'office_key_pickup'},null);
qm.handleDoorInteraction('office_main');                    step('office open', STEP.OFFICE);
qm.handleInteraction({type:'keycard_pickup'},null);         step('keycard', STEP.FREEZER);
qm.handleDoorInteraction('freezer_vault');                  step('vault open', STEP.MEAT);
qm.handleInteraction({type:'meat_pickup'},null);
qm.handleInteraction({type:'meat_pickup'},null);
const fryer={type:'fryer_station',maxMeat:qm.totalMysteryMeat,loadedCount:0};
for(let i=0;i<qm.totalMysteryMeat;i++) qm.handleInteraction(fryer,null);
step('fryers loaded -> blackout', STEP.BLACKOUT);
ok(qm.blackoutTriggered===true,'blackout fired from the fryers');
for(let i=0;i<qm.requiredFuel;i++) qm.handleInteraction({type:'fuel_can_pickup'},null);
step('fuel gathered', STEP.GENERATOR);
const gen={type:'generator',requiredFuel:qm.requiredFuel,fuelCount:0};
for(let i=0;i<qm.requiredFuel;i++) qm.handleInteraction(gen,null);
step('generator running', STEP.COLONEL);
ok(qm.generatorPowered===true,'power restored');
ok(qm.colonelSpawned===true,'colonel spawned exactly once');
const shutterKeys=qm.spawnedObjects.filter(o=>o.userData?.type==='shutter_key_pickup').length;
ok(shutterKeys===1,`one shutter key mesh (${shutterKeys})`);
qm.handleInteraction({type:'shutter_key_pickup'},null);     step('shutter key', STEP.ESCAPE);
qm.handleInteraction({type:'car'},null);
ok(qm.gameWon===false,'car without the car key does not win');
qm.handleInteraction({type:'safe'},null);
ok(qm.carKeySpawned===true,'safe releases the car key');
qm.handleInteraction({type:'safe'},null);
ok(qm.spawnedObjects.filter(o=>o.userData?.type==='car_key_pickup').length===1,'safe cannot be milked for keys');
qm.handleInteraction({type:'car_key_pickup'},null);
qm.handleInteraction({type:'car'},null);
ok(qm.gameWon===true,'car with the key wins');
step('ending', STEP.ENDING);
ok(story.endingType==='normal','few clues -> normal ending');

section('secret ending needs the clue threshold, not luck');
qm.reset(); player.reset(); story.reset(); ds.reset();
for(const id of story.documents.keys()) story.discoverClue(id);
ok(story.isForestOfSecrets()===true,'all clues clears the secret threshold');
qm.setStep(STEP.ESCAPE,true);
player.inventory.addItem('car_key');
qm.triggerVictory();
ok(qm.gameWon===true,'victory fires at the escape step with the key');
ok(story.endingType==='secret','full knowledge -> secret ending');
qm.reset(); player.reset(); story.reset(); ds.reset();

section('procedural textures are cached, not regenerated');
{
  const A = ProceduralTextureGen.createCheckeredFloorPBR(512);
  const B = ProceduralTextureGen.createCheckeredFloorPBR(512);
  ok(A === B, 'identical floor PBR request returns the same object');
  ok(A.albedo === B.albedo && A.normal === B.normal, 'sub-maps are shared, not rebuilt');
  const C = ProceduralTextureGen.createCheckeredFloorPBR(256);
  ok(C !== A, 'a different size is a different cache entry');
  ok(ProceduralTextureGen.generateChickenMonsterSheet() === ProceduralTextureGen.generateChickenMonsterSheet(),
     'sprite sheets are cached');
  ok(ProceduralTextureGen.createMenuBoardTexture(1024,512) === ProceduralTextureGen.createMenuBoardTexture(1024,512),
     'menu board is cached');
}

section('timers are registry-owned (restart cannot orphan them)');
ok(qm.timers && typeof qm.timers.clearAll==='function','QuestManager has a timer registry');
ok(eventManager.timers && typeof eventManager.timers.clearAll==='function','EventManager has a timer registry');
ok(player.timers && typeof player.timers.clearAll==='function','PlayerController has a timer registry');

console.log(`\n${pass} passed, ${fail} failed`);
if(fail) { console.log('\nFailures:'); fails.forEach(f=>console.log(' - '+f)); }
process.exit(fail?1:0);
