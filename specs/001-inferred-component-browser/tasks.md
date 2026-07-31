# Tasks: Inferred Component Browser

**Input**: Design documents from `specs/001-inferred-component-browser/`

**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓

**Organization**: Tasks grouped by user story for independent, incremental delivery.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no cross-task dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project skeleton, tooling, and manifest. No user story can begin until complete.

- [X] T001 Initialise `package.json` with Vite + TypeScript + Vitest dev dependencies at repo root
- [X] T002 Create `vite.config.ts` at repo root with multi-entry extension build (popup, components/index, background, content scripts as IIFE)
- [X] T003 Create `tsconfig.json` at repo root targeting ES2020 with DOM and WebExtensions types
- [X] T004 [P] Create `src/manifest.json` as Chrome Manifest V3 with: name, version, action (popup), background service worker, content script registration (world MAIN, run at document_idle), storage + scripting permissions, and web_accessible_resources for components pages
- [X] T005 [P] Create directory structure: `src/background/`, `src/content/`, `src/popup/`, `src/components/views/`, `src/components/styles/`, `src/shared/`, `tests/unit/`, `tests/e2e/`
- [X] T006 [P] Create `.gitignore` and `README.md` with load-unpacked instructions at repo root

**Checkpoint**: `npm run build` produces a `dist/` directory that Chrome accepts via "Load unpacked".

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types, storage layer, slug logic, and messaging skeleton that every user story depends on.

**⚠️ CRITICAL**: No user story work begins until this phase is complete.

- [X] T007 Define all TypeScript interfaces in `src/shared/types.ts`: `PageRecord`, `ComponentRecord`, `ComponentProperty`, `ComponentSnapshot`, `MessageType` union, `AnalysePagePayload`, `GetComponentsPayload`, `GetSnapshotPayload`, and their response shapes (see data-model.md and contracts/url-contract.md)
- [X] T008 Implement slug generation in `src/shared/slug.ts`: kebab-case conversion, priority chain (frameworkName → data-component/data-testid/aria-label → first semantic CSS class → aria-role+index → tagName+index), numeric deduplication suffix
- [X] T009 Implement `src/background/storage.ts`: `chrome.storage.local` helpers for PageRecord CRUD, ComponentRecord CRUD; IndexedDB initialisation and ComponentSnapshot get/put using the `snapshots` object store
- [X] T010 Implement `src/background/service-worker.ts` skeleton: `chrome.runtime.onMessage` listener that dispatches on `MessageType`, stub handlers for `ANALYSE_PAGE`, `GET_COMPONENTS`, and `GET_SNAPSHOT`; fetch event listener that rewrites `/components/*` navigation requests to serve `components/index.html` (URL routing per research.md Decision 3)
- [X] T011 [P] Create `src/popup/popup.html` with minimal markup: extension title, "Analyse Page" button (`id="analyse-btn"`), status paragraph (`id="status"`), and anchor link to the component index (`id="index-link"`, hidden until analysis complete)
- [X] T012 [P] Create `src/components/index.html` as the SPA shell with a single `<div id="app">` mount point and script import of `router.ts`

**Checkpoint**: Extension loads in Chrome with no console errors. Popup opens and shows the button. Message system wires up (stub handlers log messages to SW console).

---

## Phase 3: User Story 1 — Browse Page Components (P1) 🎯 MVP

**Goal**: User activates the extension on any page and can open a component index URL showing labelled, previewed component cards.

**Independent Test**: Load the extension → visit any web page → click "Analyse Page" → follow the index link → verify a grid of named component cards appears.

### Implementation

- [X] T013 [US1] Implement HTML-fallback component detection in `src/content/analyzer.ts`: query `document.querySelectorAll('header, nav, main, section, article, aside, footer, [role]')`, deduplicate overlapping regions, generate ComponentRecord metadata (slug via slug.ts, displayName, sourceType: 'html', instanceCount), post `ANALYSE_PAGE` message to background
- [X] T014 [US1] Implement `ANALYSE_PAGE` handler in `src/background/service-worker.ts`: receive payload, call `storage.savePageRecord` and `storage.saveComponentRecord` for each component, open the index URL as a new tab (or return index URL to popup)
- [X] T015 [US1] Implement `GET_COMPONENTS` handler in `src/background/service-worker.ts`: look up PageRecord by URL, retrieve all ComponentRecords for that page, return structured response
- [X] T016 [US1] Implement `src/popup/popup.ts`: on button click, call `chrome.scripting.executeScript` to inject `analyzer.ts` into the active tab; listen for `chrome.runtime.onMessage` for analysis completion; show component count in status paragraph; construct and display index link as `chrome-extension://[ID]/components/?page=[encoded-tab-url]`
- [X] T017 [US1] Implement `src/components/router.ts`: on page load, read `window.location.pathname` and `window.location.search`; if path is `/components/` (or `/components/index.html`) dispatch to index-view; if path matches `/components/[slug]/` dispatch to component-view; pass parsed query params to the view
- [X] T018 [US1] Implement `src/components/views/index-view.ts`: send `GET_COMPONENTS` message with the `page` query param, render a CSS grid of component cards — each card shows `displayName`, a placeholder preview area, `instanceCount` badge, and links to `chrome-extension://[ID]/components/[slug]/`
- [X] T019 [US1] Create `src/components/styles/app.css` with base layout: CSS custom properties for colour tokens, grid layout for component card index, card styles with hover state, responsive fallback

