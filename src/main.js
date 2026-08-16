import * as THREE from 'three';
import { ProceduralTextureGen } from './engine/ProceduralTextureGen.js';
import { TextureLibrary } from './engine/TextureLibrary.js';
import { AudioManager } from './engine/AudioManager.js';
import { LightingSystem } from './engine/LightingSystem.js';
import { LevelBuilder } from './level/LevelBuilder.js';
import { PlayerController } from './engine/PlayerController.js';
import { MonsterEntity } from './entities/MonsterEntity.js';
import { Viewmodel } from './entities/Viewmodel.js';
import { QuestManager, STEP } from './level/QuestManager.js';
import { StoryManager } from './engine/StoryManager.js';
import { EventManager } from './engine/EventManager.js';
import { TimerRegistry } from './engine/Timers.js';

class Game {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.clock = new THREE.Clock();
    this.gameTime = 0;
    this.introActive = true;
    this.carExited = false;
    /** Every intro/scripted timer lives here so a restart can wipe them all. */
    this.timers = new TimerRegistry();

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
    this.scene.background = new THREE.Color(0x070610);
    // Horror fog. At the old 0.028 exponential density everything past ~12m
    // was solid black, which hid the level geometry, the textures and the
    // monster's approach alike. 0.016 still swallows the far end of a room
    // but lets you actually see the space you are standing in.
    this.scene.fog = new THREE.FogExp2(0x0a0812, 0.016);

