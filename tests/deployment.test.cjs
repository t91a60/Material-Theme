const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const api = require('../tools/color-deployment.cjs');
const { checkModules, checkOverlay, approvedOverlay } = require('../tools/prepare-color-candidate.cjs');

function sandbox(t) {
    const base = process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA, 'Temp', 'opencode') : os.tmpdir();
    const release = fs.mkdtempSync(path.join(base, 'color-release-test-'));
    t.after(() => fs.rmSync(release, { recursive: true, force: true }));
    const installedTheme = path.join(release, 'installed');
    const backup = path.join(release, 'backup', 'Material-Theme');
    const candidate = path.join(release, 'candidate', 'Material-Theme');
    for (const root of [installedTheme, backup, candidate]) fs.mkdirSync(root, { recursive: true });
    for (const root of [installedTheme, backup]) fs.writeFileSync(path.join(root, 'old.js'), 'original\r\n');
    fs.writeFileSync(path.join(candidate, 'old.js'), 'candidate\n');
    fs.writeFileSync(path.join(candidate, 'new.js'), 'new module\n');
    const configFile = path.join(release, 'config.json');
    fs.writeFileSync(configFile, JSON.stringify({ themes: { activeTheme: 'Material-Theme', conditions: { 'Material-Theme': { Color: 'Dynamic (Beta)' } } }, unrelated: { doNotCopy: 'not-theme-data' } }));
    fs.writeFileSync(path.join(release, 'candidate.zip'), 'test archive');
    const manifest = {
        installedTheme, configFile, archiveSha256: api.hash(path.join(release, 'candidate.zip')),
        originalSettings: api.settings(configFile), originalFiles: api.inventory(backup), candidateFiles: api.inventory(candidate),
        changes: [{ path: 'old.js', originalSha256: api.hash(path.join(backup, 'old.js')), candidateSha256: api.hash(path.join(candidate, 'old.js')) },
            { path: 'new.js', originalSha256: null, candidateSha256: api.hash(path.join(candidate, 'new.js')) }],
    };
    fs.writeFileSync(path.join(release, 'manifest.json'), JSON.stringify(manifest));
    return api.loadRelease(release);
}

test('candidate dependency closure contains every imported color module and all condition styles', () => {
    const modules = checkModules(path.resolve(__dirname, '..'));
    assert.equal(modules.length, 7);
    assert.ok(modules.includes('js/main/colors/runtime.js'));
    assert.ok(modules.includes('js/main/colors/material-color-utils.js'));
});
test('deployment and rollback restore exact original bytes and remove only formerly absent files', t => {
    const state = sandbox(t);
    api.deployFiles(state);
    api.verifyTarget(state, 'candidate');
    api.restoreFiles(state);
    api.verifyTarget(state, 'original');
    assert.equal(fs.readFileSync(path.join(state.manifest.installedTheme, 'old.js'), 'utf8'), 'original\r\n');
    assert.equal(fs.existsSync(path.join(state.manifest.installedTheme, 'new.js')), false);
    assert.equal(JSON.stringify(state.manifest.originalSettings).includes('doNotCopy'), false);
});
test('unexpected installed edits stop deploy and rollback before any writes', t => {
    const state = sandbox(t);
    fs.writeFileSync(path.join(state.manifest.installedTheme, 'old.js'), 'user edits');
    assert.throws(() => api.deployFiles(state), /Hash mismatch/);
    assert.throws(() => api.restoreFiles(state), /Unexpected edits/);
    assert.equal(fs.readFileSync(path.join(state.manifest.installedTheme, 'old.js'), 'utf8'), 'user edits');
});
test('tampered package and path traversal are rejected', t => {
    const state = sandbox(t);
    assert.throws(() => api.inside(state.release, '../outside'));
    fs.writeFileSync(path.join(state.candidate, 'new.js'), 'changed');
    assert.throws(() => api.loadRelease(state.release), /Hash mismatch/);
});
test('CLI refuses deployment without explicit approval and leaves files untouched', t => {
    const state = sandbox(t);
    const output = cp.spawnSync(process.execPath, [path.resolve(__dirname, '../tools/color-deployment.cjs'), 'deploy', state.release], { encoding: 'utf8' });
    assert.equal(output.status, 1);
    assert.match(output.stderr, /approval/);
    api.verifyTarget(state, 'original');
});

test('overlay approval checks exact filenames and statuses, not merely a count', () => {
    assert.equal(checkOverlay(approvedOverlay).length, 14);
    const changed = approvedOverlay.map(entry => [...entry]);
    changed[0][1] = 'css/main/colors/unapproved.css';
    assert.throws(() => checkOverlay(changed), /approved/);
});
test('rollback rejects a replacement installed-root junction without touching its destination', t => {
    const state = sandbox(t);
    const external = path.join(state.release, 'external');
    fs.mkdirSync(external);
    fs.writeFileSync(path.join(external, 'old.js'), 'candidate\n');
    fs.renameSync(state.manifest.installedTheme, state.manifest.installedTheme + '-original');
    fs.symlinkSync(external, state.manifest.installedTheme, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => api.restoreFiles(state), /Linked path/);
    assert.equal(fs.readFileSync(path.join(external, 'old.js'), 'utf8'), 'candidate\n');
});
test('an interrupted partial copy restores the attempted files including original absence', t => {
    const state = sandbox(t), copy = fs.copyFileSync;
    fs.copyFileSync = (source, target, ...options) => {
        if (target === path.join(state.manifest.installedTheme, 'new.js')) {
            fs.writeFileSync(target, 'partial');
            throw new Error('Injected partial copy failure');
        }
        return copy(source, target, ...options);
    };
    try { assert.throws(() => api.deployFiles(state), /Injected partial/); }
    finally { fs.copyFileSync = copy; }
    api.verifyTarget(state, 'original');
});
test('failed automatic rollback is reported, never presented as a successful restore', t => {
    const state = sandbox(t), copy = fs.copyFileSync;
    fs.copyFileSync = (source, target, ...options) => {
        if (target === path.join(state.manifest.installedTheme, 'new.js')) throw new Error('Injected deployment failure');
        if (source === path.join(state.backup, 'old.js')) throw new Error('Injected rollback failure');
        return copy(source, target, ...options);
    };
    try { assert.throws(() => api.deployFiles(state), /rollback incomplete/); }
    finally { fs.copyFileSync = copy; }
});
test('edits to untouched baseline files stop rollback without overwriting the new edits', t => {
    const state = sandbox(t), relative = 'untouched.css';
    const target = path.join(state.manifest.installedTheme, relative);
    fs.writeFileSync(target, 'baseline');
    state.manifest.originalFiles.push({ path: relative, sha256: api.hash(target) });
    fs.writeFileSync(target, 'user changes');
    assert.throws(() => api.restoreFiles(state), /Hash mismatch/);
    assert.equal(fs.readFileSync(target, 'utf8'), 'user changes');
});
