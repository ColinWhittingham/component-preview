# Tasks: SDK-First Architecture

**Input**: Design documents from `specs/002-sdk-first-architecture/`

**Prerequisites**: plan.md ✓, spec.md ✓

---

## Phase 1: SDK Core — New Modules

**Purpose**: Build the two entirely new modules that don't exist yet.

- [X] T001 Create `sdk/css-extractor.ts` — implement `extractCssForElement(root)` using direct `document.styleSheets` access: iterate all rules, match against subtree via `element.matches()`, handle `CSSMediaRule`/`CSSSupportsRule`/`CSSKeyframesRule`/`CSSFontFaceRule`, cross-origin fallback via fetch, ancestor inheritable-property matching, URL resolution, deduplication
- [X] T002 Create `sdk/property-inferrer.ts` — implement `inferPropertiesFromCss(root, matchedRules)`: detect attribute-selector variants (`[data-theme]`), BEM class variants (`.card--large`), state classes (`.is-active`), `@media` breakpoints; produce `InferredProperty[]` with `type: 'enum'` and `values` arrays

---

## Phase 2: SDK Module Structure

**Purpose**: Move existing content scripts into the SDK directory and create the public API entry point.

- [X] T003 Create `sdk/types.ts` — move from `src/shared/types.ts`, extend `ComponentProperty` with `type: 'enum'` and `values?: string[]` field, extend `PropertySource` with `'css-attribute' | 'css-class' | 'css-media'`, add enriched payload fields (`matchedCss`, `designTokens`, `fonts`, `keyframes`) to component entries in `AnalysePagePayload`, remove extension-only `StartAnalysisPayload`
- [X] T004 [P] Move `src/shared/slug.ts` → `sdk/slug.ts` (no changes)
- [X] T005 [P] Move `src/content/snapshot.ts` → `sdk/snapshot.ts` — remove `collectFontFaces` and `getCssCustomProperties` (CSS extractor handles these), keep inline-style capture + all existing fixes (pseudo-elements, form cleanup, ancestor backgrounds, URL resolution)
- [X] T006 [P] Move `src/content/clean-snapshot.ts` → `sdk/clean-snapshot.ts` — add lazy-loading image handling to match snapshot.ts (data-src etc), fix Angular missing selectorPath/cleanHtml bug
- [X] T007 [P] Move `src/content/export-builder.ts` → `sdk/export-builder.ts` (no changes)
- [X] T008 Move `src/content/analyzer.ts` → `sdk/analyzer.ts` — remove auto-execute block and postMessage call, export `analyse()` function, integrate CSS extractor + property inferrer calls, merge inferred properties with HTML-extracted properties
- [X] T009 Create `sdk/index.ts` — public API entry point: dual-mode detection (standalone vs extension-injected), `ComponentPreview.analyse()` returns `Promise<AnalysisResult>`, auto-runs and posts via `window.postMessage` when injected by extension, guards against double-execution

**Checkpoint**: `sdk/` directory contains all analysis logic with zero Chrome API dependencies. Can be compiled standalone.

---

## Phase 3: Extension Adaptation

**Purpose**: Simplify the extension to inject the SDK instead of managing CDP.

- [X] T010 Create `src/shared/types.ts` as a re-export barrel: `export * from '../../sdk/types'` — minimises import path churn across extension files
- [X] T011 Delete `src/background/css-extractor.ts` (CDP version, replaced by SDK)
- [X] T012 Delete `src/content/analyzer.ts`, `src/content/snapshot.ts`, `src/content/clean-snapshot.ts`, `src/content/export-builder.ts` (moved to SDK)
- [X] T013 Update `src/manifest.json` — remove `debugger` permission, add `sdk/*` to `web_accessible_resources`
- [X] T014 Update `src/background/service-worker.ts` — remove CDP imports/attach/detach, simplify `handleStartAnalysis` to inject bridge + SDK only, simplify `handleAnalysePage` to use SDK-provided CSS data directly from payload, remove `handleStartAnalysis` and `START_ANALYSIS` message type (popup sends analysis trigger, SW injects scripts, SDK auto-runs)
- [X] T015 Update `src/popup/popup.ts` — trigger analysis by sending message to SW (which injects SDK), increase timeout to 30s, remove debugger-related comments
- [X] T016 Update `src/content/bridge.ts` — no code changes, verify it still relays correctly

