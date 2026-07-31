# Research: Inferred Component Browser

**Date**: 2026-07-30
**Feature**: specs/001-inferred-component-browser

---

## Decision 1: Framework Component Detection Strategy

**Decision**: Use injected content scripts running in the page's main world (`world: "MAIN"`) to probe runtime objects and fibers rather than relying on devtools protocol.

**Rationale**:
- React exposes `__REACT_DEVTOOLS_GLOBAL_HOOK__` globally, and individual DOM nodes carry `__reactFiber$[hash]` or `_reactFiber` properties on their DOM nodes since React 16+. Traversing the fiber tree from the root fiber yields component names, props, and hierarchy without devtools being open.
- Vue 3 attaches `__vueParentComponent` to DOM nodes; Vue 2 attaches `__vue__`. Both expose component name and `$props`.
- Angular Ivy exposes `ng.getComponent(element)` and `ng.getOwningComponent(element)` from the global `ng` namespace.
- These runtime globals are accessible in the MAIN world of a content script (MV3 requires `"world": "MAIN"` in the content script registration, or execution via `chrome.scripting.executeScript({ world: "MAIN" })`).

**Alternatives considered**:
- Chrome DevTools Protocol (CDP) via `chrome.debugger` API — provides rich component data but requires the user to grant debugger permission, shows an "extension is debugging" banner, and cannot run in a regular content script context. Rejected: too invasive UX.
- Static HTML parsing only — much simpler but yields no component names or prop types. Retained as fallback.

---

## Decision 2: Component Isolation Strategy (Snapshot)

**Decision**: Capture component HTML (`outerHTML`) + a filtered subset of document stylesheets scoped to the component's subtree, assembled into a self-contained HTML string.

**Rationale**:
- `element.cloneNode(true)` deep-clones the subtree. Inline styles from `getComputedStyle` can be applied to avoid external resource dependencies.
- Stylesheet filtering: iterate `document.styleSheets`, parse rules using `CSSStyleRule.selectorText`, and include only rules that match any element inside the component subtree (using `element.querySelector(selectorText)` within the clone).
- Result: a portable `<html>` wrapper with `<style>` block + cloned component markup that renders correctly in isolation.

**Alternatives considered**:
- Full page `document.documentElement.outerHTML` snapshot — too large, defeats the isolation goal.
- Shadow DOM with adopted stylesheets — elegant but requires rewriting the component's internal structure; not feasible for third-party HTML. Rejected.
- `getComputedStyle` on every element (inline all styles) — works but produces enormous HTML; slow and fragile with pseudo-elements. Rejected in favour of filtered stylesheet approach.

---

## Decision 3: URL Routing in Extension Pages

**Decision**: Use a single HTML entry point (`components/index.html`) with a service-worker-based URL rewriting strategy to achieve clean path-based URLs (`chrome-extension://[ID]/components/hero-banner/`).

**Rationale**:
- Chrome MV3 service workers can intercept fetch events for extension-origin URLs (`chrome-extension://[ID]/*`). When the SW receives a navigation request for `/components/[anything]/`, it responds with the content of `components/index.html`. The loaded page then reads `window.location.pathname` and `window.location.search` to determine what to render. This achieves the exact URL pattern specified: `chrome-extension://[ID]/components/?page=…` for the index and `chrome-extension://[ID]/components/hero-banner/?title=foo` for individual components.
- Query string parameters pass prop values, which are read by the component renderer on load.

**Alternatives considered**:
- Hash routing (`components/index.html#/hero-banner?title=foo`) — much simpler, no SW required. Downside: the hash fragment is not sent to the server and looks less clean. The user specified path-based URLs so this is a secondary fallback if SW routing proves unreliable.
- Static per-component HTML files — would require pre-generating a file per component slug at analysis time. Infeasible because slugs are dynamic.
- `declarativeNetRequest` URL redirect rules — works for network requests, not for extension-page navigation. Not applicable.

---

## Decision 4: Component Data Storage

**Decision**: Use `chrome.storage.local` for the component index (metadata + slug mapping) and IndexedDB for component snapshots (full HTML+CSS strings).

**Rationale**:
- `chrome.storage.local` is synchronous-read-optimised, easy to use, and sufficient for lightweight JSON (< 100KB) index data. Default 5MB quota, extendable to 10MB via `"unlimitedStorage"` permission.
- Component snapshots (HTML + inlined CSS) can easily reach 50–200KB per component. Storing dozens in `chrome.storage.local` would hit quota limits. IndexedDB has no practical upper limit under Chrome's storage pressure model and supports streaming reads.
- Both are accessible from both content scripts (via message passing to background) and extension pages.

**Alternatives considered**:
- `chrome.storage.session` — lost when browser closes; not suitable for a feature that needs to preserve discovered components across tab navigation.
- `chrome.storage.local` for everything — simpler API but storage quota risk for large snapshots. Rejected for snapshots.

---

## Decision 5: Component Naming / Slug Generation

**Decision**: Name priority order: (1) React/Vue/Angular component display name → (2) `data-component` / `data-testid` / `aria-label` attribute → (3) Primary CSS class (first non-utility class) → (4) ARIA role + landmark index → (5) HTML tag + positional index. Slugify using kebab-case, deduplicate with numeric suffix.

**Rationale**:
- Framework names are the highest-signal source (e.g., `HeroBanner` → `hero-banner`).
- Data attributes (data-component, data-testid) are authored by developers specifically for identification.
- CSS classes often encode semantic names in BEM or utility frameworks.
- ARIA roles and HTML landmarks are semantically meaningful (section, nav, article, aside, header, footer).
- Numeric suffix (`hero-banner-2`) ensures uniqueness within a page index.

---

## Decision 6: Extension Activation UX

**Decision**: Activate via browser action popup with a single "Analyse Page" button. After analysis, the popup links directly to the component index URL for the current tab.

**Rationale**:
- Least invasive — does not modify the page DOM or auto-run on every visit (per spec assumption).
- The popup provides immediate feedback (spinner, component count) and a one-click path to the index.
- No content script is injected until the user explicitly clicks "Analyse Page".
