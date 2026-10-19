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
            createElement() {
                let text = '', writes = 0;
                return {
                    get textContent() { return text; },
                    set textContent(value) { text = value; writes++; },
                    get writes() { return writes; },
                    remove() { styles.delete(this.id); },
                };
            },
            head: { appendChild: style => styles.set(style.id, style) },
        },
        setTimeout: (callback, delay) => { timers.set(++next, { callback, delay }); return next; },
        clearTimeout: id => timers.delete(id),
        fetch: (url, options) => { requests.push({ url, options }); return fetcher(url, options, requests.length); },
    });
    const api = await load(file('matugen.js'));
    const runtime = await load(file('runtime.js'));
    let scope = runtime.createScope();
    let controller = api.startMatugen(scope);
    return {
        requests, timers, styles,
        get scope() { return scope; },
        get controller() { return controller; },
        restart() { scope.dispose(); scope = runtime.createScope(); controller = api.startMatugen(scope); },
        async tick() {
            const entry = [...timers].find(([, timer]) => timer.delay === 1500);
            assert.ok(entry, 'one scheduled refresh');
            timers.delete(entry[0]);
            await entry[1].callback();
            await settle();
        },
    };
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
    let body = css, ok = true;
    const theme = await setup(async () => ({ ok, text: async () => body }));
    await settle();
    for (const invalid of ['<!doctype html><html>missing</html>', '', '   ']) {
        body = invalid;
        await theme.controller.refresh();
        assert.equal(theme.styles.get('material-matugen-colors').textContent, css);
        assert.equal(theme.styles.get('material-matugen-colors').writes, 1);
    }
    body = css.replace('#123456', '#ffffff');
    ok = false;
    await theme.controller.refresh();
    assert.equal(theme.styles.get('material-matugen-colors').textContent, css);
    assert.equal(theme.styles.get('material-matugen-colors').writes, 1);
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

test('Matugen recovers on the next scheduled refresh after both endpoints fail at startup', async () => {
    let recovered = false;
    const theme = await setup(async (url) => {
        if (!recovered && url.includes('steamloopback')) throw new TypeError('Network failure');
        return { ok: recovered, text: async () => recovered ? css : 'File Not Found' };
    });
    await settle();
    assert.equal(theme.requests.length, 2);
    assert.equal(theme.styles.get('material-matugen-colors').textContent, '');
    recovered = true;
    await theme.tick();
    assert.equal(theme.styles.get('material-matugen-colors').textContent, css);
    assert.equal([...theme.timers.values()].filter(t => t.delay === 1500).length, 1);
    theme.scope.dispose();
});

test('Matugen preserves the last valid palette through an outage and applies changed CSS on recovery', async () => {
    let response = css;
    const theme = await setup(async () => ({ ok: response !== null, text: async () => response || '<html>outage</html>' }));
    await settle();
    const style = theme.styles.get('material-matugen-colors');
    response = null;
    await theme.tick();
    assert.equal(style.textContent, css);
    assert.equal(style.writes, 1);
    response = css.replace('#123456', '#654321');
    await theme.tick();
    assert.equal(style.textContent, response);
    assert.equal(style.writes, 2);
    theme.scope.dispose();
});

test('twenty repeated refreshes do not accumulate timers or rewrite identical CSS', async () => {
    const theme = await setup(async () => ({ ok: true, text: async () => css }));
    await settle();
    const style = theme.styles.get('material-matugen-colors');
    for (let i = 0; i < 20; i++) {
        await theme.tick();
        assert.equal(theme.timers.size, 1);
        assert.equal(theme.styles.size, 1);
        assert.equal(style.writes, 1);
    }
    theme.scope.dispose();
    assert.equal(theme.timers.size, 0);
});

test('repeated initialization disposes old requests without allowing late CSS or rescheduling', async () => {
    let resolveOld;
    const theme = await setup((url, options, count) => count === 1 ? new Promise(resolve => { resolveOld = resolve; })
        : Promise.resolve({ ok: true, text: async () => css }));
    const oldStyle = theme.styles.get('material-matugen-colors');
    const oldSignal = theme.requests[0].options.signal;
    theme.restart();
    await settle();
    const current = theme.styles.get('material-matugen-colors');
    assert.equal(oldSignal.aborted, true);
    resolveOld({ ok: true, text: async () => css.replace('#123456', '#ffffff') });
    await settle();
    assert.equal(oldStyle.writes, 0);
    assert.equal(current.textContent, css);
    for (let i = 0; i < 20; i++) {
        theme.restart();
        await settle();
        assert.equal(theme.styles.size, 1);
        assert.equal(theme.timers.size, 1);
    }
    theme.scope.dispose();
    assert.equal(theme.styles.size, 0);
    assert.equal(theme.timers.size, 0);
});

test('disposing Matugen while reading a response body cannot apply its late CSS', async () => {
    let resolveBody;
    const theme = await setup(async () => ({ ok: true, text: () => new Promise(resolve => { resolveBody = resolve; }) }));
    await settle();
    const style = theme.styles.get('material-matugen-colors');
    theme.scope.dispose();
    resolveBody(css);
    await settle();
    assert.equal(style.writes, 0);
    assert.equal(theme.timers.size, 0);
    assert.equal(theme.styles.size, 0);
});
