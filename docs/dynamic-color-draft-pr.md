# Proposed title: Manage color-mode lifecycle and shared palette ownership

Draft text only. **Do not publish yet.** Wait for #60 to merge, rebase and verify that the upstream diff no longer duplicates its extraction change. Update the tested revision after rebasing.

## Dependency

Depends on #60's verified extraction improvement (`2e36eff`). This work moves that logic into artwork.js rather than proposing another extraction algorithm. #60 remains an independent contribution; this PR should be based on upstream main after it merges.

## Problem and change

Dynamic, Custom and Matugen previously initialized independently, without a shared owner to dispose pending work and generated styles when modes changed or scripts were reinjected. Palette generation was duplicated, malformed persisted colors could reach generation, and Matugen refreshes could overlap or remain active after a mode change.

This change adds one document-scoped runtime, explicit condition CSS markers, cancellable artwork requests and bounded caches. Dynamic and Custom share the existing six Material schemes and all 49 roles. Static selection releases generated colors. Matugen retains its endpoints and refresh cadence, but falls back in the same refresh, preserves valid CSS during failure, avoids overlapping requests and cleans up on disposal. No new dependency, preference UI or cross-origin storage bridge is added.

## Verification

- 77 Node tests, including the preserved upstream lifecycle regressions, source selection, storage validation, palette roles, resource cleanup, packaging and rollback.
- Isolated Chromium: 29 runtime checks, 18 checks selecting the actual skin.json condition targets, and 13 Matugen HTTP failure/recovery/cleanup checks.
- Windows Steam/Millennium v3.6.2: real artwork on seven game pages, Dynamic/Custom switching, Matugen initialization, Light/Dark/OLED, context menus/native properties/Friends windows, synchronization and a full restart with persisted mode.
- A controlled original `13f78fe` versus `550789b` comparison reproduced the same Store and marketing-message CSP entry rejections with identical policies. This change neither introduced nor bypasses that restriction.
- Original theme settings restored after testing; deployment file hashes verified. A persistent backup and tested rollback are retained locally.

## Limitations

Store script execution remains restricted by Steam CSP. Same-origin fixtures do not prove sharing across every Steam origin or storage partition. Controlled Matugen endpoint failures and pending-body aborts were exercised against local HTTP fixtures, not forced into the active Steam installation. Artificially slow/broken artwork, every overlay and long-term memory retention have not been validated live. This does not remove Dynamic's Beta label.

Related to #3. No claim that every historical Dynamic Color report is resolved.
