import * as THREE from 'three';
import { ProceduralTextureGen } from './engine/ProceduralTextureGen.js';
import { ChromaKeyer } from './engine/ChromaKeyer.js';
import { AudioManager } from './engine/AudioManager.js';
import { LightingSystem } from './engine/LightingSystem.js';
import { LevelBuilder } from './level/LevelBuilder.js';
import { PlayerController } from './engine/PlayerController.js';
import { MonsterEntity } from './entities/MonsterEntity.js';
import { Viewmodel } from './entities/Viewmodel.js';
import { QuestManager } from './level/QuestManager.js';
import { StoryManager } from './engine/StoryManager.js';
import { EventManager } from './engine/EventManager.js';

class Game {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.clock = new THREE.Clock();
    this.gameTime = 0;
    this.introActive = true;
    this.carExited = false;

    this.initScene();
    this.initAudio();
    this.initAssets();
    this.initWorld();
    this.initUI();
    this.initIntro();

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050208);
    // Dense horror fog - changes with power state
    this.scene.fog = new THREE.FogExp2(0x08060a, 0.028);

    this.camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.1, 100);

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.3));
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.container.appendChild(this.renderer.domElement);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      if (this.viewmodel) this.viewmodel.resize();
    });
  }

  initAudio() {
    this.audio = new AudioManager();
  }

  initAssets() {
    console.log('[Assets] Loading spritesheets and PBR...');

    const rawMonsterSheet = ProceduralTextureGen.generateChickenMonsterSheet();
    const rawColonelSheet = ProceduralTextureGen.generateColonelStalkerSheet();
    const rawHandsSheet = ProceduralTextureGen.generateEmployeeHandsSheet();
    const rawPropsSheet = ProceduralTextureGen.generateCursedPropsSheet();

    const keyedMonster = ChromaKeyer.processChromaKey(rawMonsterSheet);
    const keyedColonel = ChromaKeyer.processChromaKey(rawColonelSheet);
    const keyedHands = ChromaKeyer.processChromaKey(rawHandsSheet);
    const keyedProps = ChromaKeyer.processChromaKey(rawPropsSheet);

    this.monsterTexture = ChromaKeyer.createKeyedTexture(keyedMonster, 4, 2);
    this.colonelTexture = ChromaKeyer.createKeyedTexture(keyedColonel, 4, 2);
    this.propsTexture = ChromaKeyer.createKeyedTexture(keyedProps, 4, 2);
    this.viewmodelFrames = ChromaKeyer.sliceFrames(keyedHands, 4, 2);

    const rawHatchling = ProceduralTextureGen.generateChickenMonsterSheet();
    const keyedHatchling = ChromaKeyer.processChromaKey(rawHatchling);
    this.hatchlingTexture = ChromaKeyer.createKeyedTexture(keyedHatchling, 4, 4);

    // Async load real JPGs
    ChromaKeyer.loadAndKeyImage('/assets/chicken_monster.jpg').then(canvas => {
      if (canvas) {
        this.monsterTexture.image = ChromaKeyer.createTrimmedAtlas(canvas, 4, 2);
        this.monsterTexture.needsUpdate = true;
        if (this.monster?.sprite) {
          this.monster.sprite.texture.image = this.monsterTexture.image;
          this.monster.sprite.texture.needsUpdate = true;
        }
      }
    });

    ChromaKeyer.loadAndKeyImage('/assets/colonel_stalker.jpg').then(canvas => {
      if (canvas) {
        this.colonelTexture.image = ChromaKeyer.createTrimmedAtlas(canvas, 4, 2);
        this.colonelTexture.needsUpdate = true;
        if (this.questManager) this.questManager.colonelTexture = this.colonelTexture;
      }
    });

    ChromaKeyer.loadAndKeyImage('/assets/chicken_hatchling.jpg').then(canvas => {
      if (canvas) {
        const trimmed = ChromaKeyer.createTrimmedAtlas(canvas, 4, 4);
        this.hatchlingTexture = ChromaKeyer.createKeyedTexture(trimmed, 4, 4);
        if (this.questManager) this.questManager.hatchlingTexture = this.hatchlingTexture;
      }
    });

    ChromaKeyer.loadAndKeyImage('/assets/employee_hands.jpg').then(canvas => {
      if (canvas) {
        const loadedFrames = ChromaKeyer.sliceFrames(canvas, 4, 2);
        this.viewmodelFrames = loadedFrames;
        if (this.viewmodel) this.viewmodel.frames = loadedFrames;
      }
    });

    ChromaKeyer.loadAndKeyImage('/assets/kfc_props.jpg').then(canvas => {
      if (canvas) {
        this.propsTexture.image = ChromaKeyer.createTrimmedAtlas(canvas, 4, 2);
        this.propsTexture.needsUpdate = true;
      }
    });

    ChromaKeyer.loadAndKeyImage('/assets/kfc_items2.jpg').then(canvas => {
      if (canvas) {
        const trimmedItems = ChromaKeyer.createTrimmedAtlas(canvas, 4, 2);
        this.items2Texture = ChromaKeyer.createKeyedTexture(trimmedItems, 4, 2);
        if (this.questManager) this.questManager.itemsTexture = this.items2Texture;
      }
    });

    this.pbrTextures = {
      floor: ProceduralTextureGen.createCheckeredFloorPBR(512),
      metal: ProceduralTextureGen.createStainlessSteelPBR(512),
      ceiling: ProceduralTextureGen.createCeilingPBR(512),
      menu: ProceduralTextureGen.createMenuBoardTexture(1024, 512),
      freezerDoor: ProceduralTextureGen.createFreezerDoorTexture(512, 512)
    };
  }

  initWorld() {
    // Story & Lighting first
    this.storyManager = new StoryManager();
    this.lighting = new LightingSystem(this.scene, this.camera);

    // Level
    this.levelBuilder = new LevelBuilder(this.scene, this.pbrTextures, this.audio);
    const worldData = this.levelBuilder.build();
    this.colliders = worldData.colliders; // mutable reference
    this.interactables = worldData.interactables;

    // Player
    this.player = new PlayerController(
      this.camera,
      this.renderer.domElement,
      this.colliders,
      this.audio,
      this.lighting
    );
    // Start in car
    this.player.position.set(2.2, 1.35, -42.5);
    this.player.targetHeight = this.player.playerHeight;
    this.player.camera.position.copy(this.player.position);
    // Look at restaurant
    this.player.yaw = Math.PI * -0.08;
    this.player.pitch = 0.02;

    // Viewmodel
    this.viewmodel = new Viewmodel({
      frameCanvases: this.viewmodelFrames,
      audio: this.audio
    });
    this.player.viewmodel = this.viewmodel;

    // Monster (chicken)
    this.monster = new MonsterEntity({
      scene: this.scene,
      texture: this.monsterTexture,
      audio: this.audio,
      type: 'chicken',
      colliders: this.colliders
    });
    this.player.monster = this.monster;

    // Event Manager
    this.eventManager = new EventManager({
      scene: this.scene,
      audio: this.audio,
      lighting: this.lighting,
      player: this.player,
      story: this.storyManager
    });

    // Quest Manager - now needs doorSystem coliders, story, events
    this.questManager = new QuestManager({
      scene: this.scene,
      audio: this.audio,
      lighting: this.lighting,
      levelBuilder: this.levelBuilder,
      monster: this.monster,
      player: this.player,
      propsTexture: this.propsTexture,
      colonelTexture: this.colonelTexture,
      hatchlingTexture: this.hatchlingTexture,
      storyManager: this.storyManager,
      eventManager: this.eventManager,
      colliders: this.colliders
    });
    this.player.questManager = this.questManager;

    // Merge door colliders into player's list for collision
    if (this.questManager.doorSystem) {
      // Add doors to colliders array (reference already, but ensure)
      // We'll manage dynamic via PlayerController's check.
      this.colliders.push(...this.questManager.doorSystem.getColliders().filter(c => !this.colliders.includes(c)));
      // Also add freezer door if still there
      const freezerDoor = this.scene.children.find(o => o.userData?.type === 'freezer_door');
      if (freezerDoor && !this.colliders.includes(freezerDoor)) this.colliders.push(freezerDoor);
      // Refresh bounds
      this.player.colliderBounds = this.colliders.map(o => ({ object: o, box: new THREE.Box3().setFromObject(o) }));
    }

    // Player start callback for intro
    this.player.onStart = () => this.beginCarSequence();
  }

  initUI() {
    this.clockEl = document.getElementById('clock-display');
    this.staminaBarEl = document.getElementById('stamina-bar-fill');
    this.clueCounterEl = document.getElementById('clue-counter');
    this.lastStaminaPercent = -1;
    this.lastClockSecond = -1;

    // Sensitivity slider
    const sensSlider = document.getElementById('sens-slider');
    if (sensSlider) {
      sensSlider.value = localStorage.getItem('sensitivity') || '0.0025';
      sensSlider.addEventListener('input', (e) => {
        localStorage.setItem('sensitivity', e.target.value);
      });
    }
    const vhsToggle = document.getElementById('vhs-toggle');
    const vhsEl = document.getElementById('vhs-filter');
    if (vhsToggle && vhsEl) {
      vhsToggle.addEventListener('change', (e) => {
        if (e.target.checked) vhsEl.classList.remove('disabled');
        else vhsEl.classList.add('disabled');
      });
    }

    // Windshield rain
    this.carRain = document.getElementById('car-windshield-rain');
    this.carIntro = document.getElementById('car-intro');
    this.radioText = document.getElementById('radio-text');

    this.gameStartTime = Date.now();
  }

  initIntro() {
    // Car intro initially active but hidden until player starts? We'll show after start
    if (this.carIntro) this.carIntro.classList.remove('active');
  }

  beginCarSequence() {
    console.log('[Game] Begin car sequence - stranded on Route 17');
    this.introActive = true;
    this.carExited = false;

    if (this.carIntro) this.carIntro.classList.add('active');
    if (this.carRain) this.carRain.classList.add('active');

    // Player in car seat
    this.player.position.set(2.2, 1.35, -42.5);
    this.player.yaw = -0.15;
    this.player.pitch = 0.06;
    this.player.targetHeight = 0.95; // seated
    this.questManager.currentStep = 0;
    this.questManager.updateHUD();

    // Radio static text sequence
    const messages = [
      '-- kzzzh -- scanning 88.1 ...',
      '-- kzzzh -- ... ROAD CLOSED -- ...',
      '... Route 17, avoid ... restaurant ... lights on ...',
      '-- kzzz -- DON\'T GO IN THE VAULT --',
      '-- ... IT\'S NOT CHICKEN ... IT KNOWS ...',
      '-- kzzzh -- ENGINE OVERHEAT -- FUEL LEAK --',
      'FUEL: EMPTY - FIND SHELTER',
      '[E] EXIT CAR'
    ];
    let msgIdx = 0;
    this.radioInterval = setInterval(() => {
      if (this.radioText) this.radioText.textContent = messages[msgIdx];
      if (msgIdx < messages.length - 1) msgIdx++;
      // Play static
      if (this.audio) this.audio.playRadioStatic(0.22);
      if (msgIdx === 3 && this.audio) this.audio.playWhisper(0.2);
    }, 1300);

    // After some time, highlight interact prompt for car exit
    setTimeout(() => {
      if (this.player && !this.carExited) {
        this.player.showNotification('[E] EXIT CAR - GO TO LIGHTS', 4200);
      }
    }, 4800);
  }

  exitCar() {
    if (this.carExited) return;
    this.carExited = true;
    console.log('[Game] Exited car - entering exterior');

    clearInterval(this.radioInterval);

    if (this.carIntro) this.carIntro.classList.remove('active');
    if (this.carRain) {
      setTimeout(() => this.carRain.classList.remove('active'), 1200);
    }

    // Teleport just outside car
    this.player.position.set(3.4, this.player.playerHeight, -40.2);
    this.player.targetHeight = this.player.playerHeight;
    this.player.yaw = Math.PI * -0.15;
    this.player.addScreenShake(0.12, 0.4);

    this.questManager.currentStep = 1;
    this.storyManager.progressBeat('ARRIVAL');
    this.questManager.updateHUD();

    // Outdoor ambience
    this.audio.setAmbienceZone('outdoor');
    this.lighting.setPower(true); // exterior still has power

    // First clue notification
    setTimeout(() => {
      this.questManager.showBanner('ROUTE 17 - STORE #09 - LIGHTS ON', 2600);
    }, 800);

    // Allow flashlight, give low battery start for tension
    this.player.battery = 86;
    this.player.updateBatteryHUD();
    this.lighting.setBatteryLevel(this.player.battery);

    // Footstep on gravel
    this.audio.footstepMaterial = 'concrete';
  }

  animate() {
    requestAnimationFrame(this.animate);

    const delta = Math.min(this.clock.getDelta(), 0.1);
    const elapsed = this.clock.getElapsedTime();
    this.gameTime += delta;

    // Handle intro car exit logic via interaction / proximity
    if (this.introActive && !this.carExited && this.player.isStarted) {
      // If player tries to move while in car intro, count as exit attempt
      if (this.player.isMoving || this.player.keys['KeyE'] || this.player.keys['KeyW'] || this.player.focusedObject?.userData?.type === 'car') {
        // If pressing E near car or moving > threshold, exit
        const distToOutside = this.player.position.distanceTo(new THREE.Vector3(3.4, 1.65, -40));
        if (this.player.keys['KeyW'] || (this.player.focusedObject && this.player.focusedObject.userData.type === 'car') || distToOutside < 1.5 || this.gameTime > 8) {
          // Check for E press
          if (this.player.keys['KeyW'] || this.player._eDown) {
            this.exitCar();
          }
        }
      }
      // Auto-exit after 16 sec if stuck
      if (this.gameTime > 22 && !this.carExited) {
        this.exitCar();
      }
    }

    // Lighting & fog density based on zone/power
    if (this.lighting) {
      this.lighting.update(delta, elapsed);
    }

    // Player
    if (this.player) {
      const interactList = [...(this.levelBuilder?.propFactory?.interactables || []), ...(this.questManager?.doorSystem ? Array.from(this.questManager.doorSystem.doors.values()).map(d => d.hingeGroup) : [])];
      this.player.update(delta, interactList);

      if (this.staminaBarEl) {
        const pct = (this.player.stamina / this.player.maxStamina) * 100;
        if (Math.abs(pct - this.lastStaminaPercent) >= 0.5) {
          this.staminaBarEl.style.width = `${pct}%`;
          this.lastStaminaPercent = pct;
        }
      }

      // Also update interactables collision if doors moved
      if (this.questManager?.doorSystem) {
        // Already handled via move check
      }
    }

    // Monster AI
    if (this.monster && this.player) {
      this.monster.update(
        delta,
        this.player.position,
        this.camera,
        this.lighting.flashlightOn,
        this.player.noiseLevel,
        this.player.isHiding
      );
    }

    // Quest & Story
    if (this.questManager && this.player) {
      this.questManager.update(delta, this.player.position);

      // Update clue counter
      if (this.clueCounterEl && this.storyManager) {
        this.clueCounterEl.textContent = `CLUES ${this.storyManager.getDiscoveredCount()}/${this.storyManager.getTotalClues()}`;
      }
    }

    // Events
    if (this.eventManager && this.player) {
      const context = {
        time: this.gameTime,
        phase: this.questManager?.currentStep || 0,
        zone: this.lighting?.getCurrentZone(this.player.position) || 'outdoor',
        distToBallPit: this.player.position.distanceTo(new THREE.Vector3(22, 0, -18)),
        justEnteredCorridor: false,
        seenPortrait: this.gameTime > 40 ? 3 : 0,
        watchCCTV: false,
        justFueledGenerator: this.questManager?.generatorPowered && this.gameTime % 2 < 0.1,
        isAlone: this.monster ? this.player.position.distanceTo(this.monster.mesh.position) > 14 : true,
        nearCar: this.player.position.distanceTo(this.levelBuilder?.carGroup?.position || new THREE.Vector3(0,0,-42)) < 5,
        enteredGeneratorRoom: (this.lighting?.getCurrentZone(this.player.position) === 'basement'),
        enteredBallPit: this.player.position.distanceTo(new THREE.Vector3(22,0,-18)) < 3
      };
      this.eventManager.update(delta, context);
    }

    // Clock VHS time - starts at 03:14
    if (this.clockEl) {
      const totalSec = Math.floor(elapsed);
      if (totalSec !== this.lastClockSecond) {
        const mins = Math.floor((14 * 60 + totalSec) / 60) % 60;
        const secs = (14 * 60 + totalSec) % 60;
        const m = mins < 10 ? `0${mins}` : `${mins}`;
        const s = secs < 10 ? `0${secs}` : `${secs}`;
        this.clockEl.textContent = `03:${m}:${s} AM`;
        this.lastClockSecond = totalSec;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new Game();
});
