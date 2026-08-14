import { TimerRegistry } from './Timers.js';

/**
 * EventManager - Cinematic scripted horror events that build atmospheric tension
 * without relying on constant jumpscares. Events trigger based on position,
 * story progress, time, and player actions.
 */

export class EventManager {
  constructor(options) {
    this.scene = options.scene;
    this.audio = options.audio;
    this.lighting = options.lighting;
    this.player = options.player;
    this.story = options.story;

    this.events = new Map();
    this.triggeredEvents = new Set();
    this.activeAmbientEvents = [];
    this.lastEventTime = 0;
    this.eventCooldown = 0;

    // State for subtle environment changes
    this.flickerQueue = [];
    this.objectSwapQueue = [];
    this.whisperTimer = 0;
    /** All deferred effect timers, so reset() can cancel them mid-flight. */
    this.timers = new TimerRegistry();

    this.initEvents();
  }

  initEvents() {
    // Each event has: id, trigger condition, cooldown, one-time?, action
    this.registerEvent({
      id: 'intro_radio_static',
      oneTime: true,
      condition: (ctx) => ctx.phase === 0 && ctx.time > 2,
      action: () => this.playRadioDisturbance(" --kzzzh-- ...don't... come ... vault four ... --kzzz--")
    });

    this.registerEvent({
      id: 'dining_chair_moves',
      oneTime: true,
      condition: (ctx) => ctx.zone === 'dining' && ctx.phase >= 1 && !this.hasTriggered('dining_chair_moves'),
      cooldown: 15,
      action: () => {
        this.triggerFlicker(0.8, 2);
        this.playSpatialSound('distant_chair', { volume: 0.4, delay: 0.5 });
        this.timers.setTimeout(() => this.showSubtleNotification("Chair moved when you weren't looking."), 1200);
      }
    });

    this.registerEvent({
      id: 'kitchen_fryer_bubble',
      oneTime: false,
      condition: (ctx) => ctx.zone === 'kitchen' && Math.random() < 0.002,
      cooldown: 20,
      action: () => {
        if (this.audio) this.audio.playHotOilSplash(0.15);
        this.triggerFlicker(0.4, 1);
      }
    });

    this.registerEvent({
      id: 'ball_pit_rustle',
      oneTime: false,
      condition: (ctx) => ctx.zone === 'playplace' && ctx.distToBallPit < 6,
      cooldown: 12,
      action: () => {
        this.playSpatialSound('ball_rustle');
        // Rare: show eyes in pit for a second when player turns away
        if (Math.random() < 0.2) {
          this.triggerBallPitEyes();
        }
      }
    });

    this.registerEvent({
      id: 'office_phone_ring',
      oneTime: true,
      condition: (ctx) => ctx.zone === 'office' && ctx.phase >= 2,
      action: () => {
        this.playSpatialSound('phone_ring');
        if (this.audio) this.audio.playCCTVGlitch();
        this.timers.setTimeout(() => {
          this.playSpatialSound('phone_dead');
          this.showSubtleNotification("Line dead. Dial tone... then breathing.");
        }, 2500);
      }
    });

    this.registerEvent({
      id: 'freezer_breath',
      oneTime: false,
      condition: (ctx) => ctx.zone === 'freezer',
      cooldown: 8,
      action: () => {
        this.triggerBreathFog();
        if (Math.random() < 0.15) {
          this.playSpatialSound('freezer_whisper');
        }
      }
    });

    this.registerEvent({
      id: 'corridor_door_slam',
      oneTime: true,
      condition: (ctx) => ctx.justEnteredCorridor && ctx.phase >= 2,
      action: () => {
        this.playSpatialSound('door_slam', { volume: 0.8 });
        if (this.lighting) this.lighting.triggerFlickerBurst(1.5);
        this.player.addScreenShake(0.15, 0.4);
      }
    });

    this.registerEvent({
      id: 'portrait_change',
      oneTime: true,
      // Phase is a floor, not an equality: the player rarely walks back past
      // the portrait on exactly one step, and an equality gate meant this beat
      // could never fire.
      condition: (ctx) => ctx.phase >= 2 && ctx.seenPortrait > 2,
      action: () => {
        this.triggerPortraitChange();
      }
    });

    this.registerEvent({
      id: 'cctv_figure',
      oneTime: false,
      // Rolled per frame while the feed is open: ~1 in 125 frames is roughly
      // one sighting every two seconds of watching, then a long cooldown.
      condition: (ctx) => ctx.watchCCTV && Math.random() < 0.008,
      cooldown: 30,
      action: () => {
        this.triggerCCTVFigure();
      }
    });

    this.registerEvent({
      id: 'generator_startle',
      oneTime: true,
      // Fuelling the generator immediately advances the ladder past GENERATOR,
      // so gating on phase === 6 made this unreachable. The one-shot signal is
      // the trigger.
      condition: (ctx) => ctx.justFueledGenerator,
      action: () => {
        this.cinematicGeneratorSurge();
      }
    });

    this.registerEvent({
      id: 'footsteps_behind',
      oneTime: false,
      condition: (ctx) => ctx.phase >= 5 && ctx.isAlone && Math.random() < 0.0015,
      cooldown: 25,
      action: () => {
        this.playSpatialSound('footsteps', { behind: true, volume: 0.3 });
      }
    });

    this.registerEvent({
      id: 'blood_trail_appears',
      oneTime: true,
      condition: (ctx) => ctx.phase >= 4 && ctx.enteredGeneratorRoom,
      action: () => {
        this.revealBloodTrail();
      }
    });

    this.registerEvent({
      id: 'radio_car_final',
      oneTime: true,
      condition: (ctx) => ctx.phase >= 8 && ctx.nearCar,
      action: () => {
        this.playRadioDisturbance("HE'S IN THE BACK SEAT --kzzz--");
      }
    });
  }

