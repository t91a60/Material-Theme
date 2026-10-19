// Run with: node --experimental-vm-modules --test tests/*.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const colorDir = path.resolve(__dirname, '../js/main/colors');

async function loadTheme({ library = true, mode = 'dark', style = 'fidelity', animations = true, stored, storageUnavailable = false } = {}) {
    const elements = new Map();
    const storage = new Map();
    const timers = new Map();
    const observers = [];
    const windowListeners = new Map();
    const writes = [];
    const canvases = [];
    const settings = { library, mode, style, animations };
    const cleanups = [];
    const controller = new AbortController();
    if (stored !== undefined) storage.set('material-dynamic-color', stored);
    let artworks = [];
    let nextTimer = 0;
    const context = vm.createContext({
        AbortController,
        console: { debug() {}, info() {}, warn() {}, error() {} },
        window: {
            __materialColorRuntime: { register() {} },
            location: { href: 'https://steamloopback.host/library' },
            addEventListener: (name, listener) => windowListeners.set(name, listener),
            removeEventListener: name => windowListeners.delete(name),
        },
        document: {
            documentElement: { classList: { contains: () => settings.library } },
            body: new EventTarget(),
            head: { appendChild: element => elements.set(element.id, element) },
            getElementById: id => elements.get(id),
            querySelector: selector => artworks.find(image => image.matches(selector)) || null,
            querySelectorAll: selector => artworks.filter(image => image.matches(selector)),
            createElement(tag) {
                if (tag === 'canvas') {
                    let image;
                    const canvas = {
                        getContext: () => ({
                            drawImage: (img, ...args) => { image = img; canvas.drawArgs = args; canvas.draws = (canvas.draws || 0) + 1; },
                            getImageData: () => ({ data: [...image.rgb, 255] }),
                        }),
                    };
                    canvases.push(canvas);
                    return canvas;
                }
                return { remove() { elements.delete(this.id); } };
            },
        },
        getComputedStyle: () => ({
            getPropertyValue: name => ({
                '--scheme': settings.mode,
                '--md-color-generation-style': settings.style,
                '--custom-accent-color': '#4cb4ff',
                '--dynamic-color-transition-enabled': String(settings.animations),
            })[name] || '',
        }),
        localStorage: {
            getItem: key => { if (storageUnavailable) throw new Error('Storage disabled'); return storage.get(key) ?? null; },
            setItem: (key, value) => { if (storageUnavailable) throw new Error('Storage disabled'); writes.push([key, value]); storage.set(key, value); },
        },
        setTimeout: (callback, delay) => {
            const id = ++nextTimer;
            timers.set(id, { callback, delay });
            return id;
        },
        clearTimeout: id => timers.delete(id),
        MutationObserver: class {
            constructor(callback) { this.callback = callback; observers.push(this); }
            observe(target, options) { this.target = target; this.options = options; }
            disconnect() { this.disconnected = true; }
        },
    });
    const modules = new Map();
    function moduleFor(filename) {
        if (!modules.has(filename)) modules.set(filename, new vm.SourceTextModule(fs.readFileSync(filename, 'utf8'), { context, identifier: filename }));
        return modules.get(filename);
    }
    const script = moduleFor(path.join(colorDir, 'dynamic.js'));
    await script.link((specifier, parent) => moduleFor(path.resolve(path.dirname(parent.identifier), specifier)));
    await script.evaluate();
    const scope = {
        signal: controller.signal,
        add: cleanup => cleanups.push(cleanup),
        listen(target, type, listener, options) {
            target.addEventListener(type, listener, options);
            cleanups.push(() => target.removeEventListener(type, listener, options));
        },
        observe(target, options, callback) {
            const observer = new context.MutationObserver(callback);
            observer.observe(target, options);
            cleanups.push(() => observer.disconnect());
            return observer;
        },
        dispose() {
            controller.abort();
            for (const cleanup of cleanups.splice(0).reverse()) cleanup();
        },
    };
    const dynamic = script.namespace.startDynamic(scope);
    return {
        storage, elements, observers, writes, canvases, timers, settings,
        dispose: () => scope.dispose(),
        refresh: () => dynamic.refresh(),
        setArtwork: image => { artworks = Array.isArray(image) ? image : [image].filter(Boolean); },
        update: () => dynamic.update(),
        debounce: () => dynamic.schedule(),
        storageEvent: event => windowListeners.get('storage')(event),
        expireTransitions() {
            for (const [id, timer] of timers) {
                if (timer.delay === 250) {
                    timers.delete(id);
                    timer.callback();
                }
            }
        },
        async flushUpdate() {
            for (const [id, timer] of timers) {
                if (timer.delay === 200) {
                    timers.delete(id);
                    await timer.callback();
                    return true;
                }
            }
            return false;
        },
        notify(mutation) {
            const observer = observers[0];
            if (!observer || observer.disconnected) return;
            if (mutation.type !== 'attributes' || (observer.options.attributes
                && observer.options.attributeFilter.includes(mutation.attributeName))) {
                observer.callback([mutation]);
            }
        },
    };
}

