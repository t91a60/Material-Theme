import { argbFromRgb, Score } from './material-color-utils.js';

export const blurredArtworkSelector = 'img.HNbe3eZf6H7dtJ042x1vM.HSQWw9HUAP6jtA2OZjS-u';
export const originalArtworkSelector = '.QlR9EFwTdUNm_J5vx54_Z img.HNbe3eZf6H7dtJ042x1vM';
export const artworkSelector = `${blurredArtworkSelector}, ${originalArtworkSelector}`;
export const imageSignature = img => `${img.src}\n${img.srcset || ''}\n${img.sizes || ''}`;
export const imageSource = img => img.currentSrc || img.src;

export function getArtworkImage() {
  // Preserve Steam's existing priority, but do not let a placeholder hide valid artwork.
  for (const selector of [blurredArtworkSelector, originalArtworkSelector]) {
    const images = document.querySelectorAll(selector);
    for (const img of images) {
      if (img.complete && (!img.naturalWidth || !img.naturalHeight)) continue;
      if (img.src && !/(?:^|\/)clear\.png(?:[?#]|$)/i.test(img.src)) return img;
    }
  }
  return null;
}

// Adapted from PR #60, commit 2e36eff: population grouping and bundled Material scoring.
export function selectAccentColor(data) {
  const histogram = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] !== 255) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4);
    let bucket = histogram.get(key);
    if (!bucket) {
      bucket = { red: 0, green: 0, blue: 0, count: 0 };
      histogram.set(key, bucket);
    }
    bucket.red += r;
    bucket.green += g;
    bucket.blue += b;
    bucket.count++;
  }
  if (!histogram.size) return 0;
  const colors = new Map();
  for (const { red, green, blue, count } of histogram.values()) {
    colors.set(argbFromRgb(Math.round(red / count), Math.round(green / count), Math.round(blue / count)), count);
  }
  return Score.score(colors, { desired: 1, fallbackColorARGB: 0 })[0];
}

function aborted() {
  const error = new Error('Artwork request cancelled');
  error.name = 'AbortError';
  return error;
}

export function waitForImage(img, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(aborted());
    if (img.complete) return img.naturalWidth && img.naturalHeight ? resolve() : reject(new Error('Image dimensions error'));
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      img.removeEventListener('load', onLoad);
      img.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = error => { cleanup(); error ? reject(error) : resolve(); };
    const onLoad = () => finish(img.naturalWidth && img.naturalHeight ? null : new Error('Image dimensions error'));
    const onError = () => finish(new Error('Artwork failed to load'));
    const onAbort = () => finish(aborted());
    img.addEventListener('load', onLoad);
    img.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort, { once: true });
    // A missing terminal image event must not retain listeners indefinitely.
    timer = setTimeout(() => finish(new Error('Artwork load timed out')), 10000);
  });
}

export async function getAccentColorFromImage(img, signal) {
  await waitForImage(img, signal);
  if (signal?.aborted) throw aborted();
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 100 / img.naturalWidth, 100 / img.naturalHeight);
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const color = selectAccentColor(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
    if (!color) throw new Error('No suitable color found in image');
    return color;
  } finally {
    // Release the pixel backing store, including on tainted-canvas failures.
    canvas.width = canvas.height = 0;
  }
}
