// Run with: node --experimental-vm-modules --test tests/*.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

async function loadRuntime() {
    const elements = new Map();
    const listeners = new Map();
    const observers = [];
    const microtasks = [];
    const timers = new Map();
    let timerId = 0;
    const settings = { marker: 'dynamic', accent: '#4cb4ff', scheme: 'dark' };
    const root = { classList: { contains: () => false } };
    const head = { appendChild(node) { node.parentNode = head; elements.set(node.id, node); } };
    const window = {
        addEventListener(type, listener) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(listener);
        },
        removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    };
    const context = vm.createContext({
        AbortController,
        console,
        window,
        document: {
            addEventListener: (...args) => window.addEventListener(...args),
            removeEventListener: (...args) => window.removeEventListener(...args),
            head, documentElement: root, body: {},
            getElementById: id => elements.get(id),
            querySelectorAll: () => [],
            createElement: () => ({ remove() { elements.delete(this.id); } }),
        },
        localStorage: { getItem: () => null, setItem() { assert.fail('Passive mode must not publish'); } },
        getComputedStyle: () => ({ getPropertyValue: name => ({
            '--material-color-mode': settings.marker,
            '--custom-accent-color': settings.accent,
            '--scheme': settings.scheme,
            '--md-color-generation-style': 'fidelity',
            '--dynamic-color-transition-enabled': 'true',
        })[name] || '' }),
        setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
        clearTimeout: id => timers.delete(id),
        queueMicrotask: callback => microtasks.push(callback),
        MutationObserver: class {
            constructor(callback) { this.callback = callback; observers.push(this); }
            observe(target, options) { this.target = target; this.options = options; }
            disconnect() { this.disconnected = true; }
        },
    });
    const modules = new Map();
    const directory = path.resolve(__dirname, '../js/main/colors');
    function moduleFor(filename) {
        if (!modules.has(filename)) modules.set(filename, new vm.SourceTextModule(fs.readFileSync(filename, 'utf8'), { context, identifier: filename }));
        return modules.get(filename);
    }
    async function load(name, reinject = false) {
        const filename = path.join(directory, name);
        if (reinject) modules.delete(filename);
        const module = moduleFor(filename);
        if (module.status === 'unlinked') await module.link((specifier, parent) => moduleFor(path.resolve(path.dirname(parent.identifier), specifier)));
        if (module.status === 'linked') await module.evaluate();
        return module.namespace;
    }
    const runtime = await load('runtime.js');
    return {
        ...runtime, load, settings, elements, observers, timers, window, listeners,
        activeObservers: () => observers.filter(observer => !observer.disconnected),
        dispatch(type, event = {}) { for (const listener of [...listeners.get(type) || []]) listener(event); },
        flush() { while (microtasks.length) microtasks.shift()(); },
        mutateRoot() {
            for (const observer of observers.filter(observer => !observer.disconnected && observer.target === root)) {
                observer.callback([{ type: 'attributes', target: root, attributeName: 'style' }]);
            }
        },
        mutateHead(mutation) {
            for (const observer of observers.filter(observer => !observer.disconnected && observer.target === head)) observer.callback([mutation]);
        },
    };
}

test('CSS marker changes stop dynamic transitions and switch to custom, static and matugen modes', async () => {
    const env = await loadRuntime();
    await env.load('dynamic.js');
    await env.load('custom.js');
    assert.ok(env.elements.has('material-colors'));
    assert.ok(env.elements.has('material-dynamic-transitions'));
    assert.equal(env.listeners.get('storage').size, 1);
    env.settings.marker = 'custom';
    env.settings.accent = '#ff0000';
    const previous = env.elements.get('material-colors').textContent;
    env.mutateRoot();
    env.flush();
    assert.notEqual(env.elements.get('material-colors').textContent, previous);
    assert.equal(env.elements.has('material-dynamic-transitions'), false);
    assert.equal(env.listeners.get('storage').size, 0);
    assert.equal(env.timers.size, 0);
    for (const marker of ['static', 'matugen']) {
        env.settings.marker = marker;
        env.mutateRoot();
        env.flush();
        assert.equal(env.elements.has('material-colors'), false, marker);
        assert.equal(env.elements.has('material-dynamic-transitions'), false, marker);
    }
    env.settings.marker = 'dynamic';
    env.mutateRoot();
    env.flush();
    assert.ok(env.elements.has('material-colors'));
    assert.equal(env.listeners.get('storage').size, 1);
    env.dispatch('pagehide');
});

