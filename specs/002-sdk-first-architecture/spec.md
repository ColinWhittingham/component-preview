# Feature Specification: SDK-First Architecture

**Feature Branch**: `002-sdk-first-architecture`

**Created**: 2026-07-31

**Status**: Draft

**Input**: Refactor the Chrome extension into an SDK-first architecture where a standalone `component-preview-sdk.js` script does all the work (component detection, CSS extraction, snapshot capture, property inference) and the Chrome extension becomes a thin wrapper that injects it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - SDK Produces High-Fidelity Component Snapshots (Priority: P1)

A developer drops `<script src="component-preview-sdk.js"></script>` onto their own page. The SDK analyses the page and produces a set of component objects, each containing clean HTML with original class names and complete CSS rules (including cross-origin stylesheets, @font-face, @keyframes, @media queries, hover/focus states, and CSS custom properties). The rendered output is visually indistinguishable from the original page.

**Why this priority**: Visual fidelity is the #1 user complaint. The SDK running in same-origin context has full `document.styleSheets` access — no CDP debugger needed — so it can extract ALL CSS rules directly, producing far better output than the current CDP-based approach.

**Independent Test**: Drop the SDK onto a page with cross-origin stylesheets (e.g., Google Fonts, CDN-hosted CSS frameworks), custom themes, hover effects, and responsive layouts. Verify all are captured in the component output.

**Acceptance Scenarios**:

1. **Given** the SDK is loaded on a page using a CDN-hosted CSS framework (Bootstrap, Tailwind), **When** the SDK analyses the page, **Then** all CSS rules from cross-origin stylesheets that match component elements are included in the component's `matchedCss` output, including media queries, @keyframes, and @font-face declarations.
2. **Given** a component has `:hover` and `:focus` CSS rules, **When** the component is rendered in isolation, **Then** the hover and focus states are functional (visible when interacted with).
3. **Given** a page with CSS custom properties defined on `:root`, **When** the SDK captures a component that uses those variables, **Then** the `designTokens` output includes all relevant variable declarations and the component renders correctly using them.
4. **Given** a page with pseudo-elements (`::before`, `::after`) that contribute visible content or styling, **When** the SDK captures the component, **Then** the pseudo-element styles are preserved in the matched CSS output (not converted to inline `<span>` elements).

---

### User Story 2 - Configurable Component Properties Beyond Text (Priority: P2)

Components have inferred properties that can be changed via URL query string, and those changes produce real visual effects. This includes not just text content but themes (data-theme, CSS class variants), display modes, background colors, and layout options.

**Why this priority**: The current tool only supports text property changes. Theme toggles, variant switching, and layout changes are what make a Storybook-like experience useful for design exploration.

**Independent Test**: Capture a component that has theme variants (e.g., light/dark). Change `?theme=dark` in the URL. Verify the component visually switches themes using the page's actual CSS rules.

**Acceptance Scenarios**:

1. **Given** a component with `data-theme="light"` and CSS rules for `[data-theme="light"]` and `[data-theme="dark"]`, **When** the user changes the theme property to "dark" via the query string or prop panel, **Then** the component preview re-renders with the dark theme styling applied from the matched CSS rules.
2. **Given** a component with class-based variants (e.g., `card--large`, `card--small`), **When** the user changes the variant property, **Then** the component re-renders with the corresponding variant class and its associated CSS rules take effect.
3. **Given** the SDK detects CSS rules with attribute selectors, class variants, or media query breakpoints for a component, **When** properties are generated, **Then** the property list includes configurable entries for those variants (not just text content), with the available values enumerated where possible.

---

### User Story 3 - Extension Wraps the SDK Transparently (Priority: P3)

The Chrome extension injects the SDK into any page, receives the results, stores them, and renders the component index and detail views — exactly as it does today, but using the SDK for all analysis work. The CDP debugger is no longer needed. No debugging banner appears.

**Why this priority**: The extension is the primary delivery mechanism. Users must see no regression in workflow while gaining the quality improvements from the SDK.

**Independent Test**: Install the extension, visit any page, click "Analyse Page", browse components in the index, click into a component detail view. Verify the workflow is identical to before but without the debugging banner and with better visual output.

**Acceptance Scenarios**:

1. **Given** the extension is installed and the user clicks "Analyse Page", **When** analysis runs, **Then** no Chrome debugging banner appears (the `debugger` permission is no longer required).
2. **Given** the extension injects the SDK into a page, **When** the SDK completes analysis, **Then** the results are identical in structure to what the extension previously produced, and all existing views (index, component detail, prop panel, export) continue to work.
3. **Given** a user has previously analysed pages with the old extension version, **When** they upgrade to the SDK-based version, **Then** previously stored component data continues to load correctly in the index and detail views.

---

### User Story 4 - AI Export Produces Production-Ready Output (Priority: P4)

