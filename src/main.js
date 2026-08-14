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

class Game {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.clock = new THREE.Clock();

    this.initScene();
    this.initAudio();
    this.initAssets();
    this.initWorld();
    this.initUI();

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050203);
    // Keep the horror mood without swallowing interactable pickups in fog.
    this.scene.fog = new THREE.FogExp2(0x0a0405, 0.032);

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );

    // Keep the default render path intentionally light. The game uses several
    // PBR materials and dynamic lights, so MSAA + a large device pixel ratio
    // makes low/medium-end GPUs hitch very easily.
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    // A moving 512px shadow map from the flashlight was the biggest GPU cost
    // in the scene. The baked/emissive horror lighting reads well without it.
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.container.appendChild(this.renderer.domElement);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  initAudio() {
    this.audio = new AudioManager();
  }

  initAssets() {
    console.log('[Assets] Loading Nano Banana Pro Spritesheets on #FF00FF Pink and PBR Materials...');

    // 1. Initial textures for instant load
    const rawMonsterSheet = ProceduralTextureGen.generateChickenMonsterSheet();
    const rawColonelSheet = ProceduralTextureGen.generateColonelStalkerSheet();
    const rawHandsSheet = ProceduralTextureGen.generateEmployeeHandsSheet();
    const rawPropsSheet = ProceduralTextureGen.generateCursedPropsSheet();

    // 2. Chroma key processing
    const keyedMonster = ChromaKeyer.processChromaKey(rawMonsterSheet);
    const keyedColonel = ChromaKeyer.processChromaKey(rawColonelSheet);
    const keyedHands = ChromaKeyer.processChromaKey(rawHandsSheet);
    const keyedProps = ChromaKeyer.processChromaKey(rawPropsSheet);

    this.monsterTexture = ChromaKeyer.createKeyedTexture(keyedMonster, 4, 2);
    this.colonelTexture = ChromaKeyer.createKeyedTexture(keyedColonel, 4, 2);
    this.propsTexture = ChromaKeyer.createKeyedTexture(keyedProps, 4, 2);
    this.viewmodelFrames = ChromaKeyer.sliceFrames(keyedHands, 4, 2);

    // Initial placeholder for hatchlings
    const rawHatchling = ProceduralTextureGen.generateChickenMonsterSheet();
    const keyedHatchling = ChromaKeyer.processChromaKey(rawHatchling);
    this.hatchlingTexture = ChromaKeyer.createKeyedTexture(keyedHatchling, 4, 4);

    // 3. Asynchronously load and apply Nano Banana Pro Generated Spritesheets
    ChromaKeyer.loadAndKeyImage('/assets/chicken_monster.jpg').then((canvas) => {
      if (canvas) {
        this.monsterTexture.image = ChromaKeyer.createTrimmedAtlas(canvas, 4, 2);
        this.monsterTexture.needsUpdate = true;
        if (this.monster && this.monster.sprite) {
          this.monster.sprite.texture.image = this.monsterTexture.image;
          this.monster.sprite.texture.needsUpdate = true;
        }
      }
    });

    ChromaKeyer.loadAndKeyImage('/assets/colonel_stalker.jpg').then((canvas) => {
      if (canvas) {
        this.colonelTexture.image = ChromaKeyer.createTrimmedAtlas(canvas, 4, 2);
        this.colonelTexture.needsUpdate = true;
        if (this.questManager) {
          this.questManager.colonelTexture = this.colonelTexture;
        }
      }
    });

    ChromaKeyer.loadAndKeyImage('/assets/chicken_hatchling.jpg').then((canvas) => {
      if (canvas) {
        const trimmedHatchling = ChromaKeyer.createTrimmedAtlas(canvas, 4, 4);
        this.hatchlingTexture = ChromaKeyer.createKeyedTexture(trimmedHatchling, 4, 4);
        if (this.questManager) {
          this.questManager.hatchlingTexture = this.hatchlingTexture;
        }
      }
    });

    ChromaKeyer.loadAndKeyImage('/assets/employee_hands.jpg').then((canvas) => {
      if (canvas) {
        const loadedFrames = ChromaKeyer.sliceFrames(canvas, 4, 2);
        this.viewmodelFrames = loadedFrames;
        if (this.viewmodel) {
          this.viewmodel.frames = loadedFrames;
        }
      }
    });

    ChromaKeyer.loadAndKeyImage('/assets/kfc_props.jpg').then((canvas) => {
      if (canvas) {
        this.propsTexture.image = ChromaKeyer.createTrimmedAtlas(canvas, 4, 2);
        this.propsTexture.needsUpdate = true;
      }
    });

    ChromaKeyer.loadAndKeyImage('/assets/kfc_items2.jpg').then((canvas) => {
      if (canvas) {
        const trimmedItems = ChromaKeyer.createTrimmedAtlas(canvas, 4, 2);
        this.items2Texture = ChromaKeyer.createKeyedTexture(trimmedItems, 4, 2);
        if (this.questManager) {
          this.questManager.itemsTexture = this.items2Texture;
        }
      }
    });

    // 4. Generate PBR Textures
    this.pbrTextures = {
      floor: ProceduralTextureGen.createCheckeredFloorPBR(512),
      metal: ProceduralTextureGen.createStainlessSteelPBR(512),
      ceiling: ProceduralTextureGen.createCeilingPBR(512),
      menu: ProceduralTextureGen.createMenuBoardTexture(1024, 512),
      freezerDoor: ProceduralTextureGen.createFreezerDoorTexture(512, 512)
    };
  }

  initWorld() {
    // 1. Lighting System (PBR lights, flickering tubes, flashlight)
    this.lighting = new LightingSystem(this.scene, this.camera);

    // 2. Level Builder (Horror KFC geometry & PBR materials)
    this.levelBuilder = new LevelBuilder(this.scene, this.pbrTextures, this.audio);
    const worldData = this.levelBuilder.build();
    this.colliders = worldData.colliders;
    this.interactables = worldData.interactables;

    // 3. Player Controller (FPS WASD + Mouse Look + Headbob + Stamina + Vitals)
    this.player = new PlayerController(
      this.camera,
      this.renderer.domElement,
      this.colliders,
      this.audio,
      this.lighting
    );

    // 4. Viewmodel (1st person retro hands)
    this.viewmodel = new Viewmodel({
      frameCanvases: this.viewmodelFrames,
      audio: this.audio
    });
    this.player.viewmodel = this.viewmodel;

    // 5. Monster Entity (Mutant Chicken Chimera)
    this.monster = new MonsterEntity({
      scene: this.scene,
      texture: this.monsterTexture,
      audio: this.audio,
      type: 'chicken',
      colliders: this.colliders
    });
    this.player.monster = this.monster;

    // 6. Quest Manager (6-Phase Horror Shift Storyline)
    this.questManager = new QuestManager({
      scene: this.scene,
      audio: this.audio,
      lighting: this.lighting,
      levelBuilder: this.levelBuilder,
      monster: this.monster,
      player: this.player,
      propsTexture: this.propsTexture,
      colonelTexture: this.colonelTexture,
      hatchlingTexture: this.hatchlingTexture
    });
    this.player.questManager = this.questManager;
  }

  initUI() {
    // Clock update (Horror VHS format)
    this.gameStartTime = Date.now();
    this.clockEl = document.getElementById('clock-display');
    this.staminaBarEl = document.getElementById('stamina-bar-fill');
    this.lastStaminaPercent = -1;
    this.lastClockSecond = -1;
  }

  animate() {
    requestAnimationFrame(this.animate);

    const delta = Math.min(this.clock.getDelta(), 0.1);
    const elapsedTime = this.clock.getElapsedTime();

    // 1. Update Lighting & Flickers
    if (this.lighting) {
      this.lighting.update(delta, elapsedTime);
    }

    // 2. Update Player
    if (this.player) {
      this.player.update(delta, this.interactables);

      // Update Stamina Bar in HUD
      if (this.staminaBarEl) {
        const pct = (this.player.stamina / this.player.maxStamina) * 100;
        if (Math.abs(pct - this.lastStaminaPercent) >= 0.5) {
          this.staminaBarEl.style.width = `${pct}%`;
          this.lastStaminaPercent = pct;
        }
      }
    }

    // 3. Update Monster AI
    if (this.monster && this.player) {
      this.monster.update(
        delta,
        this.player.position,
        this.camera,
        this.lighting.flashlightOn
      );
    }

    // 4. Update Quest Progression
    if (this.questManager && this.player) {
      this.questManager.update(delta, this.player.position);
    }

    // 5. Update VHS Clock
    if (this.clockEl) {
      const totalSeconds = Math.floor(elapsedTime);
      if (totalSeconds !== this.lastClockSecond) {
        const minutes = Math.floor((14 * 60 + totalSeconds) / 60) % 60;
        const seconds = (14 * 60 + totalSeconds) % 60;
        const secStr = seconds < 10 ? `0${seconds}` : `${seconds}`;
        const minStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
        this.clockEl.textContent = `03:${minStr}:${secStr} AM`;
        this.lastClockSecond = totalSeconds;
      }
    }

    // Render Scene
    this.renderer.render(this.scene, this.camera);
  }
}

// Start Game on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  new Game();
});