  registerEvent(evt) {
    this.events.set(evt.id, { ...evt, lastTrigger: -999 });
  }

  hasTriggered(id) {
    return this.triggeredEvents.has(id);
  }

  update(delta, context) {
    this.eventCooldown = Math.max(0, this.eventCooldown - delta);
    this.whisperTimer += delta;

    // Subtle ambient tension
    if (this.whisperTimer > 12 && Math.random() < 0.015 && context.phase >= 2) {
      this.whisperTimer = 0;
      this.playSpatialSound('whisper', { volume: 0.08 + Math.random() * 0.12 });
    }

    // Process flicker queue
    if (this.flickerQueue.length > 0) {
      const f = this.flickerQueue[0];
      f.time -= delta;
      if (f.time <= 0) this.flickerQueue.shift();
    }

    // Check all events
    if (this.eventCooldown <= 0) {
      for (const evt of this.events.values()) {
        if (evt.oneTime && this.triggeredEvents.has(evt.id)) continue;
        const since = context.time - evt.lastTrigger;
        const cd = evt.cooldown || 3;
        if (since < cd) continue;

        try {
          if (evt.condition(context)) {
            evt.lastTrigger = context.time;
            if (evt.oneTime) this.triggeredEvents.add(evt.id);
            evt.action(context);
            this.eventCooldown = 1.2;
            this.lastEventTime = context.time;
            break; // only one per tick
          }
        } catch (e) {
          console.warn('Event error', evt.id, e);
        }
      }
    }
  }

  // --- Helper triggers ---
  triggerFlicker(duration = 1, intensity = 1) {
    if (this.lighting) {
      this.lighting.triggerFlickerBurst(duration, intensity);
    }
  }

  playSpatialSound(type, opts = {}) {
    if (!this.audio) return;
    const volume = opts.volume ?? 0.5;
    switch (type) {
      case 'distant_chair': this.audio.playFootstep(volume * 0.6); break;
      case 'ball_rustle': this.audio.playFootstep(volume * 0.4); break;
      case 'phone_ring': this.audio.playTimecardPunch(volume); break;
      case 'phone_dead': this.audio.playRadioStatic(volume); break;
      case 'door_slam': this.audio.playDoorSlam(volume); break;
      case 'freezer_whisper': this.audio.playWhisper(volume); break;
      case 'footsteps': this.audio.playFootstepBehind(volume); break;
      case 'whisper': this.audio.playWhisper(volume); break;
    }
  }

  playRadioDisturbance(text) {
    if (this.audio) this.audio.playRadioStatic(0.6);
    this.showSubtleNotification(text, 3500, 'radio');
  }

