# Controlled candidate deployment

The color runtime implementation is `5955105`, based on upstream `13f78fe`. Finalization adds packaging, rollback checks and injection fixtures, without changing that production implementation. Do not deploy only dynamic.js.

## Exact production overlay

Modified (8):

- `skin.json`
- `css/main/colors/blue.css`
- `css/main/colors/green.css`
- `css/main/colors/red.css`
- `css/main/colors/yellow.css`
- `js/main/colors/dynamic.js`
- `js/main/colors/custom.js`
- `js/main/colors/matugen.js`

Added (6):

- `css/main/colors/dynamic-mode.css`
- `css/main/colors/custom-mode.css`
- `css/main/colors/matugen-mode.css`
- `js/main/colors/artwork.js`
- `js/main/colors/palette.js`
- `js/main/colors/runtime.js`

The unchanged `js/main/colors/material-color-utils.js` is still required. The archive contains the full tracked theme, including appearance CSS and other existing assets, not merely this overlay. Deploy only the 14 manifest entries to preserve installed custom artwork, user files and repository metadata. Do not unpack the full archive over an active installation.

## Injection compatibility

Source inspection against the installed executable version's upstream tag, Millennium **v3.6.2**:

- `src/typescript/frontend/patcher/v2/Conditions.ts`: evaluates TargetCss, then TargetJs for a saved condition.
- `patcher/Dispatch.ts`: adds a stylesheet link and a script with `type="module"`; URL construction uses `https://millennium.host/v1/themes/<native>/<path>`. Relative ES imports preserve the shared module graph. The native theme name must remain `Material-Theme`, including for the existing Matugen endpoints.
- `patcher/index.ts`: injects RootColors after condition dispatch. The runtime observes its later insertion and settings changes.
- `components/ThemeEditor.tsx` and `quick-access/DesktopMenuContext.tsx`: condition changes persist configuration and prompt for `SteamClient.Browser.RestartJSContext()` when leaving the editor. **Do not assume live condition switching before accepting the supported UI reload.** This is a JS-context restart, not necessarily a complete Steam process restart.

Sources: `https://github.com/SteamClientHomebrew/Millennium/tree/v3.6.2/src/typescript/frontend`.

`tests/millennium-injection.html` reproduces condition selection and link/module insertion from the actual candidate skin.json, for Dynamic/Custom/Matugen and all three appearances. It uses fresh documents like a context reload; it does not call the color factories directly. Matugen endpoint replies are routed to the local fixture. This is source compatibility plus browser evidence, **not live Steam validation**, nor a proof of behavior on older Millennium versions.

## Prepare (no installed writes)

Requires Windows, Node, Git and PowerShell already available locally. Use a new release directory outside Temp:

```powershell
node tools/prepare-color-candidate.cjs RELEASE_DIR "C:\Program Files (x86)\Steam\millennium\themes\Material-Theme" "C:\Program Files (x86)\Steam\millennium\config\config.json"
node RELEASE_DIR/color-deployment.cjs verify RELEASE_DIR
```

The worktree must be committed/clean. The preparer archives the exact Git revision, checks all seven color modules/imports and seven condition CSS targets, and records every candidate hash. It backs up every installed regular theme file except `.git`, checks original hashes again after copying, and snapshots only the selected theme's relevant settings plus the two global CSS/JavaScript injection enable flags. It neither copies credentials/network/plugin configuration nor writes config.json. Installed edits to the 14 overlay paths or an incompatible MCU block preparation, rather than being overwritten. The manifest records original absence of the six new paths. The exact approved filenames and add/modify statuses are checked, not just the file count.

Store this directory persistently until testing and rollback are complete. A later theme update invalidates the backup/preflight; prepare a fresh release instead of bypassing a mismatch. Avoid automatic theme updates during the short test window; do not change update settings without approval.

## Deploy (separate approval required)

