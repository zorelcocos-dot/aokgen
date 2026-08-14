// Minimal DOM + browser stub so the real game modules can run under Node.
class El {
  constructor(id='', tag='div'){
    this.id=id; this.tagName=tag.toUpperCase(); this.children=[];
    this.style={}; this._cls=new Set(); this.textContent=''; this.innerHTML='';
    this.dataset={}; this.parentNode=null; this._listeners={};
    this.classList={
      add:(...c)=>c.forEach(x=>this._cls.add(x)),
      remove:(...c)=>c.forEach(x=>this._cls.delete(x)),
      toggle:(c,f)=>{ (f??!this._cls.has(c)) ? this._cls.add(c) : this._cls.delete(c); },
      contains:(c)=>this._cls.has(c)
    };
  }
  get className(){ return [...this._cls].join(' '); }
  set className(v){ this._cls=new Set(String(v).split(/\s+/).filter(Boolean)); }
  get offsetWidth(){ return 100; }
  appendChild(c){ this.children.push(c); c.parentNode=this; return c; }
  removeChild(c){ const i=this.children.indexOf(c); if(i>=0) this.children.splice(i,1); c.parentNode=null; return c; }
  remove(){ this.parentNode?.removeChild(this); }
  addEventListener(t,fn){ (this._listeners[t] ||= []).push(fn); }
  removeEventListener(t,fn){ const a=this._listeners[t]; if(!a) return; const i=a.indexOf(fn); if(i>=0) a.splice(i,1); }
  dispatchEvent(e){ (this._listeners[e.type]||[]).slice().forEach(f=>f(e)); return true; }
  listenerCount(t){ return (this._listeners[t]||[]).length; }
  querySelector(){ return null; }
  querySelectorAll(){ return []; }
  getBoundingClientRect(){ return {left:0,top:0,width:100,height:100,right:100,bottom:100}; }
  setAttribute(k,v){ this[k]=v; }
  getAttribute(k){ return this[k]; }
  focus(){}
  getContext(){ return makeCtx(); }
}
function makeCtx(){
  const noop=()=>{};
  const grad={addColorStop:noop};
  return new Proxy({
    canvas:{width:512,height:512},
    createLinearGradient:()=>grad, createRadialGradient:()=>grad, createPattern:()=>null,
    getImageData:(x,y,w=1,h=1)=>({data:new Uint8ClampedArray(Math.max(1,w*h*4)),width:w,height:h}),
    putImageData:noop, createImageData:(w=1,h=1)=>({data:new Uint8ClampedArray(Math.max(1,w*h*4)),width:w,height:h}),
    measureText:()=>({width:10}), drawImage:noop, setTransform:noop, getLineDash:()=>[]
  },{ get:(t,p)=> (p in t? t[p] : noop), set:(t,p,v)=>{t[p]=v; return true;} });
}
const registry=new Map();
const doc=new El('#document','#document');
doc._listeners={};
doc.body=new El('body','body');
doc.documentElement=new El('html','html');
doc.head=new El('head','head');
doc.createElement=(tag)=>{
  const e=new El('',tag);
  if(tag==='canvas'){ e.width=512; e.height=512; e.getContext=()=>makeCtx(); e.toDataURL=()=>'data:,'; }
  return e;
};
doc.createElementNS=(ns,tag)=>doc.createElement(tag);
doc.getElementById=(id)=>{ if(!registry.has(id)) registry.set(id,new El(id)); return registry.get(id); };
doc.querySelector=(s)=>{ const m=/^#([\w-]+)$/.exec(s); return m? doc.getElementById(m[1]) : null; };
doc.querySelectorAll=()=>[];
doc.addEventListener=El.prototype.addEventListener.bind(doc);
doc.removeEventListener=El.prototype.removeEventListener.bind(doc);
doc.dispatchEvent=El.prototype.dispatchEvent.bind(doc);
doc.exitPointerLock=()=>{ doc.pointerLockElement=null; };
doc.pointerLockElement=null;
doc.hidden=false;

class AudioParam{ constructor(v=0){ this.value=v; } setValueAtTime(v){this.value=v; return this;}
  linearRampToValueAtTime(v){this.value=v; return this;} exponentialRampToValueAtTime(v){this.value=v; return this;}
  setTargetAtTime(v){this.value=v; return this;} cancelScheduledValues(){return this;} }
class AudioNode{ constructor(ctx){ this.context=ctx; this._conn=[]; }
  connect(n){ this._conn.push(n); return n; } disconnect(){ this._conn.length=0; } }
class GainNode extends AudioNode{ constructor(c){ super(c); this.gain=new AudioParam(1);} }
class OscNode extends AudioNode{ constructor(c){ super(c); this.frequency=new AudioParam(440); this.detune=new AudioParam(0);
  this.type='sine'; this.started=false; this.stopped=false; }
  start(){ this.started=true; ctxRef.started++; } stop(){ this.stopped=true; ctxRef.stopped++; } }
class SrcNode extends AudioNode{ constructor(c){ super(c); this.buffer=null; this.loop=false;
  this.playbackRate=new AudioParam(1); this.detune=new AudioParam(0); this.started=false; this.stopped=false; }
  start(){ this.started=true; ctxRef.started++; } stop(){ this.stopped=true; ctxRef.stopped++; } }
class BiquadNode extends AudioNode{ constructor(c){ super(c); this.frequency=new AudioParam(350);
  this.Q=new AudioParam(1); this.gain=new AudioParam(0); this.type='lowpass'; } }
let ctxRef=null;
class AudioContextStub{
  constructor(){ this.currentTime=0; this.sampleRate=44100; this.state='running';
    this.destination=new AudioNode(this); this.started=0; this.stopped=0; ctxRef=this; this.listener={
      positionX:new AudioParam(),positionY:new AudioParam(),positionZ:new AudioParam(),
      forwardX:new AudioParam(),forwardY:new AudioParam(),forwardZ:new AudioParam(),
      upX:new AudioParam(),upY:new AudioParam(),upZ:new AudioParam(),setPosition(){},setOrientation(){} }; }
  createGain(){ return new GainNode(this); }
  createOscillator(){ return new OscNode(this); }
  createBufferSource(){ return new SrcNode(this); }
  createBiquadFilter(){ return new BiquadNode(this); }
  createDynamicsCompressor(){ const n=new AudioNode(this);
    for(const k of ['threshold','knee','ratio','attack','release']) n[k]=new AudioParam(0); return n; }
  createStereoPanner(){ const n=new AudioNode(this); n.pan=new AudioParam(0); return n; }
  createPanner(){ const n=new AudioNode(this);
    for(const k of ['positionX','positionY','positionZ','orientationX','orientationY','orientationZ']) n[k]=new AudioParam(0);
    n.setPosition=()=>{}; n.setOrientation=()=>{}; return n; }
  createConvolver(){ const n=new AudioNode(this); n.buffer=null; n.normalize=true; return n; }
  createWaveShaper(){ const n=new AudioNode(this); n.curve=null; n.oversample='none'; return n; }
  createAnalyser(){ const n=new AudioNode(this); n.fftSize=2048; n.frequencyBinCount=1024;
    n.getByteFrequencyData=()=>{}; n.getByteTimeDomainData=()=>{}; return n; }
  createBuffer(ch=1,len=1,sr=44100){ return { numberOfChannels:ch,length:len,sampleRate:sr,duration:len/sr,
    getChannelData:()=>new Float32Array(len) }; }
  decodeAudioData(){ return Promise.resolve(this.createBuffer()); }
  resume(){ this.state='running'; return Promise.resolve(); }
  suspend(){ this.state='suspended'; return Promise.resolve(); }
  close(){ this.state='closed'; return Promise.resolve(); }
}
const win={
  document:doc, innerWidth:1280, innerHeight:720, devicePixelRatio:1,
  AudioContext:AudioContextStub, webkitAudioContext:AudioContextStub,
  requestAnimationFrame:(fn)=>setTimeout(()=>fn(Date.now()),0),
  cancelAnimationFrame:(id)=>clearTimeout(id),
  addEventListener:(t,fn)=>{ (win._l ||= {}); (win._l[t] ||= []).push(fn); },
  removeEventListener:(t,fn)=>{ const a=win._l?.[t]; if(a){const i=a.indexOf(fn); if(i>=0)a.splice(i,1);} },
  dispatchEvent:(e)=>{ (win._l?.[e.type]||[]).slice().forEach(f=>f(e)); return true; },
  getComputedStyle:()=>({ getPropertyValue:()=>'' }),
  matchMedia:()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}}),
  location:{ href:'http://localhost/', reload(){ win.__reloaded=(win.__reloaded||0)+1; } },
  performance:{ now:()=>Date.now() },
  localStorage:{ _d:new Map(), getItem(k){return this._d.get(k)??null;}, setItem(k,v){this._d.set(k,String(v));},
    removeItem(k){this._d.delete(k);}, clear(){this._d.clear();} },
  navigator:{ userAgent:'node', language:'en-US' },
  __reloaded:0
};
win.window=win;
globalThis.window=win; globalThis.document=doc;
globalThis.HTMLElement=El; globalThis.Element=El; globalThis.Node=El;
try{ globalThis.navigator=win.navigator; }catch{ Object.defineProperty(globalThis,'navigator',{value:win.navigator,configurable:true}); }
try{ globalThis.location=win.location; }catch{ Object.defineProperty(globalThis,'location',{value:win.location,configurable:true}); }
try{ globalThis.performance=win.performance; }catch{}
try{ globalThis.localStorage=win.localStorage; }catch{ Object.defineProperty(globalThis,'localStorage',{value:win.localStorage,configurable:true}); }
globalThis.AudioContext=AudioContextStub; globalThis.webkitAudioContext=AudioContextStub;
globalThis.requestAnimationFrame=win.requestAnimationFrame;
globalThis.cancelAnimationFrame=win.cancelAnimationFrame;
globalThis.devicePixelRatio=1;
globalThis.getComputedStyle=win.getComputedStyle;
globalThis.Image=class{ constructor(){ this.width=64; this.height=64;
  setTimeout(()=>this.onload&&this.onload(),0);} set src(v){this._src=v;} get src(){return this._src;} };
globalThis.createImageBitmap=async()=>({width:64,height:64,close(){}});
globalThis.ImageData=class{ constructor(w=1,h=1){ this.width=w; this.height=h;
  this.data=new Uint8ClampedArray(w*h*4);} };
globalThis.OffscreenCanvas=class{ constructor(w,h){this.width=w;this.height=h;}
  getContext(){ return makeCtx(); } };
globalThis.fetch=async()=>({ ok:true, status:200, arrayBuffer:async()=>new ArrayBuffer(8),
  json:async()=>({}), text:async()=>'' });
export { doc as document, win as window, El, registry };
