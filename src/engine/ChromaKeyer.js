import * as THREE from 'three';

/**
 * ChromaKeyer handles advanced removal of pink/magenta (#FF00FF),
 * purple halos, grid borders, and provides centered, transparent
 * textures and frames for Three.js billboard sprites and viewmodels.
 */
export class ChromaKeyer {
  /**
   * Keys out bright pink/magenta (#FF00FF), edge halos, and compression artifacts.
   * @param {HTMLCanvasElement|HTMLImageElement} sourceImage
   * @param {Object} options
   * @returns {HTMLCanvasElement}
   */
  static processChromaKey(sourceImage, options = {}) {
    const tolerance = options.tolerance ?? 85;
    const feather = options.feather ?? 15;

    const canvas = document.createElement('canvas');
    canvas.width = sourceImage.width;
    canvas.height = sourceImage.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(sourceImage, 0, 0);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Distance from pure magenta (255, 0, 255)
      const dist = Math.sqrt(
        Math.pow(r - 255, 2) +
        Math.pow(g - 0, 2) +
        Math.pow(b - 255, 2)
      );

      // Magenta hue detection: High Red + High Blue, Low Green
      const isMagentaHue = (r > 130 && b > 130 && g < 110 && (r + b) > g * 2.8);
      const isPinkEdge = (r > 160 && b > 120 && g < 140 && (r - g > 50));

      if (dist < tolerance || isMagentaHue || isPinkEdge) {
        data[i + 3] = 0; // 100% transparent
      } else if (dist < tolerance + feather) {
        const factor = (dist - tolerance) / feather;
        data[i + 3] = Math.round(data[i + 3] * factor);
      }

      // Edge De-spill: if there is residual magenta tint on boundary pixels, neutralize it
      if (data[i + 3] > 0 && isPinkEdge) {
        data[i + 3] = 0;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  /**
   * Slices a keyed canvas into individual frame canvases with margin insetting
   * to automatically strip black grid lines and frame labels ("1a", "2a").
   * @param {HTMLCanvasElement} keyedCanvas
   * @param {number} cols
   * @param {number} rows
   * @param {number} insetRatio - Inset margin (e.g. 0.04 to cut borders)
   * @returns {HTMLCanvasElement[]}
   */
  static sliceFrames(keyedCanvas, cols, rows, insetRatio = 0.035) {
    const rawFrameW = keyedCanvas.width / cols;
    const rawFrameH = keyedCanvas.height / rows;

    const insetX = Math.round(rawFrameW * insetRatio);
    const insetY = Math.round(rawFrameH * insetRatio);
    const frameW = rawFrameW - insetX * 2;
    const frameH = rawFrameH - insetY * 2;

    const frames = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = frameW;
        frameCanvas.height = frameH;
        const fCtx = frameCanvas.getContext('2d');

        // Draw only the inner content (strips black grid and corner text)
        fCtx.drawImage(
          keyedCanvas,
          c * rawFrameW + insetX, r * rawFrameH + insetY, frameW, frameH,
          0, 0, frameW, frameH
        );

        frames.push(frameCanvas);
      }
    }
    return frames;
  }

  /**
   * Rebuilds a spritesheet from its inner frame content. Generated JPG
   * sheets contain dark guide lines and labels between frames; leaving those
   * pixels in the atlas makes them shimmer around billboard characters.
   */
  static createTrimmedAtlas(keyedCanvas, cols, rows, insetRatio = 0.035) {
    const frames = this.sliceFrames(keyedCanvas, cols, rows, insetRatio);
    if (frames.length === 0) return keyedCanvas;

    const atlas = document.createElement('canvas');
    atlas.width = frames[0].width * cols;
    atlas.height = frames[0].height * rows;
    const ctx = atlas.getContext('2d');

    frames.forEach((frame, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      ctx.drawImage(frame, col * frame.width, row * frame.height);
    });

    return atlas;
  }

  /**
   * Creates a Three.js Texture from a keyed canvas with pixelated retro filtering.
   * @param {HTMLCanvasElement} keyedCanvas
   * @param {number} cols - Number of frame columns
   * @param {number} rows - Number of frame rows
   * @returns {THREE.CanvasTexture}
   */
  static createKeyedTexture(keyedCanvas, cols = 1, rows = 1) {
    const texture = new THREE.CanvasTexture(keyedCanvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    // Clamp each selected frame at its edges so filtering can never sample
    // the neighbouring frame or the original sheet border.
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(1 / cols, 1 / rows);
    return texture;
  }

  /**
   * Loads an image from a URL and keys out the magenta/pink background.
   * @param {string} url
   * @param {Object} options
   * @returns {Promise<HTMLCanvasElement|null>}
   */
  static async loadAndKeyImage(url, options = {}) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const keyedCanvas = this.processChromaKey(img, options);
        resolve(keyedCanvas);
      };
      img.onerror = () => {
        console.warn('Failed to load image from ' + url);
        resolve(null);
      };
      img.src = url;
    });
  }
}
