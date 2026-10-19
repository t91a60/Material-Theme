import {
  Hct,
  SchemeFidelity,
  SchemeTonalSpot,
  SchemeVibrant,
  SchemeExpressive,
  SchemeNeutral,
  SchemeMonochrome
} from './material-color-utils.js';

const schemes = new Map([
  ['fidelity', SchemeFidelity],
  ['tonal-spot', SchemeTonalSpot],
  ['vibrant', SchemeVibrant],
  ['expressive', SchemeExpressive],
  ['neutral', SchemeNeutral],
  ['monochrome', SchemeMonochrome]
]);

const colorRoles = [
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
  'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'error', 'onError', 'errorContainer', 'onErrorContainer',
  'background', 'onBackground',
  'surface', 'onSurface', 'surfaceVariant', 'onSurfaceVariant',
  'surfaceDim', 'surfaceBright',
  'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer', 'surfaceContainerHigh', 'surfaceContainerHighest',
  'outline', 'outlineVariant', 'shadow', 'scrim', 'surfaceTint',
  'inverseSurface', 'inverseOnSurface', 'inversePrimary',
  'primaryFixed', 'primaryFixedDim', 'onPrimaryFixed', 'onPrimaryFixedVariant',
  'secondaryFixed', 'secondaryFixedDim', 'onSecondaryFixed', 'onSecondaryFixedVariant',
  'tertiaryFixed', 'tertiaryFixedDim', 'onTertiaryFixed', 'onTertiaryFixedVariant'
];

const cache = new Map();
const normalize = value => typeof value === 'string' ? value.trim().toLowerCase() : '';

export function parseColor(value) {
  if (typeof value === 'string') {
    value = value.trim();
    if (/^#(?:[\da-f]{3}|[\da-f]{6});?$/i.test(value)) {
      let hex = value.replace(/;$/, '').slice(1);
      if (hex.length === 3) hex = hex.split('').map(digit => digit + digit).join('');
      return (0xff000000 | Number.parseInt(hex, 16)) >>> 0;
    }
    if (!/^-?\d+$/.test(value)) return null;
    value = Number(value);
  }
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff) return null;
  const argb = value >>> 0;
  return (argb >>> 24) === 255 ? argb : null;
}

// Keep this serializer: MCU's hexFromArgb is incompatible with Steam Community.
const argbToHexCustom = argb => '#' + (argb >>> 0).toString(16).padStart(8, '0').substring(2).toLowerCase();

export function paletteCss(color, mode = 'dark', style = 'fidelity') {
  const argb = parseColor(color);
  if (argb === null) return '';
  const schemeMode = normalize(mode) === 'light' ? 'light' : 'dark';
  const requestedStyle = normalize(style);
  const schemeStyle = schemes.has(requestedStyle) ? requestedStyle : 'fidelity';
  const key = `${argb}:${schemeMode}:${schemeStyle}`;
  if (cache.has(key)) return cache.get(key);

  const Scheme = schemes.get(schemeStyle);
  const scheme = new Scheme(Hct.fromInt(argb), schemeMode === 'dark', 0.0);
  const lines = colorRoles.map(role => {
    const name = role.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
    return `  --md-sys-color-${name}: ${argbToHexCustom(scheme[role])};`;
  });
  const css = `:root {\n${lines.join('\n')}\n}`;
  if (cache.size >= 16) cache.delete(cache.keys().next().value);
  cache.set(key, css);
  return css;
}

export function applyPalette(color) {
  const argb = parseColor(color);
  if (argb === null) return false;
  const computedStyle = getComputedStyle(document.documentElement);
  const css = paletteCss(argb,
    computedStyle.getPropertyValue('--scheme'),
    computedStyle.getPropertyValue('--md-color-generation-style'));
  let style = document.getElementById('material-colors');
  if (style?.textContent === css) return false;
  if (!style) {
    style = document.createElement('style');
    style.id = 'material-colors';
    style.textContent = css;
    document.head.appendChild(style);
  } else {
    style.textContent = css;
  }
  return true;
}

export function removePalette() {
  const style = document.getElementById('material-colors');
  if (!style) return false;
  style.remove();
  return true;
}
