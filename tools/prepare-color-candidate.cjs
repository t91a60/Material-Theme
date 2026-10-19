const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const { hash, inventory, settings, inside, verifyFiles } = require('./color-deployment.cjs');
const root = path.resolve(__dirname, '..');
const git = (...args) => cp.execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

const approvedOverlay = [
    ['M', 'skin.json'],
    ...['blue', 'green', 'red', 'yellow'].map(name => ['M', `css/main/colors/${name}.css`]),
    ...['dynamic', 'custom', 'matugen'].map(name => ['M', `js/main/colors/${name}.js`]),
    ...['dynamic', 'custom', 'matugen'].map(name => ['A', `css/main/colors/${name}-mode.css`]),
    ...['artwork', 'palette', 'runtime'].map(name => ['A', `js/main/colors/${name}.js`]),
];
function checkOverlay(entries) {
    const sort = list => [...list].sort((a, b) => a[1].localeCompare(b[1]));
    assert.deepEqual(sort(entries), sort(approvedOverlay), 'Production overlay differs from the approved 8 modified / 6 added paths');
    return entries.map(([, name]) => name);
}

function checkModules(candidate) {
    const visited = new Set();
    function visit(relative) {
        if (visited.has(relative)) return;
        visited.add(relative);
        const source = fs.readFileSync(inside(candidate, relative), 'utf8');
        for (const match of source.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)) {
            visit(path.posix.normalize(path.posix.join(path.posix.dirname(relative), match[1])));
        }
    }
    const skin = JSON.parse(fs.readFileSync(path.join(candidate, 'skin.json'), 'utf8'));
    for (const [name, patch] of Object.entries(skin.Conditions.Color.values)) {
        if (patch.TargetCss) assert.ok(fs.existsSync(inside(candidate, patch.TargetCss.src)), name);
        if (patch.TargetJs) visit(patch.TargetJs.src);
    }
    assert.ok(visited.has('js/main/colors/material-color-utils.js'));
    return [...visited].sort();
}

function prepare(release, installedTheme, configFile, revision = 'HEAD') {
    release = path.resolve(release);
    installedTheme = path.resolve(installedTheme);
    configFile = path.resolve(configFile);
    if (fs.existsSync(release)) throw new Error('Release directory must not exist');
    if (git('status', '--porcelain')) throw new Error('Commit preparation changes before packaging');
    const commit = git('rev-parse', revision);
    const baseline = git('rev-parse', '13f78fe');
    const changed = checkOverlay(git('diff', '--name-status', baseline, commit, '--', 'skin.json', 'js/main/colors', 'css/main/colors')
        .split('\n').filter(Boolean).map(line => line.split('\t')));
    fs.mkdirSync(release, { recursive: true });
    const archive = path.join(release, 'candidate.zip');
    cp.execFileSync('git', ['archive', '--format=zip', '--prefix=Material-Theme/', `--output=${archive}`, commit], { cwd: root });
    const quote = text => "'" + text.replaceAll("'", "''") + "'";
    cp.execFileSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(path.join(release, 'candidate'))} -ErrorAction Stop`]);
    const candidate = path.join(release, 'candidate', 'Material-Theme');
    const backup = path.join(release, 'backup', 'Material-Theme');
    const originalFiles = inventory(installedTheme);
    const originalSettings = settings(configFile);
    assert.equal(originalSettings.activeTheme, 'Material-Theme', 'Unexpected active theme');
    assert.equal(originalSettings.injectCSS, true, 'CSS injection disabled');
    assert.equal(originalSettings.injectJavascript, true, 'JavaScript injection disabled');
    for (const item of originalFiles) {
        const target = inside(backup, item.path);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(inside(installedTheme, item.path), target);
    }
    verifyFiles(backup, originalFiles);
    verifyFiles(installedTheme, originalFiles);
    assert.deepEqual(settings(configFile), originalSettings, 'Settings changed during backup');
    const changes = changed.map(relative => {
        const original = inside(installedTheme, relative);
        const exists = fs.existsSync(original);
        const inBaseline = git('ls-tree', baseline, '--', relative);
        if (inBaseline) {
            assert.ok(exists, `Missing original: ${relative}`);
            const expected = cp.execFileSync('git', ['show', `${baseline}:${relative}`], { cwd: root, encoding: 'utf8' });
            assert.equal(fs.readFileSync(original, 'utf8').replaceAll('\r\n', '\n'), expected.replaceAll('\r\n', '\n'), `Installed edits: ${relative}`);
        } else assert.ok(!exists, `New candidate path already exists: ${relative}`);
        return { path: relative, originalSha256: exists ? hash(original) : null, candidateSha256: hash(inside(candidate, relative)) };
    });
    // Unchanged MCU is still a required dependency; verify the installed copy too.
    const dependency = 'js/main/colors/material-color-utils.js';
    const installedUtils = fs.readFileSync(inside(installedTheme, dependency), 'utf8').replaceAll('\r\n', '\n');
    assert.equal(installedUtils, fs.readFileSync(inside(candidate, dependency), 'utf8').replaceAll('\r\n', '\n'));
    const manifest = {
        schema: 1, commit, baseline, installedTheme, configFile, archiveSha256: hash(archive),
        originalSettings, originalFiles, changes, candidateFiles: inventory(candidate), modules: checkModules(candidate),
        notes: 'Full tracked candidate archive. Deployment overlays only changes. Backup excludes .git; configuration snapshot contains only theme settings and two injection enable flags. No Steam writes performed.',
    };
    fs.writeFileSync(path.join(release, 'manifest.json'), JSON.stringify(manifest, null, 2));
    fs.writeFileSync(path.join(release, 'backup', 'theme-settings.json'), JSON.stringify(originalSettings, null, 2));
    fs.copyFileSync(path.join(__dirname, 'color-deployment.cjs'), path.join(release, 'color-deployment.cjs'));
    return { commit, release, productionFiles: changes.length, candidateFiles: manifest.candidateFiles.length, backupFiles: originalFiles.length, modules: manifest.modules, archiveSha256: manifest.archiveSha256 };
}
if (require.main === module) {
    try {
        const [release, theme, config, revision] = process.argv.slice(2);
        if (!release || !theme || !config) throw new Error('Usage: node tools/prepare-color-candidate.cjs RELEASE INSTALLED_THEME MILLENNIUM_CONFIG [REVISION]');
        console.log(JSON.stringify(prepare(release, theme, config, revision), null, 2));
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { prepare, checkModules, checkOverlay, approvedOverlay };
