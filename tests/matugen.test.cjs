const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const loader = require('./load-module.cjs');
const file = name => path.resolve(__dirname, '../js/main/colors', name);
const css = ':root { --md-sys-color-primary: #123456; }';
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

async function setup(fetcher) {
    const timers = new Map(), styles = new Map(), requests = [];
    let next = 0;
    const load = loader({
        window: { __materialColorRuntime: { register() {} } },
        document: {
            createElement: () => ({ remove() { styles.delete(this.id); } }),
            head: { appendChild: style => styles.set(style.id, style) },
        },
        setTimeout: (callback, delay) => { timers.set(++next, { callback, delay }); return next; },
        clearTimeout: id => timers.delete(id),
        fetch: (url, options) => { requests.push({ url, options }); return fetcher(url, options, requests.length); },
    });
    const api = await load(file('matugen.js'));
    const runtime = await load(file('runtime.js'));
    const scope = runtime.createScope();
    const controller = api.startMatugen(scope);
    return { requests, timers, styles, scope, controller };
}

test('Matugen falls back in the same refresh and keeps the working endpoint preferred', async () => {
    const theme = await setup(async (url, options, count) => ({ ok: count !== 1, text: async () => count === 1 ? 'File Not Found' : css }));
    await settle();
    assert.equal(theme.requests.length, 2);
    assert.match(theme.requests[1].url, /millennium.host/);
    assert.equal(theme.styles.get('material-matugen-colors').textContent, css);
    assert.equal([...theme.timers.values()].filter(t => t.delay === 1500).length, 1);
    await theme.controller.refresh();
    assert.match(theme.requests[2].url, /millennium.host/);
    theme.scope.dispose();
    assert.equal(theme.timers.size, 0);
    assert.equal(theme.styles.size, 0);
});

test('Matugen ignores HTML, empty responses and HTTP failures without discarding the last valid CSS', async () => {
    let valid = true;
    const theme = await setup(async () => ({ ok: true, text: async () => valid ? css : '<!doctype html><html>missing</html>' }));
    await settle();
    valid = false;
    await theme.controller.refresh();
    assert.equal(theme.styles.get('material-matugen-colors').textContent, css);
    theme.scope.dispose();
});

test('Matugen never overlaps requests and disposal aborts work with no late style or timer', async () => {
    let resolve;
    const theme = await setup(() => new Promise(done => { resolve = done; }));
    await theme.controller.refresh();
    await theme.controller.refresh();
    assert.equal(theme.requests.length, 1);
    const signal = theme.requests[0].options.signal;
    theme.scope.dispose();
    assert.equal(signal.aborted, true);
    resolve({ ok: true, text: async () => css });
    await settle();
    assert.equal(theme.styles.size, 0);
    assert.equal(theme.timers.size, 0);
    assert.equal(theme.requests.length, 1);
});

test('Matugen timeout aborts a hung endpoint and tries the alternate', async () => {
    const theme = await setup((url, options, count) => count === 1 ? new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
    }) : Promise.resolve({ ok: true, text: async () => css }));
    const timeout = [...theme.timers.values()].find(t => t.delay === 5000);
    timeout.callback();
    await settle();
    assert.equal(theme.requests.length, 2);
    assert.equal(theme.styles.get('material-matugen-colors').textContent, css);
    theme.scope.dispose();
});
