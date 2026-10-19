const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const loader = require('./load-module.cjs');
const { image, fixtures } = require('./color-fixtures.cjs');
const directory = path.resolve(__dirname, '../js/main/colors');

async function setup() {
    const canvases = [];
    const load = loader({ document: { createElement() {
        let image;
        const canvas = { getContext: () => ({ drawImage: img => { image = img; }, getImageData: () => ({ data: image.pixels }) }) };
        canvases.push(canvas);
        return canvas;
    } } });
    return { api: await load(path.join(directory, 'artwork.js')), utils: await load(path.join(directory, 'material-color-utils.js')), canvases };
}

test('PR #60: dominant gradient, muted source and opaque green remain represented', async () => {
    const { api, utils } = await setup();
    for (const i of [0, 7]) {
        const color = utils.Hct.fromInt(api.selectAccentColor(fixtures[i].pixels));
        assert.ok(color.hue > 120 && color.hue < 180);
    }
    const muted = utils.Hct.fromInt(api.selectAccentColor(fixtures[1].pixels));
    assert.ok(muted.chroma >= 5 && muted.chroma < 30);
});

test('PR #60 corpus stays deterministic and neutral images have no forced accent', async () => {
    const { api } = await setup();
    for (const fixture of fixtures) {
        const first = api.selectAccentColor(fixture.pixels);
        for (let i = 0; i < 5; i++) assert.equal(api.selectAccentColor(fixture.pixels), first);
    }
    assert.equal(api.selectAccentColor(fixtures[4].pixels), 0);
    assert.equal(api.selectAccentColor(fixtures[10].pixels), 0);
});

test('minor RGB perturbation preserves the hue family', async () => {
    const { api, utils } = await setup();
    const pixels = Uint8ClampedArray.from(fixtures[0].pixels, (v, i) => i % 4 === 3 ? v : v + 1);
    const first = utils.Hct.fromInt(api.selectAccentColor(fixtures[0].pixels));
    const next = utils.Hct.fromInt(api.selectAccentColor(pixels));
    assert.ok(utils.differenceDegrees(first.hue, next.hue) < 10);
});

test('isolated hues below or at 1% use fallback; just above 1% can qualify', async () => {
    const { api } = await setup();
    for (const count of [99, 100, 101]) {
        const fixture = image('threshold', (x, y) => x + y * 100 < count ? [220, 35, 45, 255] : [128, 128, 128, 255], 100, 100);
        assert.equal(!!api.selectAccentColor(fixture.pixels), count === 101);
    }
});

test('image sampling never exceeds 100px per axis and releases backing stores', async () => {
    const { api, canvases } = await setup();
    for (const [width, height] of [[1, 1000], [1000, 1], [2, 2]]) {
        const fixture = image('dimensions', () => [30, 155, 60, 255], width, height);
        let sampled;
        const original = globalThis.document;
        // Observe the actual arguments rather than the mock's unscaled returned pixels.
        const load = loader({ document: { createElement: () => ({
            getContext: () => ({ drawImage: (...args) => { sampled = args.slice(3); }, getImageData: () => ({ data: fixture.pixels }) }),
        }) } });
        const module = await load(path.join(directory, 'artwork.js'));
        await module.getAccentColorFromImage({ complete: true, naturalWidth: width, naturalHeight: height });
        assert.ok(sampled.every(value => value >= 1 && value <= 100));
        if (width === 2) assert.deepEqual(sampled, [2, 2]);
        assert.equal(globalThis.document, original);
        await api.getAccentColorFromImage({ ...fixture, complete: true, naturalWidth: width, naturalHeight: height });
    }
    assert.ok(canvases.every(c => c.width === 0 && c.height === 0));
});

test('invalid image dimensions fail before allocating a canvas', async () => {
    const { api, canvases } = await setup();
    await assert.rejects(api.getAccentColorFromImage({ complete: true, naturalWidth: 0, naturalHeight: 0 }));
    assert.equal(canvases.length, 0);
});

test('abort settles an image without terminal load events and preserves Steam handlers', async () => {
    const { api } = await setup();
    const img = new EventTarget();
    img.complete = false;
    const handler = () => {};
    img.onload = handler;
    const controller = new AbortController();
    const pending = api.waitForImage(img, controller.signal);
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(img.onload, handler);
});

test('placeholder and absent source do not hide the valid original artwork', async () => {
    let api;
    const original = { src: 'https://art/game.jpg' };
    const load = loader({ document: { querySelectorAll: selector => selector.startsWith('img.') ? [{ src: 'https://art/clear.png?x=1' }, { src: '' }] : [original] } });
    api = await load(path.join(directory, 'artwork.js'));
    assert.equal(api.getArtworkImage(), original);
});