The "Copy for AI" button produces a self-contained HTML document with real CSS rules (not inline computed styles), making it suitable for an AI to understand, modify, and produce a working variant of the component.

**Why this priority**: This is the end goal — giving component data to an AI that can intelligently modify it. The SDK's full CSS access means the export will have real selectors, media queries, and theme variants that an AI can work with naturally.

**Independent Test**: Copy a component for AI, paste into Claude, ask "change the primary color to green and make the heading larger", paste the AI's output into a browser. Verify it renders correctly with the requested changes.

**Acceptance Scenarios**:

1. **Given** a component is exported via "Copy for AI", **When** the HTML is opened in a standalone browser, **Then** it renders identically to the component preview in the extension (same layout, colors, fonts, spacing).
2. **Given** an AI receives the exported HTML, **When** asked to change a CSS variable or class-based theme, **Then** the AI can modify the CSS rules meaningfully because they use real selectors (not inline `style` attributes).

---

### Edge Cases

- What happens when the SDK is loaded on a page with Content Security Policy that blocks inline scripts?
- How does the SDK handle pages where stylesheets are dynamically added after the SDK loads?
- What if a component's CSS depends on ancestor selectors that are outside the component boundary?
- How does the SDK handle CSS-in-JS (styled-components, Emotion) where styles are in `<style>` tags with generated class names?
- What happens when the same SDK script is loaded twice on a page?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The SDK MUST be a single JavaScript file (`component-preview-sdk.js`) that can be loaded via a `<script>` tag on any page, with no dependencies.
- **FR-002**: The SDK MUST expose a JavaScript API (`ComponentPreview.analyse()`) that returns component data programmatically, without requiring Chrome extension APIs.
- **FR-003**: The SDK MUST extract CSS rules by directly reading `document.styleSheets`, including cross-origin stylesheets (accessible because the page already loaded them), `@font-face`, `@keyframes`, `@media` rules, and pseudo-element rules.
- **FR-004**: The SDK MUST NOT use Chrome DevTools Protocol (CDP), `chrome.debugger`, or any Chrome extension APIs.
- **FR-005**: The SDK MUST produce both an inline-styled snapshot (for visual preview fidelity) and a clean HTML + matched CSS output (for AI export and hybrid rendering).
- **FR-006**: The SDK MUST detect configurable properties beyond text — including theme variants (from `data-*` attributes and CSS attribute selectors), class-based variants (from CSS class selectors), and responsive breakpoints (from `@media` rules).
- **FR-007**: The Chrome extension MUST inject the SDK into pages via `chrome.scripting.executeScript` and receive results via `window.postMessage` — the same bridge pattern used today but without CDP.
- **FR-008**: The Chrome extension MUST remove the `debugger` permission from its manifest.
- **FR-009**: Component property changes in the preview MUST use the hybrid rendering approach — real CSS rules respond to attribute/class changes, with inline-styled fallback for uncovered elements.
- **FR-010**: The SDK MUST handle CSS-in-JS patterns (styled-components, Emotion, CSS Modules) by reading their runtime-injected `<style>` tags, which appear in `document.styleSheets` as same-origin sheets.

### Key Entities

- **ComponentPreviewSDK**: The standalone script exposing `analyse()` and individual utility functions.
- **AnalysisResult**: The top-level result object containing page metadata and an array of detected components.
- **InferredComponent**: A detected component with slug, display name, properties, inline snapshot, clean HTML, matched CSS, design tokens, and fonts.
- **InferredProperty**: A configurable property with name, default value, type, source, and (new) available values for enum-like properties.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Components rendered using hybrid CSS (clean HTML + matched CSS rules) are visually closer to the original page than components rendered using inline-styled snapshots, as measured by visual comparison on 5 test pages.
- **SC-002**: At least 80% of CSS rules that affect a component's appearance are captured by the SDK's stylesheet extraction, including cross-origin stylesheets.
- **SC-003**: Theme/variant property changes produce visible effects in the component preview on pages that use attribute-based or class-based theming.
- **SC-004**: The Chrome extension analysis workflow completes without the Chrome debugging banner appearing at any point.
- **SC-005**: The "Copy for AI" export produces HTML that renders correctly in a standalone browser, with no missing styles, fonts, or images.

## Assumptions

- Pages that load the SDK as a drop-in script have same-origin access to their own stylesheets (standard browser security model).
- When the Chrome extension injects the SDK into a third-party page, the SDK runs in the MAIN world and has the same `document.styleSheets` access as any script on that page — cross-origin sheets that the page loaded with proper CORS headers are accessible.
- Cross-origin stylesheets loaded without CORS headers will have `cssRules` blocked; the SDK falls back to computed-style extraction for rules from those sheets.
- The SDK is loaded after the page's DOM is ready (either via `defer`, `DOMContentLoaded`, or manual invocation).
- CSS-in-JS libraries inject their styles into `<style>` tags in the `<head>`, which appear in `document.styleSheets` as same-origin sheets.
