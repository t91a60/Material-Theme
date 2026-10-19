# Color subsystem

This branch is based on upstream `13f78fe`. It incorporates the extraction improvements from Draft PR #60, commit `2e36eff`, without changing that PR or its branch. The histogram and procedural corpus retain attribution to that contribution. This is a larger lifecycle change, not an alternative quantizer.

## Ownership and mode changes

`skin.json` applies a small CSS mode marker alongside each JavaScript color condition. Static palettes also declare the static marker. `runtime.js` owns one per-document runtime, watches external stylesheet/root changes, and activates the registered factory matching the computed marker. Repeated imports with cache-busting URLs replace the active session rather than accumulating observers. A previously registered factory can restart when a cached module is selected again.

Each active session owns an AbortSignal and cleanup functions. Switching modes disposes the previous session before removing its generated palette. Static selection removes generated colors, so they cannot shadow the selected stylesheet. Page teardown disconnects all runtime resources; bfcache suspension stops the active session and resumes it on pageshow. Runtime settings observers intentionally remain alive while a document is suspended or a static palette is selected, so cached modules can resume.

This mechanism depends on Millennium applying/removing the configured condition stylesheets. Real Steam injection order and mode switching remain integration test requirements.

## Artwork and asynchronous work

The existing narrow Steam artwork selectors and blurred-first priority are preserved. Missing sources, clear.png placeholders and already broken images do not hide valid alternatives. Detection handles added/removed wrappers, src/srcset/sizes changes, image load/error, and eligibility changes to the existing artwork wrapper classes. Unrelated image classes do not invalidate work.

A new relevant mutation immediately increments the request revision and aborts the prior load, before the existing 200 ms debounce. A result commits only if its revision, selected element and requested image attributes still match. Load/error/abort/timeout remove their listeners without replacing Steam handlers. A 10-second terminal timeout bounds images that never dispatch a terminal event.

PR #60's 4-bit RGB histogram and bundled Material Score choose the source. Only opaque pixels vote; neutral artwork uses fallback. Canvas sampling is bounded to 100 pixels on either axis, does not enlarge small inputs, and releases its backing store after success or failure. The active Dynamic session caches at most 16 successful source URLs, without retaining images or pixel buffers. Changing pixels at an unchanged URL without an observable source/resource change is not detected by this URL cache.

## Persistence and synchronization

The existing `material-dynamic-color` key and decimal ARGB format are retained. Parsing rejects partial numbers, out-of-range/transparent values and malformed colors. Storage exceptions do not prevent local extraction or the in-memory last-valid fallback. A successful library extraction is the publisher; passive windows only read/apply colors. Equal storage values are not rewritten.

The current library artwork remains authoritative in its own window; foreign storage events cannot replace pending/local artwork. Windows without artwork apply valid storage events without echoing them. A valid library refresh can republish its own current artwork if persisted storage changed. This is not a new global leader-election protocol: multiple independent library windows can each publish when refreshed.

Fallback remains last valid Dynamic, then the configured custom accent. Custom and Matugen do not write the Dynamic key. Switching modes keeps the established saved Dynamic color for later use. No storage migration, extra preference or cross-origin bridge is introduced. Native Steam windows with distinct origins/storage partitions are not proven to synchronize by same-origin browser tests.

## Palette and rendering

`palette.js` shares the unchanged bundled six Material schemes and all 49 roles between Dynamic and Custom. It retains the custom ARGB-to-HEX serializer for Steam Community. Its 16-entry palette cache keys source/mode/style; identical CSS is not rewritten. Scheme and appearance are read live, not captured at initial injection. OLED remains the existing important stylesheet override of the dark scheme.

Dynamic transitions are limited to body background/text instead of overriding every Steam component for 400 ms. They expire after 250 ms, do not restart on equal palettes, respect the live animation setting and reduced-motion preference when applying a palette, and are removed on disposal. This intentionally reduces transition coverage; visual feel still needs Steam confirmation.

## Matugen

The existing primary and alternate endpoints and 1500 ms refresh cadence are retained. A failed endpoint falls back during the same refresh. Only one request chain is active, requests time out after five seconds, unchanged CSS is not rewritten, and disposal aborts work/removes the timer and style. Failed later refreshes keep the last valid CSS. External Matugen palettes are not regenerated or automatically converted between light/dark schemes; their contents remain user-owned.

## Reproduction

```powershell
node --experimental-vm-modules --test tests/*.test.cjs
git diff --check
node tests/browser-server.cjs
```

Open `http://127.0.0.1:18767/tests/browser-color.html` in an isolated Chromium profile. The page publishes `window.colorTestReport`, shows every assertion, and posts its JSON to the local server console. Stop the server with Ctrl+C (or its localhost `/stop` endpoint). No installed Steam files or active profiles are used.

Node tests include the retained upstream lifecycle regressions, cancellation, timeout, responsive source changes, storage failures/validation, deduplication, class eligibility, reinjection, cached-mode switching, bfcache, palette roles/contrast and Matugen cancellation/fallback. Canvas is mocked in Node; the browser fixture supplements this with real canvas, image loading, MutationObserver, stylesheet loading, module caching and same-origin storage events. Its photograph is public-domain NASA artwork with provenance in `tests/fixtures/LICENSE.txt`.

Measured contrast checks cover six role pairs for tested sources across six schemes and Light/Dark/OLED. They are not a whole-interface WCAG audit. Timing results are machine-specific extraction measurements, not Steam frame times. No real game artwork, live Steam menu, restart or account behavior is certified by this fixture.

## Relationship to PR #60

Retain #60 as an independently reviewable extraction contribution. Its smaller diff has lower integration risk and supplies the source-selection behavior used here. If it merges first, rebase this branch and resolve the extraction relocation explicitly; do not merge two independent runtime implementations. If maintainers later prefer the overhaul as a replacement, superseding #60 requires a separate decision after live Steam validation. Do not close or modify #60 automatically.