  showSubtleNotification(text, duration = 3000, type = 'ambient') {
    const el = document.getElementById('ambient-note');
    if (!el) return;
    el.textContent = text;
    el.className = `ambient-note visible type-${type}`;
    this.timers.clearTimeout(this._noteTimeout);
    this._noteTimeout = this.timers.setTimeout(() => el.className = 'ambient-note', duration);
  }

  triggerBallPitEyes() {
    // Create temporary emissive eyes mesh in ball pit
    const eyesGroup = this.scene.getObjectByName('ballpit_eyes');
    if (!eyesGroup) return;
    eyesGroup.visible = true;
    this.timers.setTimeout(() => { eyesGroup.visible = false; }, 850);
    if (this.audio) this.audio.playWhisper(0.15);
  }

  triggerBreathFog() {
    const overlay = document.getElementById('breath-fog');
    if (!overlay) return;
    overlay.classList.add('active');
    this.timers.setTimeout(() => overlay.classList.remove('active'), 1200);
  }

  triggerPortraitChange() {
    const before = this.scene.getObjectByName('cursed_portrait_plane');
    const after = this.scene.getObjectByName('cursed_portrait_changed');
    if (before && after) {
      before.visible = false;
      after.visible = true;
      this.triggerFlicker(0.6, 2);
      if (this.audio) this.audio.playJumpscareStinger(0.25);
      this.showSubtleNotification("His smile got wider.", 3200);
      if (this.story) this.story.discoverClue('colonel_note');
    }
  }

  triggerCCTVFigure() {
    const el = document.getElementById('cctv-anomaly');
    if (!el) return;
    el.classList.add('active');
    this.timers.setTimeout(() => el.classList.remove('active'), 900);
    if (this.audio) this.audio.playCCTVGlitch();
  }

  cinematicGeneratorSurge() {
    if (this.lighting) {
      this.lighting.powerSurgeSequence();
    }
    if (this.audio) {
      this.audio.playBreakerRestore(0.8);
      this.timers.setTimeout(() => this.audio.playMonsterScreech(0.3), 800);
    }
    // Briefly show silhouette at end of hallway
    const sil = document.getElementById('hallway-silhouette');
    if (sil) {
      sil.classList.add('active');
      this.timers.setTimeout(() => sil.classList.remove('active'), 1100);
    }
    this.showSubtleNotification("Power restored. Something else woke up.", 4000, 'danger');
  }

  revealBloodTrail() {
    const trail = this.scene.getObjectByName('blood_trail');
    if (trail) trail.visible = true;
    this.showSubtleNotification("Fresh drag marks. Leading into storage.", 3000);
  }

  triggerJumpscare(type = 'generic', intensity = 0.5) {
    if (this.audio) this.audio.playJumpscareStinger(intensity);
    if (this.player) this.player.addScreenShake(0.25 * intensity, 0.6);
    const overlay = document.getElementById('jumpscare-flash');
    if (overlay) {
      overlay.classList.add('active');
      this.timers.setTimeout(() => overlay.classList.remove('active'), 200 + intensity * 300);
    }
  }

  /**
   * Cancels pending effects and clears every one-time latch so the same
   * scripted beats can fire again on the next run.
   */
  reset() {
    this.timers.clearAll();
    this.triggeredEvents.clear();
    this.activeAmbientEvents.length = 0;
    this.flickerQueue.length = 0;
    this.objectSwapQueue.length = 0;
    this.lastEventTime = 0;
    this.eventCooldown = 0;
    this.whisperTimer = 0;
    for (const evt of this.events.values()) evt.lastTrigger = -999;

    // Put back the scene objects and overlays events can leave switched.
    for (const [name, visible] of [['ballpit_eyes', false], ['blood_trail', false],
                                   ['cursed_portrait_plane', true], ['cursed_portrait_changed', false]]) {
      const obj = this.scene?.getObjectByName(name);
      if (obj) obj.visible = visible;
    }
    for (const id of ['breath-fog', 'cctv-anomaly', 'hallway-silhouette', 'jumpscare-flash']) {
      document.getElementById(id)?.classList.remove('active');
    }
    const note = document.getElementById('ambient-note');
    if (note) note.className = 'ambient-note';
  }
}
