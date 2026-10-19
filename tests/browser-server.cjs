// Run: node tests/browser-server.cjs, then open http://127.0.0.1:18767/tests/browser-color.html.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(process.env.MATERIAL_THEME_TEST_ROOT || path.join(__dirname, '..'));
const { fixtures } = require('./color-fixtures.cjs');
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/matugen-resource.css') {
        const phase = url.searchParams.get('phase');
        const endpoint = url.searchParams.get('endpoint');
        if (phase === 'outage' || phase === 'fallback' && endpoint === 'primary') {
            res.writeHead(503, { 'Content-Type': 'text/plain' }); res.end('File Not Found'); return;
        }
        res.writeHead(200, { 'Content-Type': 'text/css', 'Cache-Control': 'no-store' });
        if (phase === 'slow-body') {
            res.write(':root { --md-sys-color-primary: ');
            const timer = setTimeout(() => res.end('#badbad; }'), 1000);
            res.on('close', () => clearTimeout(timer));
        } else res.end(`:root { --md-sys-color-primary: ${phase === 'recovered' ? '#654321' : '#123456'}; }`);
        return;
    }
    if (url.pathname === '/fixtures') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(fixtures.map(f => ({ ...f, pixels: [...f.pixels] }))));
        return;
    }
    if (url.pathname === '/image.svg') {
        const color = /^[a-z]+$/.test(url.searchParams.get('color')) ? url.searchParams.get('color') : 'green';
        setTimeout(() => {
            if (url.searchParams.has('fail')) { res.writeHead(404); res.end('intentional failed image'); return; }
            res.setHeader('Content-Type', 'image/svg+xml');
            res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"><path fill="${color}" d="M0 0h100v60H0z"/></svg>`);
        }, Math.min(2000, Number(url.searchParams.get('delay')) || 0));
        return;
    }
    if (url.pathname === '/results' && req.method === 'POST') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const results = JSON.parse(Buffer.concat(chunks));
        console.log(JSON.stringify(results, null, 2));
        res.end('recorded');
        return;
    }
    if (url.pathname === '/stop') { res.end('stopped'); server.close(); return; }
    const filename = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!filename.startsWith(root + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
        res.writeHead(404); res.end(); return;
    }
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.jpg': 'image/jpeg' })[path.extname(filename)] || 'text/plain');
    res.end(fs.readFileSync(filename));
});
server.listen(18767, '127.0.0.1', () => console.log('Color integration fixture: http://127.0.0.1:18767/tests/browser-color.html'));