    this.camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.1, 160);

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // Cap at 1: this is a pixel-art game, and rendering above 1x only blurs
    // the texel grid while costing fill rate.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    // The textures are authored in sRGB; without this the whole game renders
    // washed out and the "dirty" palette turns grey.
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

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

  /**
   * Sprite atlases.
   *
   * These used to be built on the fly: generate a procedural placeholder
   * sheet, chroma-key it, then fetch ~4 MB of magenta-backed JPGs, key those
   * per-pixel on the main thread and rebuild trimmed atlases from them - all
   * while the player was already walking around, and identically on every
   * single load.
   *
   * tools/build_sprites.py now does that work once, offline, and does it
   * better (it also strips the frame captions and grid rules that the runtime
   * keyer left visible in-game). Here we just load finished RGBA PNGs, which
   * removes the placeholder-then-pop entirely.
   */
  initAssets() {
    const loader = new THREE.TextureLoader();

    /** Loads one baked atlas as a pixel-perfect, non-mipmapped sprite sheet. */
    const loadAtlas = (name, cols, rows, onLoad) => {
      const tex = loader.load(`/assets/sprites/${name}.png`, (t) => {
        t.needsUpdate = true;
        onLoad?.(t);
      });
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.repeat.set(1 / cols, 1 / rows);
      tex.userData = { cols, rows };
      return tex;
    };

    this.monsterTexture = loadAtlas('chicken_monster', 4, 2);
    this.colonelTexture = loadAtlas('colonel_stalker', 4, 2);
    this.propsTexture = loadAtlas('kfc_props', 4, 2);
    // The hatchling sheet is a genuine 4x4 (walk / attack / lunge / death),
    // and is loaded as such from the start - no 4x2 placeholder to re-grid.
    this.hatchlingTexture = loadAtlas('chicken_hatchling', 4, 4);

    // The viewmodel draws to a 2D canvas, so it needs the frames as separate
    // images rather than as a GPU atlas.
    this.viewmodelFrames = [];
    const handsImg = new Image();
    handsImg.onload = () => {
      const cols = 4, rows = 2;
      const fw = handsImg.width / cols;
      const fh = handsImg.height / rows;
      const frames = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cv = document.createElement('canvas');
          cv.width = fw;
          cv.height = fh;
          const ctx = cv.getContext('2d');
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(handsImg, c * fw, r * fh, fw, fh, 0, 0, fw, fh);
          frames.push(cv);
        }
      }
      this.viewmodelFrames = frames;
      if (this.viewmodel) this.viewmodel.frames = frames;
    };
    handsImg.src = '/assets/sprites/employee_hands.png';

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

    // Level. The texture library needs the renderer for its anisotropy cap,
    // so it is created here rather than in initAssets().
    this.textures = new TextureLibrary(this.renderer);
    this.levelBuilder = new LevelBuilder(this.scene, this.pbrTextures, this.audio, this.textures);
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
      colliders: this.colliders,
      game: this
    });
    this.player.questManager = this.questManager;

    // Door leaves join the shared collider array. Everything that collides
    // (player, monster, hatchlings) reads this same array, so there is exactly
    // one collision world.
    for (const leaf of this.questManager.doorSystem.getColliders()) {
      if (!this.colliders.includes(leaf)) this.colliders.push(leaf);
    }
    this.player.syncColliders();
    this.monster.doorSystem = this.questManager.doorSystem;

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
    this.introActive = true;
    this.carExited = false;
    this.timers.clearAll();

    if (this.carIntro) this.carIntro.classList.add('active');
    if (this.carRain) this.carRain.classList.add('active');

    // Player in the driver's seat: they can look around and press E, but the
    // movement lock means they cannot walk out of the cinematic.
    this.player.position.set(2.2, 0.95, -42.5);
    this.player.yaw = -0.15;
    this.player.pitch = 0.06;
    this.player.targetHeight = 0.95;
    this.player.movementLocked = true;
    this.player.interactOverride = null;   // E does nothing until the radio finishes
    this.questManager.setStep(STEP.INTRO, true);

    // Radio: one timer chain, one message at a time. Driven off the registry
    // so skipping or restarting cannot leave an orphaned interval running.
    const messages = [
      '-- kzzzh -- scanning 88.1 ...',
      '-- kzzzh -- ... ROAD CLOSED -- ...',
      '... Route 17, avoid ... restaurant ... lights on ...',
      "-- kzzz -- DON'T GO IN THE VAULT --",
      "-- ... IT'S NOT CHICKEN ... IT KNOWS ...",
      '-- kzzzh -- ENGINE OVERHEAT -- FUEL LEAK --',
      'FUEL: EMPTY - FIND SHELTER',
      '[E] EXIT CAR'
    ];
    let msgIdx = 0;
    this.radioTimer = this.timers.setInterval(() => {
      if (this.radioText) this.radioText.textContent = messages[msgIdx];
      this.audio?.playRadioStatic(0.22);
      if (msgIdx === 3) this.audio?.playWhisper(0.2);
      msgIdx++;
      if (msgIdx >= messages.length) {
        this.timers.clearInterval(this.radioTimer);
        this.radioTimer = null;
        this.armCarExit();
      }
    }, 1300);

    // Safety net: if audio is blocked or the tab was backgrounded, the exit
    // still arms on a wall clock.
    this.timers.setTimeout(() => this.armCarExit(), messages.length * 1300 + 1500);
  }

  /**
   * Hands control of E back to the player, once, at the end of the radio
   * sequence. Before this point the intro plays out uninterrupted.
   */
  armCarExit() {
    if (this.carExited || this.exitArmed) return;
    this.exitArmed = true;
    this.player.interactOverride = () => this.exitCar();
    this.player.showNotification('[E] EXIT CAR - GO TO THE LIGHTS', 5000);
  }

  exitCar() {
    if (this.carExited) return;
    this.carExited = true;
    this.introActive = false;
    this.exitArmed = false;

    // Everything the intro scheduled dies here, including the radio.
    this.timers.clearAll();
    this.radioTimer = null;

    this.player.interactOverride = null;
    this.player.movementLocked = false;

    if (this.carIntro) this.carIntro.classList.remove('active');
    if (this.carRain) this.timers.setTimeout(() => this.carRain.classList.remove('active'), 1200);

    // Step out beside the driver's door.
    // (3.4, -40.2) was inside the car's footprint - harmless while the car had
    // no collider, but it would drop the player inside solid geometry now that
    // it has one. This spot is clear of the body on the driver's flank.
    this.player.position.set(4.94, this.player.playerHeight, -41.5);
    this.player.targetHeight = this.player.playerHeight;
    this.player.yaw = Math.PI * -0.15;
    this.player.addScreenShake(0.12, 0.4);

    this.questManager.hasExitedCar = true;
    this.questManager.completeObjective('exit_car');

    this.audio.setAmbienceZone('outdoor');
    this.lighting.setPower(true); // exterior still has power

    this.timers.setTimeout(() => {
      this.questManager.showBanner('ROUTE 17 - STORE #09 - LIGHTS ON', 2600);
    }, 800);

    // Start on a worn battery: the flashlight is a resource from minute one.
    this.player.battery = 86;
    this.player.updateBatteryHUD();
    this.lighting.setBatteryLevel(this.player.battery);
    this.audio.footstepMaterial = 'concrete';
  }

  /**
   * Full in-place restart. Every system is reset in dependency order rather
   * than reloading the page, so the WebGL context, textures and listeners are
   * reused and run 2 starts instantly.
   */
  restart() {
    this.timers.clearAll();

    // Hide every terminal / modal overlay.
    for (const id of ['jumpscare-overlay', 'win-screen', 'document-modal', 'cctv-modal', 'pause-menu']) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }

    this.questManager.reset();
    this.player.reset();
    this.storyManager.reset();
    this.eventManager.reset();
    this.lighting.reset();
    this.audio.reset();

    this.gameTime = 0;
    this.clock.start();
    // Every "only write the DOM when it changed" cache has to be invalidated
    // too, or run 2 keeps showing run 1's last value until it happens to move.
    this.lastStaminaPercent = -1;
    this.lastClockSecond = -1;
    this._lastClueCount = -1;
    this._lastZone = null;
    this._pendingGeneratorEvent = false;
    this.gameStartTime = Date.now();
    if (this.clueCounterEl && this.storyManager) {
      this.clueCounterEl.textContent = `CLUES 0/${this.storyManager.getTotalClues()}`;
    }

    this.beginCarSequence();
    this.player.requestLock?.();
  }

  animate() {
    requestAnimationFrame(this.animate);

    const delta = Math.min(this.clock.getDelta(), 0.1);
    this.gameTime += delta;

    const ended = this.questManager?.gameOver || this.questManager?.gameWon;

    if (this.lighting) this.lighting.update(delta, this.gameTime);

    // Simulation halts on a terminal state; rendering does not, so the death
    // and victory screens sit over a live (but frozen) world.
    if (!ended) {
      this.updateSimulation(delta);
    }

    this.updateClock();
    this.renderer.render(this.scene, this.camera);
  }

  /** Everything that advances game state. Skipped once the run has ended. */
  updateSimulation(delta) {
    // Player + interaction targets. The list is rebuilt into a reused array
    // rather than a fresh one each frame.
    const list = this._interactList || (this._interactList = []);
    list.length = 0;
    const props = this.levelBuilder?.propFactory?.interactables;
    if (props) for (const p of props) list.push(p);
    if (this.questManager?.doorSystem) {
      for (const door of this.questManager.doorSystem.doors.values()) list.push(door.hingeGroup);
    }
    this.player.update(delta, list);

    if (this.staminaBarEl) {
      const pct = (this.player.stamina / this.player.maxStamina) * 100;
      if (Math.abs(pct - this.lastStaminaPercent) >= 0.5) {
        this.staminaBarEl.style.width = `${pct}%`;
        this.lastStaminaPercent = pct;
      }
    }

    // Monster AI
    if (this.monster) {
      this.monster.update(
        delta,
        this.player.position,
        this.camera,
        this.lighting.flashlightOn,
        this.player.noiseLevel,
        this.player.isHiding
      );
    }

    // Quest, story, hatchlings, doors
    if (this.questManager) {
      this.questManager.update(delta, this.player.position);
      if (this.clueCounterEl && this.storyManager) {
        const found = this.storyManager.getDiscoveredCount();
        if (found !== this._lastClueCount) {
          this._lastClueCount = found;
          this.clueCounterEl.textContent = `CLUES ${found}/${this.storyManager.getTotalClues()}`;
        }
      }
    }

    // Chase music follows the actual threat state rather than a guess.
    this.updateTension();

    if (this.eventManager) this.eventManager.update(delta, this.buildEventContext());
  }

  /**
   * Drives the chase audio layer from real AI state: anything actively hunting
   * the player raises tension, distance lowers it.
   */
  updateTension() {
    if (!this.audio) return;
    let hunting = false;
    let nearest = Infinity;

    if (this.monster?.isActive() && !this.monster.isDead) {
      const s = this.monster.state;
      if (s === 'CHASE' || s === 'SEARCH' || s === 'HEAR') {
        hunting = hunting || s === 'CHASE';
        nearest = Math.min(nearest, this.player.position.distanceTo(this.monster.mesh.position));
      }
    }
    if (this.questManager?.colonel?.isActive() && this.questManager.colonel.state === 'CHASE') {
      hunting = true;
      nearest = Math.min(nearest, this.player.position.distanceTo(this.questManager.colonel.mesh.position));
    }
    for (const h of this.questManager?.hatchlings || []) {
      if (h.isActive?.() && h.state === 'CHASE') {
        hunting = true;
        nearest = Math.min(nearest, this.player.position.distanceTo(h.mesh.position));
      }
    }

    const intensity = hunting ? THREE.MathUtils.clamp(1 - (nearest - 3) / 18, 0.25, 1) : 0;
    if (hunting !== this.audio.chaseActive) this.audio.setChase(hunting, intensity);
    else if (hunting) this.audio.setChase(true, intensity);
  }

  /** Reuses one context object and its vectors instead of allocating per frame. */
  buildEventContext() {
    const ctx = this._eventCtx || (this._eventCtx = {
      _ballPit: new THREE.Vector3(22, 0, -18),
      _carPos: new THREE.Vector3(3, 0, -42)
    });
    const zone = this.lighting?.getCurrentZone(this.player.position) || 'outdoor';
    const distBallPit = this.player.position.distanceTo(ctx._ballPit);

    ctx.time = this.gameTime;
    ctx.phase = this.questManager?.currentStep || 0;
    ctx.zone = zone;
    ctx.distToBallPit = distBallPit;
    ctx.enteredBallPit = distBallPit < 3;
    ctx.enteredGeneratorRoom = zone === 'basement';
    ctx.justEnteredCorridor = zone === 'hallway' && this._lastZone !== 'hallway';
    ctx.nearCar = this.player.position.distanceTo(this.levelBuilder?.carGroup?.position || ctx._carPos) < 5;
    ctx.isAlone = this.monster
      ? this.player.position.distanceTo(this.monster.mesh.position) > 14
      : true;
    // Real signals, not timers: these are set by the systems that own them and
    // consumed exactly once here.
    ctx.seenPortrait = this.questManager?.portraitStares || 0;
    // Live state, not a lifetime tally: the figure may only cross a feed that
    // is actually on screen. The old cumulative counter stayed truthy forever
    // after the first viewing, so the event could fire in an empty office.
    ctx.watchCCTV = this.questManager?.isWatchingCCTV() === true;
    ctx.justFueledGenerator = this._pendingGeneratorEvent === true;
    this._pendingGeneratorEvent = false;

    this._lastZone = zone;
    return ctx;
  }

  /** VHS clock. Runs off gameTime so it freezes with the simulation. */
  updateClock() {
    if (!this.clockEl) return;
    const totalSec = Math.floor(this.gameTime);
    if (totalSec === this.lastClockSecond) return;
    this.lastClockSecond = totalSec;
    const mins = Math.floor((14 * 60 + totalSec) / 60) % 60;
    const secs = (14 * 60 + totalSec) % 60;
    this.clockEl.textContent =
      `03:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs} AM`;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  // Both restart buttons run the in-place reset instead of reloading the page.
  for (const id of ['restart-btn', 'play-again-btn']) {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => game.restart());
  }
});