function image(src, rgb, complete = true, variant = 'blurred') {
    const target = new EventTarget();
    const selector = variant === 'blurred'
        ? 'img.HNbe3eZf6H7dtJ042x1vM.HSQWw9HUAP6jtA2OZjS-u'
        : '.QlR9EFwTdUNm_J5vx54_Z img.HNbe3eZf6H7dtJ042x1vM';
    const listeners = new Map();
    target.addEventListener = (type, listener) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(listener);
        EventTarget.prototype.addEventListener.call(target, type, listener);
    };
    target.removeEventListener = (type, listener) => {
        listeners.get(type)?.delete(listener);
        EventTarget.prototype.removeEventListener.call(target, type, listener);
    };
    target.listenerCount = type => listeners.get(type)?.size || 0;
    Object.assign(target, {
        src, rgb, complete, naturalWidth: 100, naturalHeight: 50, nodeType: 1,
        matches: query => query.split(', ').includes(selector),
        querySelector: () => null,
    });
    target.finish = (type = 'load') => {
        target.complete = true;
        target.dispatchEvent(new Event(type));
        target[`on${type}`]?.(new Event(type));
    };
    return target;
}

const colorKey = 'material-dynamic-color';

test('unrelated IMG class changes cannot cancel a pending extraction', async () => {
    const theme = await loadTheme();
    const artwork = image('pending.jpg', [0, 255, 0], false);
    theme.setArtwork(artwork);
    const pending = theme.update();
    theme.notify({ type: 'attributes', attributeName: 'class', oldValue: 'avatar', target: { tagName: 'IMG', matches: () => false } });
    assert.equal(artwork.listenerCount('load'), 1);
    assert.equal(await theme.flushUpdate(), false);
    artwork.finish();
    await pending;
    assert.equal(theme.storage.get(colorKey), String(0xff00ff00));
    theme.dispose();
});

test('adding and removing an artwork wrapper class updates selection without child insertion', async () => {
    const theme = await loadTheme();
    const artwork = image('original.jpg', [255, 0, 0], true, 'original');
    let eligible = false;
    const matches = artwork.matches;
    artwork.matches = selector => eligible && matches(selector);
    theme.setArtwork(artwork);
    const wrapper = { matches: selector => eligible && selector === '.QlR9EFwTdUNm_J5vx54_Z' };
    eligible = true;
    theme.notify({ type: 'attributes', attributeName: 'class', oldValue: '', target: wrapper });
    assert.equal(await theme.flushUpdate(), true);
    assert.equal(theme.storage.get(colorKey), String(0xffff0000));
    const palette = theme.elements.get('material-colors').textContent;
    eligible = false;
    theme.notify({ type: 'attributes', attributeName: 'class', oldValue: 'QlR9EFwTdUNm_J5vx54_Z', target: wrapper });
    assert.equal(await theme.flushUpdate(), true);
    assert.equal(theme.elements.get('material-colors').textContent, palette);
    theme.dispose();
});

test('a library refresh republishes valid local artwork after a foreign storage replacement', async () => {
    const theme = await loadTheme();
    theme.setArtwork(image('green.jpg', [0, 255, 0]));
    await theme.update();
    const extractions = theme.canvases.length;
    theme.storage.set(colorKey, String(0xffff0000));
    await theme.refresh();
    assert.equal(theme.storage.get(colorKey), String(0xff00ff00));
    assert.equal(theme.canvases.length, extractions);
    theme.dispose();
});

