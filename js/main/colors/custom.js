import { applyPalette, parseColor } from './palette.js';
import { installColorMode } from './runtime.js';

export function startCustom() {
  function refresh() {
    const color = parseColor(getComputedStyle(document.documentElement).getPropertyValue('--custom-accent-color'));
    if (color) applyPalette(color);
    else document.getElementById('material-colors')?.remove();
  }
  refresh();
  return { refresh };
}

installColorMode('custom', startCustom);