**Checkpoint**: Extension loads without debugger permission, analysis runs without debugging banner.

---

## Phase 4: Build System

**Purpose**: Produce the SDK as a standalone IIFE bundle alongside the extension.

- [X] T017 Update `build.mjs` — add esbuild step for `sdk/index.ts` → `dist/sdk/component-preview-sdk.js` (IIFE, globalName: 'ComponentPreview'), remove `src/content/analyzer.ts` entry, update bridge entry path
- [X] T018 Update `vite.config.ts` — verify service worker build still works with updated import paths
- [X] T019 Update `tsconfig.json` — add `sdk` to `include` paths
- [X] T020 Verify `dist/` structure: `sdk/component-preview-sdk.js`, `content/bridge.js`, `background/service-worker.js`, `popup/`, `components/`, `manifest.json`

**Checkpoint**: `npm run build` succeeds. `dist/sdk/component-preview-sdk.js` is a standalone file with no Chrome API references.

---

## Phase 5: Rendering & Property Configurability

**Purpose**: Improve visual fidelity and make non-text properties actually configurable.

- [X] T021 Update `src/components/views/component-view.ts` — render `enum`-type properties as `<select>` dropdowns in the prop panel showing all available values, handle `css-attribute` source by setting `data-*` attributes on iframe root, handle `css-class` source by toggling classes on iframe root
- [X] T022 Update `src/components/views/preview-frame.ts` — update import paths, ensure `buildHybridFrame` works with enriched snapshot data from SDK
- [X] T023 Update `src/components/views/index-view.ts` — update import paths
- [X] T024 Update `src/components/styles/app.css` — add styles for `<select>` dropdowns in prop panel to match input field styling

**Checkpoint**: Theme/variant property changes produce visible effects in component preview. Enum properties show dropdowns.

---

## Phase 6: Tests

- [X] T025 Create `tests/unit/css-extractor.test.ts` — test rule matching, cross-origin fallback, @media wrapping, @keyframes/@font-face collection, deduplication, ancestor matching, design token separation
- [X] T026 Create `tests/unit/property-inferrer.test.ts` — test attribute selector detection, BEM variant detection, state class detection, media breakpoint detection, merge with HTML properties
- [X] T027 Update `tests/unit/preview-frame.test.ts` — update imports from SDK types
- [X] T028 Update `tests/unit/slug.test.ts` — update imports from SDK
- [X] T029 Create `tests/integration/sdk-standalone.html` — test page that loads `component-preview-sdk.js` via script tag and logs results to console

**Checkpoint**: `npm test` passes. SDK standalone test page works in browser.

---

## Phase 7: Polish

- [X] T030 Verify backward compatibility — old stored snapshots (without `matchedCss`/`designTokens`) still render in index and component views via fallback path
- [X] T031 Verify all three test sites render correctly: optimizely.com, topcashback.co.uk, moneysupermarket.com/boiler-cover/
- [X] T032 Run `npm run build` final verification — dist structure matches manifest, no console errors when extension loads

---

## Dependencies & Execution Order

- **Phase 1**: No dependencies — start immediately (T001, T002 can run in parallel)
- **Phase 2**: Depends on Phase 1 (T003 depends on T001/T002 for type shapes)
- **Phase 3**: Depends on Phase 2 (extension needs SDK modules to exist)
- **Phase 4**: Depends on Phase 2 (build needs SDK files)
- **Phase 5**: Depends on Phase 3 + 4 (views need updated types and working build)
- **Phase 6**: Can start alongside Phase 2, finalized after Phase 5
- **Phase 7**: Depends on all phases

## Task Summary

| Phase | Tasks | Count |
|-------|-------|-------|
| SDK Core | T001–T002 | 2 |
| SDK Structure | T003–T009 | 7 |
| Extension Adaptation | T010–T016 | 7 |
| Build System | T017–T020 | 4 |
| Rendering & Props | T021–T024 | 4 |
| Tests | T025–T029 | 5 |
| Polish | T030–T032 | 3 |
| **Total** | | **32** |
