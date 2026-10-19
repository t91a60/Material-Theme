import { applyPalette, parseColor } from './palette.js';
import { installColorMode } from './runtime.js';
import { artworkSelector, getArtworkImage, getAccentColorFromImage, imageSignature, imageSource } from './artwork.js';

const colorKey = 'material-dynamic-color';

function readStoredColor() {
  try { return parseColor(localStorage.getItem(colorKey)); }
  catch { return null; }
}

export function startDynamic(scope) {
  const colors = new Map();
  let lastColor = readStoredColor();
  let revision = 0;
  let pending;
  let updateTimeout;
  let transitionTimeout;
  let artworkObserver;
  let observingImages = false;
  let selectedImage = null;

  const isLibrary = () => document.documentElement.classList.contains('Rp8QOGJ2DypeDniMnRBhr');
  const artwork = () => isLibrary() ? getArtworkImage() : null;

  function clearTransitions() {
    clearTimeout(transitionTimeout);
    document.getElementById('material-dynamic-transitions')?.remove();
  }

  function apply(color) {
    if (!color || scope.signal.aborted) return;
    const enabled = getComputedStyle(document.documentElement).getPropertyValue('--dynamic-color-transition-enabled').trim() === 'true'
      && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!enabled) clearTransitions();
    // A duplicate palette does not restart transitions or touch the DOM.
    if (!applyPalette(color) || !enabled) return;
    let style = document.getElementById('material-dynamic-transitions');
    if (!style) {
      style = document.createElement('style');
      style.id = 'material-dynamic-transitions';
      // Animate only the document surface, not every Steam component's transitions.
      style.textContent = 'body { transition: background-color .2s, color .2s; }';
      document.head.appendChild(style);
    }
    clearTimeout(transitionTimeout);
    transitionTimeout = setTimeout(clearTransitions, 250);
  }

  function fallback() {
    const custom = getComputedStyle(document.documentElement).getPropertyValue('--custom-accent-color');
    apply(lastColor || readStoredColor() || parseColor(custom));
  }

  function invalidate() {
    ++revision;
    pending?.abort();
    pending = null;
    clearTimeout(updateTimeout);
  }

  async function update() {
    invalidate();
    if (scope.signal.aborted) return;
    const request = revision;
    const img = artwork();
    selectedImage = img;
    if (!img) { fallback(); return; }
    const signature = imageSignature(img);
    const controller = new AbortController();
    pending = controller;
    const current = () => !scope.signal.aborted && request === revision && img === artwork() && signature === imageSignature(img);
    try {
      const cached = img.complete && img.naturalWidth && colors.get(imageSource(img));
      const color = cached || await getAccentColorFromImage(img, controller.signal);
      if (!current()) return;
      const source = imageSource(img);
      colors.delete(source);
      colors.set(source, color);
      if (colors.size > 16) colors.delete(colors.keys().next().value);
      lastColor = color;
      // Only successful library extraction publishes. Passive windows cannot overwrite it.
      try {
        if (localStorage.getItem(colorKey) !== String(color)) localStorage.setItem(colorKey, String(color));
      } catch { /* Keep the in-memory color when storage is unavailable. */ }
      apply(color);
    } catch (error) {
      if (error.name !== 'AbortError' && current()) fallback();
    } finally {
      if (pending === controller) pending = null;
    }
  }

  function schedule() {
    invalidate();
    if (!scope.signal.aborted) updateTimeout = setTimeout(update, 200);
  }

  function containsArtwork(node) {
    return node.nodeType === 1 && (node.matches?.(artworkSelector) || node.querySelector?.(artworkSelector));
  }

  function refresh() {
    if (isLibrary() && !artworkObserver) {
      artworkObserver = scope.observe(document.body, { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['src', 'srcset', 'sizes', 'class'] }, mutations => {
        for (const mutation of mutations) {
          if (mutation.type === 'attributes') {
            if (mutation.attributeName === 'class') {
              const oldClasses = (mutation.oldValue || '').split(/\s+/);
              const relevant = mutation.target === selectedImage || mutation.target.matches?.(artworkSelector)
                || mutation.target.matches?.('.QlR9EFwTdUNm_J5vx54_Z')
                || oldClasses.includes('QlR9EFwTdUNm_J5vx54_Z') || oldClasses.includes('HNbe3eZf6H7dtJ042x1vM');
              if (relevant && artwork() !== selectedImage) { schedule(); return; }
            } else if (mutation.target.matches(artworkSelector)) {
              schedule();
              return;
            }
          }
          if ([...mutation.addedNodes || [], ...mutation.removedNodes || []].some(containsArtwork)) {
            schedule();
            return;
          }
        }
      });
      if (!observingImages) {
        const imageSettled = event => { if (event.target.matches?.(artworkSelector)) schedule(); };
        scope.listen(document.body, 'load', imageSettled, true);
        scope.listen(document.body, 'error', imageSettled, true);
        observingImages = true;
      }
    }
    // Settings changes must not redo an unchanged extraction. update() uses the bounded URL cache.
    return update();
  }

  scope.listen(window, 'storage', event => {
    if (event.key !== colorKey && event.key !== null) return;
    try { if (event.storageArea && event.storageArea !== localStorage) return; }
    catch { return; }
    if (artwork()) return;
    const color = event.newValue === null ? null : parseColor(event.newValue);
    if (event.newValue !== null && !color) return;
    invalidate();
    lastColor = color;
    if (color) apply(color);
    else apply(parseColor(getComputedStyle(document.documentElement).getPropertyValue('--custom-accent-color')));
  });
  scope.add(() => { invalidate(); clearTransitions(); colors.clear(); });
  refresh();
  return { refresh, update, schedule };
}

installColorMode('dynamic', startDynamic);