**Checkpoint**: US1 independently testable per quickstart.md Scenarios 1, 2, and 3.

---

## Phase 4: User Story 2 — Inspect Isolated Component (P2)

**Goal**: Clicking a component card renders it in full isolation — no surrounding page content — in its own view.

**Independent Test**: Navigate directly to `chrome-extension://[ID]/components/hero-banner/` → verify the component renders without other page content visible.

### Implementation

- [X] T020 [US2] Implement snapshot capture in `src/content/snapshot.ts`: for each detected component element, clone node with `cloneNode(true)`, filter document stylesheets to rules matching the subtree (using `element.querySelector(selectorText)` on the clone), concatenate into a `<style>` block, return `{ html: outerHTML, css: concatenatedRules }`
- [X] T021 [US2] Update `src/content/analyzer.ts` to call `snapshot.ts` for each detected component and include `snapshotId` in the `ANALYSE_PAGE` payload
- [X] T022 [US2] Implement `GET_SNAPSHOT` handler in `src/background/service-worker.ts`: look up ComponentRecord by slug + pageUrl, retrieve ComponentSnapshot from IndexedDB, return `{ html, css }`
- [X] T023 [US2] Implement `src/components/views/component-view.ts`: extract slug from `window.location.pathname`, send `GET_SNAPSHOT` message, inject the returned CSS into a `<style>` element, inject the returned HTML into an isolated container `<div>`, render with no other page chrome visible
- [X] T024 [US2] Update `src/components/views/index-view.ts` to render actual component previews in each card's preview area by rendering a scaled-down snapshot iframe or inline HTML (using the snapshot CSS + HTML at reduced scale)

**Checkpoint**: US2 independently testable per quickstart.md Scenario 3.

---

## Phase 5: User Story 3 — Manipulate Component Properties via URL (P3)

**Goal**: Query string parameters on a component URL override displayed property values, updating the component without a page reload.

**Independent Test**: Navigate to `.../components/hero-banner/?title=Hello+World` → verify the rendered component shows "Hello World" as title text.

### Implementation

- [X] T025 [US3] Implement prop overlay logic in `src/components/views/component-view.ts`: after rendering the base snapshot, parse all query string key-value pairs; for each param that matches a `ComponentProperty.name`, find the corresponding DOM node (text node for `slot` source, attribute for `attribute` source, or data-prop attribute for `prop` source) and update its value in the rendered clone; re-render the modified clone
- [X] T026 [US3] Update `src/content/analyzer.ts` to capture `ComponentProperty` data for HTML components: for each detected element, extract meaningful attribute values (title, aria-label, src, alt, href, class modifiers like `theme-dark` → `theme: dark`) and record as `ComponentProperty` entries with `source: 'attribute'`
- [X] T027 [US3] Update `src/components/views/component-view.ts` to show a prop inspector panel alongside the component: list each known `ComponentProperty` with its current value (from query string or default), provide an input field per property that updates the URL query string on change (using `history.replaceState`), enabling live prop editing without full page reload

**Checkpoint**: US3 independently testable per quickstart.md Scenarios 4, 5, and 6.

---

## Phase 6: User Story 4 — Framework-Native Component Detection (P4)

**Goal**: On React, Vue, or Angular pages, component names and props are sourced from the framework runtime rather than HTML structure.

**Independent Test**: Activate extension on a React app (e.g., react.dev) → verify component names in the index match React component names (not generic HTML tags).

### Implementation

