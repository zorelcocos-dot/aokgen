/**
 * AudioManager - Organized horror audio system with categories,
 * spatial awareness, layered ambience, and procedural synthesis.
 * No external files required - uses Web Audio API.
 */

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.initialized = false;
    this.masterGain = null;
    this.ambientGain = null;
    this.sfxGain = null;
    this.musicGain = null;

    this.ambientNodes = [];
    this.activeAmbience = 'outdoor'; // outdoor, indoor, freezer, basement, office
    this.footstepMaterial = 'tile';

    this.lastFootstep = 0;
    this.isMuted = false;
  }

  init() {
    if (this.initialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.initialized = true;
      this.setupGains();
      this.startBaseAmbience();
      console.log('[Audio] Initialized with organized categories');
    } catch (e) {
      console.warn('AudioContext failed', e);
    }
  }

  setupGains() {
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.92, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.setValueAtTime(0.32, this.ctx.currentTime);
    this.ambientGain.connect(this.masterGain);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
    this.sfxGain.connect(this.masterGain);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    this.musicGain.connect(this.masterGain);

    this.fryerGain = this.ctx.createGain();
    this.fryerGain.gain.setValueAtTime(0.0, this.ctx.currentTime);
    this.fryerGain.connect(this.ambientGain);

    this.windGain = this.ctx.createGain();
    this.windGain.gain.setValueAtTime(0.22, this.ctx.currentTime);
    this.windGain.connect(this.ambientGain);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // ---- AMBIENCE LAYERS ----
  startBaseAmbience() {
    if (!this.ctx) return;
    // Low drone
    this.startDrone(36.7, 'sawtooth', 0.09);
    this.startDrone(55, 'triangle', 0.05);
    this.startFluorescentHum();
    this.startWhiteNoiseLayer(this.windGain, 180, 0.08, 'wind');
    this.startFryerSizzle();
  }

  startDrone(freq, type, volume) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(120, this.ctx.currentTime);
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambientGain);
    osc.start();
    this.ambientNodes.push({ osc, gain, type: 'drone' });
  }

  startFluorescentHum() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const harm = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(60, this.ctx.currentTime);
    harm.type = 'sawtooth';
    harm.frequency.setValueAtTime(120, this.ctx.currentTime);
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(180, this.ctx.currentTime);
    filter.Q.setValueAtTime(3, this.ctx.currentTime);
    const humGain = this.ctx.createGain();
    humGain.gain.setValueAtTime(0.0, this.ctx.currentTime); // will be controlled by zone
    osc.connect(humGain);
    harm.connect(filter);
    filter.connect(humGain);
    humGain.connect(this.ambientGain);
    osc.start(); harm.start();
    this.humGain = humGain;
    this.ambientNodes.push({ osc, type: 'hum' });
  }

  startWhiteNoiseLayer(gainNode, centerFreq, vol, name) {
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer; src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = name === 'wind' ? 'lowpass' : 'bandpass';
    filter.frequency.setValueAtTime(centerFreq, this.ctx.currentTime);
    if (name !== 'wind') filter.Q.setValueAtTime(1.2, this.ctx.currentTime);
    src.connect(filter);
    filter.connect(gainNode);
    gainNode.gain.setValueAtTime(vol, this.ctx.currentTime);
    src.start();
  }

  startFryerSizzle() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer; noise.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2400, this.ctx.currentTime);
    filter.Q.setValueAtTime(1.5, this.ctx.currentTime);
    noise.connect(filter);
    filter.connect(this.fryerGain);
    noise.start();
  }

  setAmbienceZone(zone) {
    if (!this.ctx || !this.ambientGain) return;
    if (this.activeAmbience === zone) return;
    this.activeAmbience = zone;
    const now = this.ctx.currentTime;
    // Crossfade ambience
    switch (zone) {
      case 'outdoor':
        this.windGain?.gain.linearRampToValueAtTime(0.22, now + 0.8);
        this.fryerGain?.gain.linearRampToValueAtTime(0.0, now + 0.8);
        this.humGain?.gain.linearRampToValueAtTime(0.0, now + 0.8);
        this.ambientGain?.gain.linearRampToValueAtTime(0.32, now + 0.8);
        break;
      case 'dining':
        this.windGain?.gain.linearRampToValueAtTime(0.02, now + 1);
        this.fryerGain?.gain.linearRampToValueAtTime(0.02, now + 1);
        this.humGain?.gain.linearRampToValueAtTime(0.1, now + 1);
        this.ambientGain?.gain.linearRampToValueAtTime(0.24, now + 1);
        break;
      case 'kitchen':
        this.windGain?.gain.linearRampToValueAtTime(0.01, now + 0.8);
        this.fryerGain?.gain.linearRampToValueAtTime(0.12, now + 0.8);
        this.humGain?.gain.linearRampToValueAtTime(0.14, now + 0.8);
        this.ambientGain?.gain.linearRampToValueAtTime(0.3, now + 0.8);
        break;
      case 'freezer':
        this.windGain?.gain.linearRampToValueAtTime(0.04, now + 1);
        this.fryerGain?.gain.linearRampToValueAtTime(0.0, now + 1);
        this.humGain?.gain.linearRampToValueAtTime(0.04, now + 1);
        this.ambientGain?.gain.linearRampToValueAtTime(0.18, now + 1);
        break;
      case 'office':
        this.windGain?.gain.linearRampToValueAtTime(0.0, now + 1);
        this.fryerGain?.gain.linearRampToValueAtTime(0.0, now + 1);
        this.humGain?.gain.linearRampToValueAtTime(0.18, now + 1);
        this.ambientGain?.gain.linearRampToValueAtTime(0.22, now + 1);
        break;
      case 'basement':
        this.windGain?.gain.linearRampToValueAtTime(0.05, now + 1);
        this.fryerGain?.gain.linearRampToValueAtTime(0.0, now + 1);
        this.humGain?.gain.linearRampToValueAtTime(0.06, now + 1);
        this.ambientGain?.gain.linearRampToValueAtTime(0.38, now + 1);
        break;
    }
  }

  // ---- CORE SFX (Procedural) ----
  _tone(freq, type, vol, attack, decay, targetGain = this.sfxGain) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + decay);
    osc.connect(gain);
    gain.connect(targetGain);
    osc.start(now);
    osc.stop(now + decay + 0.05);
  }

  playFootstep(vol = 0.24, surface = this.footstepMaterial) {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    if (now - this.lastFootstep < 0.18) return;
    this.lastFootstep = now;
    // Different surfaces
    let freq = 90;
    if (surface === 'metal') freq = 160;
    if (surface === 'carpet') freq = 55;
    if (surface === 'concrete') freq = 75;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq + Math.random() * 20, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.35, now + 0.12);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  playFootstepBehind(vol = 0.3) {
    // Slightly delayed, lower
    setTimeout(() => this.playFootstep(vol * 0.8, 'concrete'), 80);
    setTimeout(() => this.playFootstep(vol * 0.6, 'concrete'), 420);
  }

  playHeartbeat(intensity = 1) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const createThud = (delay, freq) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + delay);
      osc.frequency.exponentialRampToValueAtTime(22, now + delay + 0.12);
      gain.gain.setValueAtTime(0.55 * intensity, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.12);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + delay);
      osc.stop(now + delay + 0.13);
    };
    createThud(0, 68);
    createThud(0.16, 52);
  }

  // Doors
  playDoorOpen(pos, vol = 0.55) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.linearRampToValueAtTime(160, now + 0.35);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.42);
    // Hinge creak layered
    setTimeout(() => this.playDoorCreak(vol * 0.6), 80);
  }

  playDoorClose(pos, vol = 0.5) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Thud
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.18);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  playDoorCreak(vol = 0.4) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(650, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.55);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.6);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, now);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.62);
  }

  playDoorLocked(pos, vol = 0.45) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(180, now + i * 0.12);
      gain.gain.setValueAtTime(vol, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.08);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.09);
    }
  }

  playDoorSlam(vol = 0.75) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(18, now + 0.45);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, now);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.55);
  }

  playDoorStress(vol = 0.18) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.linearRampToValueAtTime(88, now + 0.6);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.7);
  }

  // Flashlight
  playFlashlightClick(vol = 0.4) {
    this._tone(1300, 'triangle', vol, 0, 0.06);
  }

  playMopSlosh(vol = 0.32) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.linearRampToValueAtTime(110, now + 0.3);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.34);
  }

  // Monsters
  playMonsterScreech(vol = 0.45) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(820, now);
    osc.frequency.exponentialRampToValueAtTime(280, now + 0.85);
    mod.type = 'square';
    mod.frequency.setValueAtTime(42, now);
    modGain.gain.setValueAtTime(380, now);
    mod.connect(modGain);
    modGain.connect(osc.frequency);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now); mod.start(now);
    osc.stop(now + 0.95); mod.stop(now + 0.95);
  }

  playJumpscareStinger(intensity = 0.65) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const high1 = this.ctx.createOscillator();
    const high2 = this.ctx.createOscillator();
    const highGain = this.ctx.createGain();
    high1.type = 'sawtooth';
    high1.frequency.setValueAtTime(1750, now);
    high2.type = 'sawtooth';
    high2.frequency.setValueAtTime(1880, now);
    highGain.gain.setValueAtTime(intensity * 0.7, now);
    highGain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
    high1.connect(highGain);
    high2.connect(highGain);
    highGain.connect(this.sfxGain);
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(135, now);
    sub.frequency.exponentialRampToValueAtTime(22, now + 0.85);
    subGain.gain.setValueAtTime(intensity, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    sub.connect(subGain);
    subGain.connect(this.sfxGain);
    high1.start(now); high2.start(now); sub.start(now);
    high1.stop(now + 1.2); high2.stop(now + 1.2); sub.stop(now + 1.0);
  }

  playRadioStatic(vol = 0.4) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 0.5;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(Math.random(), 2);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.Q.setValueAtTime(1.8, now);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start(now);
  }

  playWhisper(vol = 0.18) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Breath-like filtered noise
    const bufferSize = this.ctx.sampleRate * 1.2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(900 + Math.random() * 600, now);
    filter.Q.setValueAtTime(0.8, now);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.3);
    gain.gain.linearRampToValueAtTime(0, now + 1.1);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start(now);
  }

  playCCTVGlitch(vol = 0.35) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(60, now);
    osc.frequency.linearRampToValueAtTime(400, now + 0.15);
    osc.frequency.linearRampToValueAtTime(60, now + 0.32);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.36);
  }

  // Success / progression
  playAccessGranted(vol = 0.35) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1480, now + 0.08);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.34);
  }

  playBreakerRestore(vol = 0.5) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(55, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.45);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.7);
  }

  playTimecardPunch(vol = 0.4) {
    this._tone(1350, 'sine', vol, 0, 0.4);
  }

  playPlayerHurt(vol = 0.5) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.28);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.32);
  }

  playMonsterBite(vol = 0.38) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.16);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  playMonsterHit(vol = 0.42) {
    this._tone(300, 'sawtooth', vol, 0, 0.22);
  }

  playSodaDrink(vol = 0.32) {
    this._tone(700, 'sine', vol, 0, 0.25);
  }

  playBatteryRecharge(vol = 0.35) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(840, now + 0.38);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.44);
  }

  playHotOilSplash(vol = 0.48) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1100, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.52);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.58);
  }

  playPaperRead(vol = 0.28) {
    this._tone(800, 'triangle', vol, 0, 0.12);
  }

  // Generator hum toggle
  setGeneratorHum(on) {
    if (!this.ctx) return;
    if (on) {
      if (this.generatorOsc) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(52, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(220, this.ctx.currentTime);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ambientGain);
      osc.start();
      this.generatorOsc = osc;
      this.generatorGain = gain;
    } else {
      if (this.generatorOsc) {
        try { this.generatorOsc.stop(); } catch {}
        this.generatorOsc = null;
        this.generatorGain = null;
      }
    }
  }
}
