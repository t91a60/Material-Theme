const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const colorDir = path.resolve(__dirname, '../js/main/colors');

async function loadPalette(globals = {}) {
  const context = vm.createContext(globals);
  const utils = new vm.SourceTextModule(fs.readFileSync(path.join(colorDir, 'material-color-utils.js'), 'utf8'), { context });
  const palette = new vm.SourceTextModule(fs.readFileSync(path.join(colorDir, 'palette.js'), 'utf8'), { context });
  await palette.link(specifier => {
    assert.equal(specifier, './material-color-utils.js');
    return utils;
  });
  await palette.evaluate();
  return { api: palette.namespace, utils: utils.namespace };
}

const roles = `primary onPrimary primaryContainer onPrimaryContainer
secondary onSecondary secondaryContainer onSecondaryContainer
tertiary onTertiary tertiaryContainer onTertiaryContainer
error onError errorContainer onErrorContainer background onBackground
surface onSurface surfaceVariant onSurfaceVariant surfaceDim surfaceBright
surfaceContainerLowest surfaceContainerLow surfaceContainer surfaceContainerHigh surfaceContainerHighest
outline outlineVariant shadow scrim surfaceTint inverseSurface inverseOnSurface inversePrimary
primaryFixed primaryFixedDim onPrimaryFixed onPrimaryFixedVariant
secondaryFixed secondaryFixedDim onSecondaryFixed onSecondaryFixedVariant
tertiaryFixed tertiaryFixedDim onTertiaryFixed onTertiaryFixedVariant`.split(/\s+/);
const kebab = role => role.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
const declarations = css => Object.fromEntries([...css.matchAll(/--md-sys-color-([\w-]+): (#[\da-f]{6});/g)].map(match => [match[1], match[2]]));

test('parseColor accepts exact hex and opaque signed/unsigned storage values', async () => {
  const { api: { parseColor } } = await loadPalette();
  for (const [input, expected] of [
    ['#abc', 0xffaabbcc], [' #AaBbCc; ', 0xffaabbcc], ['#000', 0xff000000],
    ['#ffffff', 0xffffffff], [0xff123456, 0xff123456], ['4279383126', 0xff123456],
    [-15584170, 0xff123456], ['-15584170', 0xff123456], [-1, 0xffffffff],
    [-16777216, 0xff000000], [' 4294967295 ', 0xffffffff]
  ]) assert.equal(parseColor(input), expected, String(input));
});

test('parseColor rejects malformed, partial, transparent and out-of-range values', async () => {
  const { api: { parseColor, paletteCss } } = await loadPalette();
  for (const value of [null, undefined, true, false, {}, [], NaN, Infinity, -Infinity,
    0, '0', 1, 0xfeffffff, -16777217, -2147483649, 4294967296, 4279383126.5,
    '', ' ', '#abcd', '#12345678', '#12', '#ggg', '#123456garbage', '#123456;;',
    '#123456; color:red', '"#abc"', 'rgb(1,2,3)', '4279383126oops', '4279383126.0',
    '4.279383126e9', '+4279383126', '0xff123456', '-1junk', 'NaN']) {
    assert.equal(parseColor(value), null, String(value));
    assert.equal(paletteCss(value), '', String(value));
  }
});

test('defaults are dark fidelity; only explicit light selects light mode', async () => {
  const { api: { paletteCss } } = await loadPalette();
  const expected = paletteCss('#4285f4', 'dark', 'fidelity');
  for (const mode of [undefined, '', 'oled', 'system', 'invalid', null]) {
    assert.equal(paletteCss('#4285f4', mode, 'unknown'), expected);
  }
  assert.equal(paletteCss('#4285f4', ' DARK ', ' FIDELITY '), expected);
  assert.equal(paletteCss('#4285f4', ' LIGHT ', ' VIBRANT '), paletteCss('#4285f4', 'light', 'vibrant'));
  assert.notEqual(paletteCss('#4285f4', 'light'), expected);
});

test('all six bundled schemes emit the complete 49 roles in both modes', async () => {
  const { api: { paletteCss }, utils } = await loadPalette();
  const styles = {
    fidelity: 'SchemeFidelity', 'tonal-spot': 'SchemeTonalSpot', vibrant: 'SchemeVibrant',
    expressive: 'SchemeExpressive', neutral: 'SchemeNeutral', monochrome: 'SchemeMonochrome'
  };
  assert.equal(roles.length, 49);
  for (const [style, name] of Object.entries(styles)) {
    for (const mode of ['light', 'dark']) {
      const css = paletteCss('#4285f4', mode, style);
      const values = declarations(css);
      assert.deepEqual(Object.keys(values), roles.map(kebab));
      const scheme = new utils[name](utils.Hct.fromInt(0xff4285f4), mode === 'dark', 0);
      for (const role of roles) {
        const expected = '#' + (scheme[role] >>> 0).toString(16).padStart(8, '0').slice(2);
        assert.equal(values[kebab(role)], expected, `${style}/${mode}/${role}`);
      }
      assert.ok(!css.includes('!important'));
    }
  }
});

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

test('six text/background pairs retain AA contrast for every scheme and mode', async () => {
  const { api: { paletteCss } } = await loadPalette();
  const pairs = [['primary', 'on-primary'], ['secondary', 'on-secondary'],
    ['tertiary', 'on-tertiary'], ['error', 'on-error'],
    ['background', 'on-background'], ['surface', 'on-surface']];
  for (const style of ['fidelity', 'tonal-spot', 'vibrant', 'expressive', 'neutral', 'monochrome']) {
    for (const mode of ['light', 'dark']) {
      for (const seed of ['#4285f4', '#000000', '#ffffff', '#ff0000', '#00ff00']) {
        const values = declarations(paletteCss(seed, mode, style));
        for (const [background, text] of pairs) {
          const a = luminance(values[background]);
          const b = luminance(values[text]);
          const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          assert.ok(ratio >= 4.5, `${style}/${mode}/${seed}/${text}: ${ratio}`);
        }
      }
    }
  }
});

test('browser application reuses one style, skips equal writes, and reads live settings', async () => {
  const elements = new Map();
  let writes = 0;
  let mode = 'dark';
  let style = 'fidelity';
  const root = {};
  const { api } = await loadPalette({
    document: {
      documentElement: root,
      getElementById: id => elements.get(id),
      head: { appendChild: element => elements.set(element.id, element) },
      createElement: tag => {
        assert.equal(tag, 'style');
        let text = '';
        return {
          get textContent() { return text; },
          set textContent(value) { writes++; text = value; },
          remove() { elements.delete(this.id); }
        };
      }
    },
    getComputedStyle: element => {
      assert.equal(element, root);
      return { getPropertyValue: name => ({ '--scheme': mode, '--md-color-generation-style': style })[name] || '' };
    }
  });
  assert.equal(api.applyPalette('#4285f4'), true);
  const element = elements.get('material-colors');
  assert.equal(api.applyPalette(0xff4285f4), false);
  assert.equal(writes, 1);
  assert.equal(api.applyPalette('invalid'), false);
  assert.equal(writes, 1);
  mode = 'light';
  assert.equal(api.applyPalette('#4285f4'), true);
  style = 'neutral';
  assert.equal(api.applyPalette('#4285f4'), true);
  assert.equal(elements.get('material-colors'), element);
  assert.equal(element.textContent, api.paletteCss('#4285f4', mode, style));
  assert.equal(writes, 3);
  assert.equal(api.removePalette(), true);
  assert.equal(api.removePalette(), false);
  assert.equal(api.applyPalette('#4285f4'), true);
});

test('cache remains bounded and regenerates evicted palettes identically', async () => {
  const { api, utils } = await loadPalette();
  const originalFromInt = utils.Hct.fromInt;
  let computations = 0;
  utils.Hct.fromInt = function (...args) {
    computations++;
    return originalFromInt.apply(this, args);
  };
  const expected = api.paletteCss('#4285f4');
  const initialComputations = computations;
  assert.equal(api.paletteCss(0xff4285f4, 'dark', 'fidelity'), expected);
  assert.equal(computations, initialComputations);
  for (let index = 0; index < 16; index++) api.paletteCss(0xff123400 + index);
  const beforeRegeneration = computations;
  assert.equal(api.paletteCss('#4285f4'), expected);
  assert.ok(computations > beforeRegeneration, 'the seventeenth distinct palette evicts the oldest entry');
});

test('OLED remains an important stylesheet override, not a generated palette mode', async () => {
  const { api } = await loadPalette();
  const oled = fs.readFileSync(path.resolve(__dirname, '../css/main/appearance/oled.css'), 'utf8');
  for (const role of ['surface', 'surface-container']) {
    assert.match(oled, new RegExp(`--md-sys-color-${role}:\\s*#000\\s*!important;`));
  }
  const css = api.paletteCss('#4285f4', 'oled');
  assert.equal(css, api.paletteCss('#4285f4', 'dark'));
  assert.notEqual(declarations(css).surface, '#000000');
  assert.ok(!css.includes('!important'), 'generated declarations cannot defeat the OLED stylesheet');
});
