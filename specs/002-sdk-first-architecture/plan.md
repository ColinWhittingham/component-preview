# Implementation Plan: SDK-First Architecture

**Branch**: `002-sdk-first-architecture` | **Date**: 2026-07-31 | **Spec**: [spec.md](spec.md)

## Summary

Refactor the Chrome extension into an SDK-first architecture. A standalone `component-preview-sdk.js` does all analysis work (component detection, CSS extraction via `document.styleSheets`, property inference, snapshot capture). The extension becomes a thin injection/storage wrapper. CDP debugger is eliminated.

## Technical Context

**Language/Version**: TypeScript 5.x, ES2020 target
**Primary Dependencies**: None for the SDK (pure DOM). Extension keeps Chrome MV3 APIs.
**Build**: esbuild (SDK IIFE bundle) + Vite (extension pages/SW ESM)
**Target Platform**: Chrome 116+, any browser for standalone SDK

## Key Decisions

1. **CSS extraction via `document.styleSheets`** — replaces CDP. Same-origin access to all stylesheets the page loaded. For cross-origin sheets that block `cssRules`, attempt fetch with CORS, then fall back to computed styles.
2. **Property inference from CSS rules** — scan matched rules for attribute selectors (`[data-theme="dark"]`), BEM class variants (`.card--large`), and `@media` breakpoints. Produce `enum`-type properties with available values.
3. **Dual-mode SDK** — runs standalone (returns Promise) or injected by extension (posts results via `window.postMessage`). Same code, different entry path.
4. **Keep inline-styled snapshots** as fallback rendering layer. Hybrid CSS (clean HTML + matched rules) is primary when available.

## Project Structure

```text
sdk/                                # Standalone SDK (no Chrome APIs)
├── index.ts                        # Public API: ComponentPreview.analyse()
├── css-extractor.ts                # NEW: direct document.styleSheets extraction
├── property-inferrer.ts            # NEW: theme/variant/breakpoint inference from CSS
├── analyzer.ts                     # MOVED from src/content/analyzer.ts
├── snapshot.ts                     # MOVED from src/content/snapshot.ts
├── clean-snapshot.ts               # MOVED from src/content/clean-snapshot.ts
├── export-builder.ts               # MOVED from src/content/export-builder.ts
├── slug.ts                         # MOVED from src/shared/slug.ts
└── types.ts                        # MOVED+EXTENDED from src/shared/types.ts

src/                                # Extension wrapper (Chrome APIs only)
├── manifest.json                   # Remove debugger permission
├── background/
│   ├── service-worker.ts           # Simplified: inject SDK, store results
│   └── storage.ts                  # Unchanged
├── content/
│   └── bridge.ts                   # Unchanged: postMessage → chrome.runtime relay
├── popup/
│   ├── popup.html
│   └── popup.ts
├── components/                     # SPA views — unchanged except import paths
│   ├── views/
│   │   ├── index-view.ts
│   │   ├── component-view.ts       # Add enum prop dropdowns
│   │   └── preview-frame.ts
│   └── styles/app.css

DELETE: src/background/css-extractor.ts (CDP version replaced by SDK)
DELETE: src/content/analyzer.ts (moved to SDK)
DELETE: src/content/snapshot.ts (moved to SDK)
DELETE: src/content/clean-snapshot.ts (moved to SDK)
DELETE: src/content/export-builder.ts (moved to SDK)
DELETE: src/shared/slug.ts (moved to SDK, re-exported)
```

## CSS Extraction Algorithm (sdk/css-extractor.ts)

For each component element:

1. Collect all elements in subtree: `[root, ...root.querySelectorAll('*')]`
2. For each stylesheet in `document.styleSheets`:
   a. Try reading `sheet.cssRules` (same-origin)
   b. On `SecurityError`: try `fetch(sheet.href)` + `new CSSStyleSheet().replaceSync(text)`
   c. On fetch failure: skip (inline-styled snapshot provides fallback)
3. For each `CSSStyleRule`: test `element.matches(selectorText)` against subtree elements. Include if any match.
4. For each `CSSMediaRule`/`CSSSupportsRule`: recurse into child rules, wrap matches in the condition.
5. Also test ancestor elements (up to 5 levels above root) for inheritable property rules.
6. Post-process: collect `@keyframes` for used `animation-name` values, `@font-face` for used `font-family` values.
7. Separate `:root`/`html`/`body` custom property rules into `designTokens`.
8. Resolve all `url()` values to absolute.

## Property Inference Algorithm (sdk/property-inferrer.ts)

After CSS extraction, scan matched rules for configurable variants:

1. **Attribute selectors**: `[data-theme="light"]`, `[data-mode="compact"]` → enum property with detected values
2. **BEM class variants**: `.card--large`, `.card--small` → enum property split on `--`
3. **State classes**: `.is-active`, `.is-disabled` → enum property split on `.is-`
4. **Media breakpoints**: `@media (min-width: 768px)` → viewport enum with breakpoint values
5. Merge with existing HTML-extracted properties, enriching existing entries with `values` arrays
