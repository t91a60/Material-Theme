# Overhaul contribution plan

## Baseline and dependency

- Upstream main remains `13f78fed5d8161b0eb558ab8b1f83f4e662a713a` at final contribution checks.
- PR #60 remains Draft, head `2e36eff3a278b8ba242f48cd5dc903c6913bf545`.
- `5955105` implements the shared runtime and carries #60's extraction behavior with attribution.
- `550789b` adds reproducible packaging, rollback checks and condition-injection tests. This remains the installed production candidate.
- Final contribution changes add targeted tests and evidence only. No confirmed production regression required a code change.

The current branch includes #60's changes logically, but its Git ancestry starts at upstream main, not #60. Opening it against today's upstream would therefore repeat the extraction improvement. A "depends on #60" sentence alone does not remove that overlap.

**Preferred path: wait for #60 to merge.** Keep the branch pushed to the fork for review, without opening another upstream PR. Then rebase the overhaul onto updated main and explicitly resolve the extraction relocation from dynamic.js to artwork.js. Adapt #60's incoming extraction tests to the shared module harness while retaining their regressions. Re-run the complete suites on the rebased branch and inspect the final upstream diff. Do not close, amend, force-push or otherwise edit #60.

A clean stack is an alternative only if earlier review is requested: prepare a separate branch based on #60 and review its delta against that base. Since #60's branch exists on the fork rather than upstream, a fork-targeted draft would need later retargeting; do not create a misleading upstream-main PR that claims a clean stack. A consolidated replacement requires an explicit user/maintainer decision, not automatic closure of #60.

## Store CSP: controlled result

Historical logs did not establish when the issue began, so a bounded live comparison was performed instead. With identical Dynamic/Dark/Expressive settings and the same Steam/Millennium installation, the original files from `13f78fe` were restored and their hashes checked. Steam was started normally and the Store Cyberpunk page opened. The same procedure was repeated with the verified 14-file `550789b` overlay.

Each phase produced two entry-script rejections: Store and marketing messages. Both blocked exactly:

`https://millennium.host/v1/themes/Material-Theme/js/main/colors/dynamic.js`

The extracted script-src policies matched exactly between baseline and candidate. Thus the nine earlier warnings are the same baseline-reproducible restriction, not an overhaul-introduced entry-script regression. This does not mean Store dynamic styling works: it remains constrained by Steam's policy. No CSP, allowlist, browser flag or security setting was weakened.

Static comparison agrees: TargetJs `affects: [".*"]` and its source path are unchanged. The entry rejection happens before its source executes. The new relative child imports would be a different failure if their URLs were rejected; that is not what these records show.

Local, sanitized evidence is retained outside the repository in `Documents/Material-Theme-Releases/contribution-550789b`: baseline/candidate CSP JSON, byte-offset markers, comparison JSON and screenshots. Screenshots containing profile/friend information are not automatically uploaded or included in a public PR.

## Final targeted verification

```powershell
node --experimental-vm-modules --test tests/*.test.cjs
node tests/browser-server.cjs
```

In isolated Chromium contexts, open:

- `http://127.0.0.1:18767/tests/browser-color.html`
- `http://127.0.0.1:18767/tests/millennium-injection.html`
- `http://127.0.0.1:18767/tests/browser-matugen.html`

The last fixture uses real local HTTP 503 responses, fetch and response-body aborts. It covers initial failure of both endpoints, alternate fallback, recovery on the next scheduled refresh, retention of the last valid CSS through an outage, changed/identical CSS, ten cache-busted initializations, cached-mode resume, and teardown during a pending body. It asserts one style/refresh timer and two persistent shared settings observers; after disposal no Matugen request, body read or timer remains. Node tests also exercise twenty refreshes/reinitializations and a late response from an old session.

This is browser integration coverage, not a forced production endpoint outage in Steam. Live Steam already confirmed Matugen initialization, seven actual game pages, mode/appearance changes, native popup/Friends synchronization and full restart persistence. Arbitrarily slow/broken artwork, all origin/overlay combinations and long-term heap behavior remain unverified live. Those limitations must be disclosed, not converted to PASS using fixture results.

No new blocking regression was found by these targeted checks. The implementation is suitable for a focused **Draft upstream review**, contingent on resolving the #60 base overlap and obtaining explicit approval to publish. It is not a claim of universal Steam compatibility or a recommendation to remove Beta.

## Proposed PR

Use the draft text in `dynamic-color-draft-pr.md` only after choosing the correct base. Before publication, replace the dependency status and exact tested commit with the rebased result. Keep a single coherent overhaul PR, not separate PRs for its extraction, state, synchronization and lifecycle symptoms. Do not publish without explicit user approval.