test('popup settings are watched by runtime without an artwork observer', async () => {
    const env = await loadRuntime();
    await env.load('dynamic.js');
    assert.equal(env.activeObservers().length, 2);
    const dark = env.elements.get('material-colors').textContent;
    env.settings.scheme = 'light';
    env.mutateRoot();
    env.flush();
    assert.notEqual(env.elements.get('material-colors').textContent, dark);
    assert.equal(env.activeObservers().length, 2);
    env.dispatch('pagehide');
});

test('reinjected scripts reuse the singleton and dispose the previous mode scope', async () => {
    const env = await loadRuntime();
    await env.load('dynamic.js');
    const singleton = env.window.__materialColorRuntime;
    const previousStorageListener = [...env.listeners.get('storage')][0];
    await env.load('dynamic.js', true);
    assert.equal(env.window.__materialColorRuntime, singleton);
    assert.equal(env.listeners.get('storage').size, 1);
    assert.equal(env.listeners.get('storage').has(previousStorageListener), false);
    assert.equal(env.activeObservers().length, 2);
    assert.equal(env.timers.size, 1);
    env.dispatch('pagehide');
});

test('pagehide removes generated styles, timers, listeners, observers and singleton', async () => {
    const env = await loadRuntime();
    await env.load('dynamic.js');
    env.mutateRoot();
    env.dispatch('pagehide');
    env.flush();
    assert.equal(env.elements.has('material-colors'), false);
    assert.equal(env.elements.has('material-dynamic-transitions'), false);
    assert.equal(env.timers.size, 0);
    assert.equal(env.activeObservers().length, 0);
    assert.ok([...env.listeners.values()].every(set => set.size === 0));
    assert.equal(env.window.__materialColorRuntime, undefined);
    await env.load('dynamic.js', true);
    assert.equal(env.activeObservers().length, 2);
    assert.equal(env.listeners.get('storage').size, 1);
    assert.ok(env.elements.has('material-colors'));
    env.dispatch('pagehide');
});

test('generated style mutations are ignored while external stylesheet changes coalesce', async () => {
    const env = await loadRuntime();
    let refreshes = 0;
    env.installColorMode('dynamic', () => ({ refresh() { refreshes++; } }));
    for (const id of ['material-colors', 'material-dynamic-transitions', 'material-matugen-colors']) {
        env.mutateHead({ type: 'characterData', target: { nodeType: 3, parentNode: { id } } });
        env.mutateHead({ type: 'childList', target: {}, addedNodes: [{ id }], removedNodes: [] });
    }
    env.flush();
    assert.equal(refreshes, 0);
    env.mutateHead({ type: 'attributes', target: { tagName: 'LINK' } });
    env.mutateRoot();
    env.dispatch('load', { target: { tagName: 'LINK' } });
    env.flush();
    assert.equal(refreshes, 1);
    env.dispatch('pagehide');
});

test('scope disposal aborts once and removes registered resources in reverse order', async () => {
    const env = await loadRuntime();
    const scope = env.createScope();
    const calls = [];
    scope.add(() => calls.push('first'));
    scope.add(() => calls.push('second'));
    scope.listen(env.window, 'test', () => calls.push('event'));
    scope.signal.addEventListener('abort', () => calls.push('abort'));
    scope.dispose();
    scope.dispose();
    env.dispatch('test');
    assert.equal(scope.signal.aborted, true);
    assert.deepEqual(calls, ['abort', 'second', 'first']);
    assert.equal(env.listeners.get('test').size, 0);
});

test('bfcache suspends the active mode and resumes it without duplicated observers or storage listeners', async () => {
    const env = await loadRuntime();
    await env.load('dynamic.js');
    env.dispatch('pagehide', { persisted: true });
    assert.equal(env.elements.has('material-colors'), false);
    assert.equal(env.listeners.get('storage').size, 0);
    env.mutateRoot();
    env.flush();
    assert.equal(env.elements.has('material-colors'), false);
    env.dispatch('pageshow', { persisted: true });
    assert.ok(env.elements.has('material-colors'));
    assert.equal(env.listeners.get('storage').size, 1);
    assert.equal(env.activeObservers().length, 2);
    env.dispatch('pagehide');
});