1. Obtain explicit approval for the **14-file overlay**, not the earlier single-file PR #60 test. No settings changes are included in file deployment.
2. User manually exits Steam at a safe time. The tool refuses to run while steam/steamwebhelper exists and never terminates or starts them. If Windows denies writes, stop; do not elevate, change ACLs or take ownership automatically.
3. Run only after authorization:

```powershell
node RELEASE_DIR/color-deployment.cjs deploy RELEASE_DIR --approved
```

The tool verifies archive, candidate, backup, original installed state and settings first, applies only the overlay, then verifies candidate hashes. An interrupted copy triggers restoration of files attempted by that deployment. If automatic restoration fails, keep Steam closed and use the saved backup; never report a partial rollback as success.

4. User manually opens Steam only after separately approving that operation. Do not rely on replacing files in a running JS context. A full process restart is not performed by the tool.

## Practical smoke test (settings/reload need approval)

- Dynamic: two or three differently colored games, rapid switching, return to library home, reopen the same game. No stale palette or persistent flicker.
- Custom: select a known accent; switching from a pending Dynamic load must not overwrite it. Return to Dynamic. Use Millennium's supported reload prompt after condition changes.
- Matugen: existing file loads, then return to another mode without retaining its stylesheet. Do not edit the external palette just for this test without approval.
- Light/Dark/OLED: readable text/menus; OLED's two intended surfaces remain black.
- Context menu, version/beta dropdown and Friends/popup: valid initial colors and updates where storage is shared. Distinct origins/partitions remain an explicit risk.
- User-approved reopening of Steam: correct startup mode/fallback and first game selection. No screenshot collection is required; record pass/fail and any reproducible issue.

Restore the original selected theme/Color/Appearance/generation style/accent through the UI before closing Steam for rollback. Other theme settings must also match the snapshot. If approval does not include changing settings, perform only Dynamic tests in the existing configuration and mark the other cases NOT RUN.

## Rollback

1. Obtain approval for the manual close/reopen cycle if not already granted. Exit Steam manually.
2. Run:

```powershell
node RELEASE_DIR/color-deployment.cjs rollback RELEASE_DIR --approved
node RELEASE_DIR/color-deployment.cjs verify RELEASE_DIR
```

The rollback preflights every path, refuses unknown edits, restores the original bytes of all eight overwritten files, deletes only the six manifest paths that were originally absent, and verifies the entire original theme inventory. `.git` was never changed. It also compares relevant settings against the snapshot, but **does not write configuration**. If settings differ, files can be restored while the settings check fails; restore the recorded values through the supported UI and reverify. Never replace the whole Millennium config with the theme-only snapshot.

The Dynamic localStorage value is not backed up or edited; after rollback, normal artwork selection recalculates the accent. Do not claim byte-for-byte restoration of CEF storage or unrelated configuration. No restart, theme setting or account operation is authorized merely by generating this package.

## Offline package verification

```powershell
node --experimental-vm-modules --test tests/*.test.cjs
$env:MATERIAL_THEME_TEST_ROOT = 'RELEASE_DIR\candidate\Material-Theme'
node tests/browser-server.cjs
```

Open `/tests/browser-color.html` and `/tests/millennium-injection.html` at `http://127.0.0.1:18767` in an isolated Chromium context. Their source and all imported production files are served from the extracted archive. For running the archived Node suite, initialize a local Git index in the extracted staging copy (`git init`, `git add -f .`), since existing config tests use git ls-files. This does not alter the ZIP or installed theme; the test-only .git is never deployed. Stop only the fixture server when finished.

## Upstream strategy

Keep Draft PR #60 unchanged and independent. Its verified extraction has lower integration risk and is already carried forward with attribution. Preferred order: let #60 merge, then rebase the overhaul onto upstream, explicitly relocating its extraction into artwork.js and avoiding a second extraction-only patch. Until then keep this branch local, logically dependent on #60's behavior but not stacked onto its mutable branch. Do not publish an overlapping PR while both remain unreviewed. A consolidated replacement should be considered only after controlled Steam testing and an explicit maintainer/user decision; it does not justify automatically closing #60.