- [X] T028 [US4] Implement React fiber traversal in `src/content/analyzer.ts`: detect `window.__REACT_DEVTOOLS_GLOBAL_HOOK__` or probe DOM nodes for `__reactFiber$` property keys; walk the fiber tree from the root container to collect component names (`fiber.type.displayName || fiber.type.name`), props (`fiber.memoizedProps`), and DOM refs; build ComponentRecord list
- [X] T029 [US4] Implement Vue 3 detection in `src/content/analyzer.ts`: probe DOM nodes for `__vueParentComponent`; walk component tree via `component.parent`; extract `component.type.__name` or `component.type.name` and `component.props`; build ComponentRecord list
- [X] T030 [US4] Implement Angular Ivy detection in `src/content/analyzer.ts`: probe `window.ng` for `getComponent` and `getOwningComponent`; walk component tree from host elements identified by `ng-version` attribute; extract component class name and `@Input` bindings; build ComponentRecord list
- [X] T031 [US4] Add framework detection priority logic in `src/content/analyzer.ts`: try React → Vue → Angular in order; if detected, use framework components; if none detected or component tree empty, fall back to HTML semantic detection (T013); set `PageRecord.framework` accordingly
- [X] T032 [US4] Update `src/content/analyzer.ts` to extract typed `ComponentProperty` entries from React props and Vue props (using the actual prop key-value pairs from the runtime, marking `source: 'prop'`)

**Checkpoint**: US4 independently testable per quickstart.md Scenario 1 (framework variant).

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Error handling, edge cases, visual consistency, and validation.

- [X] T033 [P] Add graceful error state to `src/components/views/index-view.ts`: if `GET_COMPONENTS` returns no data (page not yet analysed), show a friendly "No components found for this page. Activate the extension on the source page first." message instead of a blank grid
- [X] T034 [P] Add graceful error state to `src/components/views/component-view.ts`: if `GET_SNAPSHOT` returns no data (unknown slug), show a "Component not found" message with a back link to the index
- [X] T035 [P] Handle duplicate slug deduplication edge case in `src/shared/slug.ts`: write unit tests in `tests/unit/slug.test.ts` covering all five naming priority tiers and numeric suffix generation
- [X] T036 [P] Handle snapshot CSS filtering edge case in `src/content/snapshot.ts`: skip cross-origin stylesheets that throw `SecurityError` on `cssRules` access; log a warning to console
- [X] T037 Add `src/components/styles/app.css` polish: loading spinner for async data fetches, back-navigation link from component view to index, accessible focus styles for keyboard navigation
- [X] T038 Run all quickstart.md validation scenarios and fix any failures
- [X] T039 Verify extension loads cleanly on Chrome 116+ with no manifest errors, no CSP violations, and no service worker registration errors

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — blocks all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — first deliverable MVP
- **US2 (Phase 4)**: Depends on Phase 3 completion (snapshot data stored during analysis)
- **US3 (Phase 5)**: Depends on Phase 4 (prop overlay requires snapshot and component data)
- **US4 (Phase 6)**: Depends on Phase 3 foundation (extends analyzer.ts); can begin in parallel with Phase 4
- **Polish (Phase 7)**: Depends on all user story phases

### User Story Dependencies

- **US1 (P1)**: Unblocked after Phase 2 — core MVP, must ship first
- **US2 (P2)**: Depends on US1 analysis pipeline (snapshots are captured during analysis)
- **US3 (P3)**: Depends on US2 (renders the snapshot with prop overlays)
- **US4 (P4)**: Extends US1 analyzer — can develop in parallel with US2/US3

### Parallel Opportunities Within Phases

- Phase 1: T003, T004, T005, T006 can run in parallel after T001, T002
- Phase 2: T011, T012 can run in parallel with T007–T010
- Phase 6: T028, T029, T030 can run in parallel (different framework detection branches)
- Phase 7: T033, T034, T035, T036 can all run in parallel

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup)
2. Complete Phase 2 (Foundational)
3. Complete Phase 3 (US1 — component index with HTML detection)
4. **STOP AND VALIDATE**: Open the extension on any page, click Analyse, verify the index loads
5. Demo / ship MVP

### Incremental Delivery

1. **MVP**: Setup + Foundational + US1 → Component index from HTML structure
2. **v0.2**: + US2 → Isolated component rendering
3. **v0.3**: + US3 → Prop manipulation via URL
4. **v0.4**: + US4 → Framework-native component names and props
5. **v1.0**: + Polish

---

## Task Summary

| Phase | Tasks | Parallelisable |
|-------|-------|---------------|
| Setup | T001–T006 | T003–T006 |
| Foundational | T007–T012 | T011–T012 |
| US1 (P1) | T013–T019 | none |
| US2 (P2) | T020–T024 | none |
| US3 (P3) | T025–T027 | none |
| US4 (P4) | T028–T032 | T028–T030 |
| Polish | T033–T039 | T033–T036 |
| **Total** | **39 tasks** | |
