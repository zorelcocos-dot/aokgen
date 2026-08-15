import * as THREE from 'three';

/**
 * TextureLibrary - one place that owns every surface texture in the game.
 *
 * The old build wired materials up ad-hoc: some surfaces used procedural
 * canvases, most were flat `color:` values, and nothing agreed on filtering or
 * colour space. The result was a world of untextured coloured boxes with
 * blurry, washed-out patches where a texture happened to exist.
 *
 * Everything now comes through here, which guarantees:
 *  - NearestFilter + mipmaps: crisp pixel-art texels up close, no shimmer far
 *    away. This is what makes the game read as deliberate pixel art rather
 *    than a low-res blur.
 *  - SRGBColorSpace on albedo only. Normal/roughness are data, not colour;
 *    tagging them sRGB (the old code's default) visibly flattened lighting.
 *  - anisotropy from the renderer, so floors stay legible at grazing angles.
 *  - one shared THREE.Texture per file per repeat, so a hundred meshes that
 *    ask for the same wall cost one upload.
 *
 * Loading is async but non-blocking: a material is created immediately with a
 * flat fallback colour and the map is attached when the PNG lands, so the
 * first frame is never delayed and nothing pops in as "missing".
 */

const TEX_ROOT = '/assets/tex';

/**
 * Every surface in the game keyed by name.
 *  file     - basename in /assets/tex (expects _albedo/_normal/_rough)
 *  fallback - flat colour used until the PNG loads (and if it 404s)
 *  repeat   - texels per world metre, applied per-material by the caller
 *  rough / metal - PBR constants for the surface
 */
export const SURFACES = {
  floorDining:   { file: 'floor_checker',  fallback: 0x4a2420, rough: 0.62, metal: 0.04, scale: 0.55 },
  floorKitchen:  { file: 'floor_kitchen',  fallback: 0x2b2f2c, rough: 0.5,  metal: 0.08, scale: 0.7 },
  floorFreezer:  { file: 'freezer_floor',  fallback: 0x4a5a68, rough: 0.35, metal: 0.25, scale: 0.7 },
  floorOffice:   { file: 'carpet_office',  fallback: 0x3a2a1e, rough: 0.95, metal: 0.0,  scale: 0.8 },
  floorConcrete: { file: 'concrete',       fallback: 0x35353a, rough: 0.9,  metal: 0.02, scale: 0.45 },
  asphalt:       { file: 'asphalt',        fallback: 0x141417, rough: 0.88, metal: 0.02, scale: 0.28 },
  ground:        { file: 'dirt_grass',     fallback: 0x14170f, rough: 1.0,  metal: 0.0,  scale: 0.22 },

  wallDining:    { file: 'wall_dining',    fallback: 0x50201c, rough: 0.82, metal: 0.02, scale: 0.5 },
  wallTile:      { file: 'wall_tile',      fallback: 0x2a3a40, rough: 0.4,  metal: 0.05, scale: 0.6 },
  wallOffice:    { file: 'wall_office',    fallback: 0x9c9280, rough: 0.88, metal: 0.01, scale: 0.45 },
  wallConcrete:  { file: 'concrete',       fallback: 0x3a3a3d, rough: 0.92, metal: 0.02, scale: 0.4 },
  wallBrick:     { file: 'facade_brick',   fallback: 0x3a221c, rough: 0.9,  metal: 0.02, scale: 0.45 },
  metal:         { file: 'metal_panel',    fallback: 0x6b7280, rough: 0.42, metal: 0.78, scale: 0.5 },
  ceiling:       { file: 'ceiling',        fallback: 0x2f2d2a, rough: 0.9,  metal: 0.0,  scale: 0.45 },
  wood:          { file: 'wood_door',      fallback: 0x3d2a18, rough: 0.75, metal: 0.03, scale: 0.9 }
};

export class TextureLibrary {
  constructor(renderer) {
    this.loader = new THREE.TextureLoader();
    this.maxAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;
    /** url -> THREE.Texture (one GPU upload per file, shared by every user) */
    this._textures = new Map();
    /** cache key -> THREE.Material */
    this._materials = new Map();
    this._pending = 0;
    this._onIdle = [];
  }