test('a slow previous game cannot overwrite the current game color', async () => {
    const theme = await loadTheme();
    const previous = image('previous.jpg', [255, 0, 0], false);
    theme.setArtwork(previous);
    const pending = theme.update();
    theme.setArtwork(image('current.jpg', [0, 255, 0]));
    await theme.update();
    const currentCss = theme.elements.get('material-colors').textContent;
    previous.finish();
    await pending;
    assert.equal(theme.storage.get(colorKey), String(0xff00ff00));
    assert.equal(theme.elements.get('material-colors').textContent, currentCss);
});

test('concurrent updates preserve Steam handlers and both settle after loading', async () => {
    const theme = await loadTheme();
    const artwork = image('game.jpg', [255, 0, 0], false);
    let steamLoads = 0;
    const onload = () => steamLoads++;
    artwork.onload = onload;
    theme.setArtwork(artwork);
    const first = theme.update();
    const second = theme.update();
    assert.equal(artwork.onload, onload);
    artwork.finish();
    await Promise.all([first, second]);
    assert.equal(steamLoads, 1);
    assert.equal(artwork.listenerCount('load'), 0);
    assert.equal(artwork.listenerCount('error'), 0);
});

test('failed loading preserves Steam error handlers and removes both listeners', async () => {
    const theme = await loadTheme();
    const artwork = image('failed.jpg', [255, 0, 0], false);
    let steamErrors = 0;
    const onerror = () => steamErrors++;
    artwork.onerror = onerror;
    theme.setArtwork(artwork);
    const pending = theme.update();
    assert.equal(artwork.onerror, onerror);
    artwork.finish('error');
    await pending;
    assert.equal(steamErrors, 1);
    assert.equal(artwork.listenerCount('load'), 0);
    assert.equal(artwork.listenerCount('error'), 0);
    assert.equal(theme.storage.has(colorKey), false);
    assert.match(theme.elements.get('material-colors').textContent, /--md-sys-color-primary: #[0-9a-f]{6};/);
});

test('a stale failed load cannot replace the current palette with a fallback', async () => {
    const theme = await loadTheme();
    const previous = image('failed.jpg', [255, 0, 0], false);
    theme.setArtwork(previous);
    const pending = theme.update();
    theme.setArtwork(image('current.jpg', [0, 255, 0]));
    await theme.update();
    const css = theme.elements.get('material-colors').textContent;
    theme.storage.delete(colorKey);
    previous.finish('error');
    await pending;
    assert.equal(theme.elements.get('material-colors').textContent, css);
    assert.equal(previous.listenerCount('load'), 0);
    assert.equal(previous.listenerCount('error'), 0);
});

test('a source changed during loading is not committed by the old request', async () => {
    const theme = await loadTheme();
    const artwork = image('old.jpg', [255, 0, 0], false);
    theme.setArtwork(artwork);
    const pending = theme.update();
    artwork.src = 'new.jpg';
    artwork.rgb = [0, 255, 0];
    artwork.finish();
    await pending;
    assert.equal(theme.storage.has(colorKey), false);
    await theme.update();
    assert.equal(theme.storage.get(colorKey), String(0xff00ff00));
});

test('a src change on existing artwork schedules a new theme', async () => {
    const theme = await loadTheme();
    const artwork = image('first.jpg', [255, 0, 0]);
    theme.setArtwork(artwork);
    await theme.flushUpdate();
    artwork.src = 'second.jpg';
    artwork.rgb = [0, 255, 0];
    theme.notify({ type: 'attributes', target: artwork, attributeName: 'src' });
    assert.equal(await theme.flushUpdate(), true);
    assert.equal(theme.storage.get(colorKey), String(0xff00ff00));
});

test('adding the original (non-blurred) artwork schedules a new theme', async () => {
    const theme = await loadTheme();
    await theme.flushUpdate();
    const artwork = image('original.jpg', [255, 0, 0], true, 'original');
    theme.setArtwork(artwork);
    theme.notify({ type: 'childList', addedNodes: [artwork] });
    assert.equal(await theme.flushUpdate(), true);
    assert.equal(theme.storage.get(colorKey), String(0xffff0000));
});

test('blurred artwork retains priority over the original artwork', async () => {
    const theme = await loadTheme();
    theme.setArtwork([
        image('original.jpg', [255, 0, 0], true, 'original'),
        image('blurred.jpg', [0, 255, 0]),
    ]);
    await theme.update();
    assert.equal(theme.storage.get(colorKey), String(0xff00ff00));
});

test('unrelated image src mutations do not schedule an update', async () => {
    const theme = await loadTheme();
    await theme.flushUpdate();
    const unrelated = { matches: () => false };
    theme.notify({ type: 'attributes', target: unrelated, attributeName: 'src', addedNodes: [] });
    assert.equal(await theme.flushUpdate(), false);
});

test('artwork nested in an added wrapper schedules an update', async () => {
    const theme = await loadTheme();
    await theme.flushUpdate();
    const artwork = image('nested.jpg', [0, 255, 0], true, 'original');
    theme.setArtwork(artwork);
    const wrapper = { nodeType: 1, matches: () => false, querySelector: selector => artwork.matches(selector) ? artwork : null };
    theme.notify({ type: 'childList', addedNodes: [wrapper] });
    assert.equal(await theme.flushUpdate(), true);
    assert.equal(theme.storage.get(colorKey), String(0xff00ff00));
});

test('cross-window storage updates apply the generated color outside the library', async () => {
    const source = await loadTheme();
    source.setArtwork(image('green.jpg', [0, 255, 0]));
    await source.update();
    const popup = await loadTheme({ library: false });
    popup.storageEvent({ key: colorKey, newValue: source.storage.get(colorKey) });
    assert.equal(popup.elements.get('material-colors').textContent, source.elements.get('material-colors').textContent);
    assert.equal(popup.observers.length, 0);
});

test('animation-disabled mode injects no transitions; enabled transitions expire', async () => {
    const disabled = await loadTheme({ library: false, animations: false });
    assert.equal(disabled.elements.has('material-dynamic-transitions'), false);
    assert.ok(disabled.elements.has('material-colors'));
    const enabled = await loadTheme({ library: false });
    assert.equal(enabled.elements.has('material-dynamic-transitions'), true);
    assert.match(enabled.elements.get('material-dynamic-transitions').textContent, /^body\s*\{/);
    assert.doesNotMatch(enabled.elements.get('material-dynamic-transitions').textContent, /\*|transform|opacity/);
    assert.equal([...enabled.timers.values()].filter(timer => timer.delay === 250).length, 1);
    enabled.expireTransitions();
    assert.equal(enabled.elements.has('material-dynamic-transitions'), false);
});

test('navigation invalidates an image load before the debounce timer fires', async () => {
    const theme = await loadTheme();
    const artwork = image('old.jpg', [255, 0, 0], false);
    theme.setArtwork(artwork);
    const pending = theme.update();
    theme.debounce();
    artwork.finish();
    await pending;
    assert.equal(theme.storage.has(colorKey), false);
    theme.setArtwork(image('new.jpg', [0, 255, 0]));
    await theme.flushUpdate();
    assert.equal(theme.storage.get(colorKey), String(0xff00ff00));
});

test('failed color extraction uses the custom accent without a cache and retains a cached color', async () => {
    const theme = await loadTheme();
    await theme.flushUpdate();
    const accentCss = theme.elements.get('material-colors').textContent;
    theme.setArtwork(image('gray.jpg', [100, 100, 100]));
    await theme.update();
    assert.equal(theme.elements.get('material-colors').textContent, accentCss);
    theme.setArtwork(image('color.jpg', [0, 255, 0]));
    await theme.update();
    const css = theme.elements.get('material-colors').textContent;
    theme.setArtwork(image('gray.jpg', [100, 100, 100]));
    await theme.update();
    assert.equal(theme.elements.get('material-colors').textContent, css);
});

test('all six generation styles produce complete light and dark palettes', async () => {
    for (const mode of ['light', 'dark']) {
        for (const style of ['fidelity', 'tonal-spot', 'vibrant', 'expressive', 'neutral', 'monochrome']) {
            const theme = await loadTheme({ library: false, mode, style });
            const css = theme.elements.get('material-colors').textContent;
            assert.equal((css.match(/--md-sys-color-/g) || []).length, 49, `${mode}/${style}`);
            assert.ok(!css.includes('undefined') && !css.includes('NaN'));
            assert.equal(theme.observers.length, 0);
        }
    }
});

for (const action of ['new request', 'navigation', 'dispose']) {
    test(`${action} immediately removes pending artwork listeners and timeout`, async () => {
        const theme = await loadTheme();
        const artwork = image('pending.jpg', [255, 0, 0], false);
        theme.setArtwork(artwork);
        const pending = theme.update();
        assert.equal(artwork.listenerCount('load'), 1);
        assert.equal(artwork.listenerCount('error'), 1);
        assert.equal([...theme.timers.values()].filter(timer => timer.delay === 10000).length, 1);
        let next;
        if (action === 'new request') {
            theme.setArtwork(image('current.jpg', [0, 255, 0]));
            next = theme.update();
        } else if (action === 'navigation') theme.debounce();
        else theme.dispose();
        assert.equal(artwork.listenerCount('load'), 0);
        assert.equal(artwork.listenerCount('error'), 0);
        assert.equal([...theme.timers.values()].filter(timer => timer.delay === 10000).length, 0);
        await Promise.all([pending, next]);
        if (action !== 'new request') assert.equal(theme.storage.has(colorKey), false);
        if (action === 'dispose') {
            assert.ok(theme.observers.every(observer => observer.disconnected));
            assert.equal(theme.elements.has('material-dynamic-transitions'), false);
            assert.equal(theme.timers.size, 0);
            await theme.update();
            assert.equal(artwork.listenerCount('load'), 0);
        }
    });
}

test('a missing load event times out after ten seconds and removes listeners', async () => {
    const theme = await loadTheme();
    const artwork = image('never.jpg', [255, 0, 0], false);
    theme.setArtwork(artwork);
    const pending = theme.update();
    const [id, timer] = [...theme.timers].find(([, timer]) => timer.delay === 10000);
    theme.timers.delete(id);
    timer.callback();
    await pending;
    assert.equal(artwork.listenerCount('load'), 0);
    assert.equal(artwork.listenerCount('error'), 0);
    assert.equal(theme.storage.has(colorKey), false);
});

test('storage events cannot overwrite either pending or committed local artwork', async () => {
    const theme = await loadTheme();
    const artwork = image('local.jpg', [0, 255, 0], false);
    theme.setArtwork(artwork);
    const pending = theme.update();
    const fallback = theme.elements.get('material-colors').textContent;
    theme.storageEvent({ key: colorKey, newValue: String(0xffff0000) });
    assert.equal(theme.elements.get('material-colors').textContent, fallback);
    assert.equal(artwork.listenerCount('load'), 1);
    artwork.finish();
    await pending;
    const local = theme.elements.get('material-colors').textContent;
    theme.storageEvent({ key: colorKey, newValue: String(0xffff0000) });
    assert.equal(theme.elements.get('material-colors').textContent, local);
    assert.equal(theme.storage.get(colorKey), String(0xff00ff00));
});

test('invalid stored values and invalid storage events never corrupt the fallback', async () => {
    const baseline = await loadTheme({ library: false });
    const fallback = baseline.elements.get('material-colors').textContent;
    for (const stored of ['', 'NaN', 'undefined', '4294967296', '16711680', '#nope', '1.5']) {
        const theme = await loadTheme({ library: false, stored });
        assert.equal(theme.elements.get('material-colors').textContent, fallback, stored);
        theme.storageEvent({ key: colorKey, newValue: stored });
        assert.equal(theme.elements.get('material-colors').textContent, fallback, stored);
        assert.equal(theme.writes.length, 0);
    }
});

test('storage unavailability still permits local extraction and in-memory fallback', async () => {
    const theme = await loadTheme({ storageUnavailable: true });
    theme.setArtwork(image('green.jpg', [0, 255, 0]));
    await theme.update();
    const green = theme.elements.get('material-colors').textContent;
    const reference = await loadTheme();
    reference.setArtwork(image('green.jpg', [0, 255, 0]));
    await reference.update();
    assert.equal(green, reference.elements.get('material-colors').textContent);
    theme.setArtwork(image('gray.jpg', [100, 100, 100]));
    await theme.update();
    assert.equal(theme.elements.get('material-colors').textContent, green);
    assert.equal(theme.writes.length, 0);
});

test('unchanged artwork deduplicates extraction, writes, palette nodes and transitions', async () => {
    const theme = await loadTheme();
    theme.setArtwork(image('green.jpg', [0, 255, 0]));
    await theme.update();
    const node = theme.elements.get('material-colors');
    const timers = [...theme.timers.keys()];
    await theme.update();
    await theme.refresh();
    assert.equal(theme.canvases.length, 1);
    assert.equal(theme.writes.length, 1);
    assert.equal(theme.elements.get('material-colors'), node);
    assert.deepEqual([...theme.timers.keys()], timers);
    theme.settings.mode = 'light';
    const dark = node.textContent;
    await theme.refresh();
    assert.notEqual(node.textContent, dark);
    assert.equal(theme.canvases.length, 1);
    assert.equal(theme.writes.length, 1);
});

test('canvas sampling is bounded and its backing store is released', async () => {
    const theme = await loadTheme();
    const artwork = image('large.jpg', [0, 255, 0]);
    artwork.naturalWidth = 8000;
    artwork.naturalHeight = 4000;
    theme.setArtwork(artwork);
    await theme.update();
    assert.equal(theme.canvases.length, 1);
    assert.equal(theme.canvases[0].width, 0);
    assert.equal(theme.canvases[0].height, 0);
    assert.equal(theme.canvases[0].draws, 1);
    assert.deepEqual(Array.from(theme.canvases[0].drawArgs), [0, 0, 100, 50]);
    assert.equal(theme.storage.get(colorKey), String(0xff00ff00));
});

test('removing artwork cancels its pending request before debounce', async () => {
    const theme = await loadTheme();
    const artwork = image('removed.jpg', [255, 0, 0], false);
    theme.setArtwork(artwork);
    const pending = theme.update();
    theme.setArtwork(null);
    theme.notify({ type: 'childList', addedNodes: [], removedNodes: [artwork] });
    assert.equal(artwork.listenerCount('load'), 0);
    assert.equal(artwork.listenerCount('error'), 0);
    await pending;
    assert.equal(await theme.flushUpdate(), true);
    assert.equal(theme.storage.has(colorKey), false);
});

test('srcset changes invalidate loading artwork and sample the new selected source', async () => {
    const theme = await loadTheme();
    const artwork = image('base.jpg', [255, 0, 0], false);
    artwork.srcset = 'red.jpg 1x';
    theme.setArtwork(artwork);
    const pending = theme.update();
    artwork.srcset = 'green.jpg 2x';
    artwork.currentSrc = 'green.jpg';
    artwork.rgb = [0, 255, 0];
    theme.notify({ type: 'attributes', target: artwork, attributeName: 'srcset' });
    assert.equal(artwork.listenerCount('load'), 0);
    await pending;
    artwork.complete = true;
    assert.equal(await theme.flushUpdate(), true);
    assert.equal(theme.storage.get(colorKey), String(0xff00ff00));
});

test('unrelated child, attribute and storage mutations do not schedule work', async () => {
    const theme = await loadTheme();
    const unrelated = { nodeType: 1, tagName: 'DIV', matches: () => false, querySelector: () => null };
    theme.notify({ type: 'childList', addedNodes: [unrelated], removedNodes: [] });
    theme.notify({ type: 'attributes', target: unrelated, attributeName: 'class' });
    theme.notify({ type: 'attributes', target: unrelated, attributeName: 'style' });
    theme.storageEvent({ key: 'unrelated', newValue: String(0xffff0000) });
    const css = theme.elements.get('material-colors').textContent;
    theme.storageEvent({ key: colorKey, newValue: String(0xffff0000), storageArea: {} });
    assert.equal(await theme.flushUpdate(), false);
    assert.equal(theme.elements.get('material-colors').textContent, css);
    assert.equal(theme.canvases.length, 0);
    assert.equal(theme.writes.length, 0);
});

test('palette generation does not require a RootColors node', async () => {
    const theme = await loadTheme({ library: false });
    assert.equal(theme.elements.has('RootColors'), false);
    assert.match(theme.elements.get('material-colors').textContent, /--md-sys-color-primary: #[0-9a-f]{6};/);
    theme.storageEvent({ key: colorKey, newValue: String(0xff00ff00) });
    assert.equal(theme.elements.has('RootColors'), false);
    assert.equal((theme.elements.get('material-colors').textContent.match(/--md-sys-color-/g) || []).length, 49);
});
