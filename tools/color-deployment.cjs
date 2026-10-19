const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const assert = require('node:assert/strict');

const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function rejectLinks(file) {
    let current = path.resolve(file);
    while (true) {
        if (fs.lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`Linked path: ${file}`);
        const parent = path.dirname(current);
        if (parent === current) return;
        current = parent;
    }
}
function inside(root, relative) {
    const file = path.resolve(root, relative);
    if (!file.startsWith(path.resolve(root) + path.sep)) throw new Error('Unsafe manifest path');
    return file;
}
function inventory(root, relative = '') {
    rejectLinks(path.join(root, relative));
    const files = [];
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
        if (entry.name === '.git') continue;
        const name = path.posix.join(relative.replaceAll('\\', '/'), entry.name);
        const file = inside(root, name);
        if (fs.lstatSync(file).isSymbolicLink()) throw new Error(`Refusing linked file: ${name}`);
        if (entry.isDirectory()) files.push(...inventory(root, name));
        else if (entry.isFile()) files.push({ path: name, sha256: hash(file) });
        else throw new Error(`Unsupported file: ${name}`);
    }
    return files.sort((a, b) => a.path.localeCompare(b.path));
}
function settings(configFile, native = 'Material-Theme') {
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8').replace(/^\uFEFF/, ''));
    const theme = config.themes;
    return {
        injectCSS: config.general?.injectCSS ?? null,
        injectJavascript: config.general?.injectJavascript ?? null,
        activeTheme: theme.activeTheme ?? null,
        allowedScripts: theme.allowedScripts ?? null,
        allowedStyles: theme.allowedStyles ?? null,
        conditions: theme.conditions?.[native] || {},
        themeColors: theme.themeColors?.[native] || {},
    };
}
function verifyFiles(root, files) {
    for (const file of files) {
        const filename = inside(root, file.path);
        rejectLinks(filename);
        assert.equal(hash(filename), file.sha256, `Hash mismatch: ${file.path}`);
    }
}
function loadRelease(directory) {
    const release = path.resolve(directory);
    const manifest = JSON.parse(fs.readFileSync(path.join(release, 'manifest.json'), 'utf8'));
    const candidate = path.join(release, 'candidate', 'Material-Theme');
    const backup = path.join(release, 'backup', 'Material-Theme');
    assert.equal(hash(path.join(release, 'candidate.zip')), manifest.archiveSha256, 'Archive hash');
    verifyFiles(candidate, manifest.candidateFiles);
    verifyFiles(backup, manifest.originalFiles);
    return { release, manifest, candidate, backup };
}
function currentHash(file) { return fs.existsSync(file) ? hash(file) : null; }
function verifyTarget(state, phase) {
    const { manifest } = state;
    // Verify the complete backup baseline, not only files that will be overwritten.
    const changed = new Map(manifest.changes.map(item => [item.path, item]));
    for (const original of manifest.originalFiles) {
        if (phase !== 'original' && changed.has(original.path)) continue;
        verifyFiles(manifest.installedTheme, [original]);
    }
    for (const item of manifest.changes) {
        const file = inside(manifest.installedTheme, item.path);
        rejectLinks(file);
        const value = currentHash(file);
        if (phase === 'original') assert.equal(value, item.originalSha256, `Original state changed: ${item.path}`);
        else if (phase === 'candidate') assert.equal(value, item.candidateSha256, `Candidate state changed: ${item.path}`);
        else assert.ok(value === item.originalSha256 || value === item.candidateSha256, `Unexpected edits: ${item.path}`);
    }
}
function restoreFiles(state) {
    const { manifest, backup } = state;
    // Preflight the entire plan before deleting/restoring even one file.
    verifyTarget(state, 'mixed');
    for (const item of [...manifest.changes].reverse()) {
        const target = inside(manifest.installedTheme, item.path);
        if (item.originalSha256 === null) {
            if (fs.existsSync(target)) fs.unlinkSync(target);
        } else fs.copyFileSync(inside(backup, item.path), target);
    }
    verifyTarget(state, 'original');
}
function deployFiles(state) {
    verifyTarget(state, 'original');
    assert.deepEqual(settings(state.manifest.configFile), state.manifest.originalSettings, 'Theme settings changed since backup');
    const attempted = [];
    try {
        for (const item of state.manifest.changes) {
            const target = inside(state.manifest.installedTheme, item.path);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            attempted.push(item);
            fs.copyFileSync(inside(state.candidate, item.path), target);
        }
        verifyTarget(state, 'candidate');
    } catch (error) {
        try {
            // Also restore an interrupted/partial copy that has neither known hash.
            for (const item of attempted.reverse()) {
                const target = inside(state.manifest.installedTheme, item.path);
                if (item.originalSha256 === null) { if (fs.existsSync(target)) fs.unlinkSync(target); }
                else fs.copyFileSync(inside(state.backup, item.path), target);
            }
            verifyTarget(state, 'original');
        }
        catch (rollback) { throw new AggregateError([error, rollback], 'Deployment failed; automatic rollback incomplete. Keep Steam closed.'); }
        throw error;
    }
}
function ensureSteamClosed() {
    if (process.platform !== 'win32') throw new Error('Deployment requires Windows');
    const result = cp.execFileSync('powershell.exe', ['-NoProfile', '-Command', "@(Get-Process steam,steamwebhelper -ErrorAction SilentlyContinue).Count"], { encoding: 'utf8' }).trim();
    if (result !== '0') throw new Error('Close Steam manually first. This tool never stops or restarts it.');
}

if (require.main === module) {
    try {
        const [action = 'verify', directory, approval] = process.argv.slice(2);
        if (!directory || !['verify', 'deploy', 'rollback'].includes(action)) throw new Error('Usage: node color-deployment.cjs verify|deploy|rollback RELEASE [--approved]');
        const state = loadRelease(directory);
        if (action === 'verify') {
            verifyTarget(state, 'original');
            assert.deepEqual(settings(state.manifest.configFile), state.manifest.originalSettings, 'Theme settings differ');
            console.log('PASS: package, backup, original installed files and theme settings. No installed writes.');
        } else {
            if (approval !== '--approved') throw new Error('Separate explicit user approval is required. Pass --approved only after receiving it.');
            ensureSteamClosed();
            if (action === 'deploy') deployFiles(state);
            else {
                restoreFiles(state);
                assert.deepEqual(settings(state.manifest.configFile), state.manifest.originalSettings, 'Files restored, but theme settings differ. Restore saved values through Millennium UI; no config was overwritten.');
            }
            console.log(`PASS: ${action}; file hashes verified. Steam was not launched. Theme configuration was not written.`);
        }
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { hash, inside, inventory, settings, verifyFiles, loadRelease, verifyTarget, restoreFiles, deployFiles };