  /**
   * Loads (or returns the cached) texture for one map of one surface.
   * `isColor` decides the colour space: albedo is sRGB, normal/rough are raw
   * data and must stay linear or the lighting goes flat.
   */
  _texture(file, kind, repeatX, repeatY, isColor) {
    const url = `${TEX_ROOT}/${file}_${kind}.png`;
    const key = `${url}|${repeatX}|${repeatY}`;
    const hit = this._textures.get(key);
    if (hit) return hit;

    this._pending++;
    const tex = this.loader.load(
      url,
      () => { if (--this._pending <= 0) this._flushIdle(); },
      undefined,
      () => { if (--this._pending <= 0) this._flushIdle(); }
    );

    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    // Pixel art: nearest magnification keeps texels hard-edged up close,
    // mipmapped minification kills the crawling aliasing at distance.
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = this.maxAnisotropy;
    if (isColor) tex.colorSpace = THREE.SRGBColorSpace;

    this._textures.set(key, tex);
    return tex;
  }

  _flushIdle() {
    const cbs = this._onIdle.splice(0);
    for (const cb of cbs) { try { cb(); } catch {} }
  }

  /** Runs `cb` once every texture requested so far has finished loading. */
  onReady(cb) {
    if (this._pending <= 0) cb();
    else this._onIdle.push(cb);
  }

  /**
   * The main entry point. Returns a shared MeshStandardMaterial for a named
   * surface, tiled to cover `width` x `height` world metres at the surface's
   * own texel density.
   *
   * Sharing is by (surface, tiling, overrides) so two walls of the same size
   * and material are literally the same object - fewer draw-call state
   * changes and one texture upload.
   */
  get(surfaceName, width = 4, height = 4, overrides = {}) {
    const spec = SURFACES[surfaceName];
    if (!spec) {
      console.warn(`TextureLibrary: unknown surface "${surfaceName}"`);
      return new THREE.MeshStandardMaterial({ color: 0x808080 });
    }

    // Quantise the tiling so near-identical sizes share one material instead
    // of producing dozens of one-off uploads.
    const rx = Math.max(0.25, Math.round(width * spec.scale * 4) / 4);
    const ry = Math.max(0.25, Math.round(height * spec.scale * 4) / 4);

    const ovKey = Object.keys(overrides).length
      ? JSON.stringify(Object.entries(overrides).sort())
      : '';
    const key = `${surfaceName}|${rx}|${ry}|${ovKey}`;
    const hit = this._materials.get(key);
    if (hit) return hit;

    const mat = new THREE.MeshStandardMaterial({
      color: overrides.color ?? 0xffffff,
      roughness: overrides.roughness ?? spec.rough,
      metalness: overrides.metalness ?? spec.metal,
      map: this._texture(spec.file, 'albedo', rx, ry, true),
      normalMap: this._texture(spec.file, 'normal', rx, ry, false),
      roughnessMap: this._texture(spec.file, 'rough', rx, ry, false),
      ...('transparent' in overrides ? { transparent: overrides.transparent } : {}),
      ...('opacity' in overrides ? { opacity: overrides.opacity } : {}),
      ...('emissive' in overrides ? { emissive: overrides.emissive } : {}),
      ...('emissiveIntensity' in overrides ? { emissiveIntensity: overrides.emissiveIntensity } : {}),
      ...('side' in overrides ? { side: overrides.side } : {})
    });
    // Slight relief only - these are 128px textures, a strong normal reads as
    // noise rather than surface detail.
    mat.normalScale = new THREE.Vector2(0.55, 0.55);

    this._materials.set(key, mat);
    return mat;
  }

  /** Flat untextured material, still cached. For pure-colour props. */
  flat(color, roughness = 0.8, metalness = 0.05, extra = {}) {
    const key = `flat|${color}|${roughness}|${metalness}|${JSON.stringify(extra)}`;
    const hit = this._materials.get(key);
    if (hit) return hit;
    const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
    this._materials.set(key, mat);
    return mat;
  }

  dispose() {
    for (const t of this._textures.values()) t.dispose();
    for (const m of this._materials.values()) m.dispose();
    this._textures.clear();
    this._materials.clear();
  }
}
