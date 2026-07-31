# Feature Specification: Inferred Component Browser

**Feature Branch**: `001-inferred-component-browser`

**Created**: 2026-07-30

**Status**: Draft

**Input**: User description: "A Chrome extension that acts as an inferred Storybook for pages you don't own. When activated on any web page, it identifies UI components (preferring React/Vue/Angular component trees if detectable, falling back to semantic HTML structure). It then exposes those components via a predictable URL pattern: chrome-extension://[ID]/components/?page=www.example.com lists all component types found on that page with previews, chrome-extension://[ID]/components/hero-component/ renders an isolated individual component, and chrome-extension://[ID]/components/hero-component/?title=example+hero&theme=dark renders that component with props/attributes populated from the query string."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse Page Components (Priority: P1)

A developer is exploring an unfamiliar website and wants to understand its UI structure. They activate the extension while on the page and are presented with an index of all identified components — each shown with a visual preview and a human-readable name — accessible at a URL they can bookmark and share.

**Why this priority**: Core value proposition. Without component discovery there is nothing else to build on. Every other story depends on this working.

**Independent Test**: Can be fully tested by activating the extension on any web page and verifying that the index URL loads a list of labelled, previewed components.

**Acceptance Scenarios**:

1. **Given** the user is viewing a page that contains a hero banner, navigation bar, product cards, and a footer, **When** they activate the extension, **Then** the component index at `chrome-extension://[ID]/components/?page=[encoded-url]` displays all four component types, each with a name and visual preview.
2. **Given** the component index is open, **When** the user copies the index URL and opens it in a new tab, **Then** the same index loads, allowing the URL to be bookmarked or shared.
3. **Given** the user activates the extension on a plain HTML page with no identifiable framework, **When** the index loads, **Then** components are identified from semantic HTML structure (headings, sections, articles, navs) and displayed with appropriate names.

---

### User Story 2 - Inspect an Isolated Component (Priority: P2)

A designer or developer wants to examine a specific component in isolation — without the surrounding page — to understand its structure and default appearance.

**Why this priority**: The isolated view is the primary destination from the index; it transforms the tool from a map into an interactive inspection environment.

**Independent Test**: Can be fully tested by navigating directly to `chrome-extension://[ID]/components/hero-component/` and verifying the component renders alone, stripped of its page context.

**Acceptance Scenarios**:

1. **Given** the component index lists a "hero-banner" component, **When** the user clicks its preview, **Then** they navigate to `chrome-extension://[ID]/components/hero-banner/` and see the component rendered in isolation with its default content.
2. **Given** the user is on the isolated component page, **When** they inspect the rendered output, **Then** the component appears visually consistent with how it looked on the source page, with no other page content visible.
3. **Given** the user navigates directly to a component URL without first visiting the index, **When** the page loads, **Then** the component still renders correctly (URLs are independently resolvable).

---

### User Story 3 - Manipulate Component Properties via URL (Priority: P3)

A developer or QA engineer wants to explore how a component responds to different content or configuration. They edit the URL query string to pass property values and see the component update without touching the source page.

**Why this priority**: This unlocks the Storybook-like experience — property-driven interactive exploration — making the tool useful for testing and documentation, not just inspection.

**Independent Test**: Can be fully tested by appending `?title=Hello+World&theme=dark` to a component URL and verifying those values are reflected in the rendered component.

**Acceptance Scenarios**:

1. **Given** the user is on `chrome-extension://[ID]/components/hero-banner/`, **When** they append `?title=Example+Hero&theme=dark` to the URL, **Then** the component re-renders with the updated title text and dark theme styling applied.
2. **Given** a component has multiple detectable properties, **When** the user sets all of them via query string, **Then** all properties are reflected simultaneously in the rendered output.
3. **Given** the user sets an unrecognised query string key, **When** the component renders, **Then** the unknown property is silently ignored and the component renders with its remaining known properties intact.

---

### User Story 4 - Prefer Framework-Native Component Representation (Priority: P4)

When the extension detects that a page is built with a component framework (React, Vue, Angular), it uses the framework's own component tree — component names, props, and structure — rather than the raw HTML output.

**Why this priority**: Framework-native data produces far richer metadata (typed props, component names, hierarchy) than HTML analysis alone. This significantly raises the quality of the browsing and property-manipulation experience on modern web apps.

**Independent Test**: Can be fully tested by activating the extension on a React application and verifying that component names match the React component tree (e.g., "HeroBanner" not "div.hero") where detectable.

**Acceptance Scenarios**:

1. **Given** a page uses React with a component named `HeroBanner`, **When** the extension analyses the page, **Then** the component index lists "HeroBanner" (or its slug equivalent) as a component, sourced from the React component tree.
2. **Given** a page uses a framework but the extension cannot access the component tree (e.g., production build without devtools hooks), **When** analysis runs, **Then** the extension falls back gracefully to HTML-based component detection without error.

---

### Edge Cases

- What happens when a page has no identifiable components beyond generic HTML containers (e.g., a plain text article)?
- How does the system handle dynamically loaded content that appears after initial page load (infinite scroll, modal dialogs, lazy sections)?
- What if two or more components on the same page produce the same generated name?
- What if a component's detectable properties include values that cannot be represented as URL query string parameters (complex objects, binary data)?
- What happens when the user navigates away from the source page before viewing the extension index?
- How are components identified across SPA route changes that do not reload the page?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST analyse the current web page and identify distinct, reusable UI components when the extension is activated.
- **FR-002**: System MUST prefer component framework metadata (React, Vue, Angular component names and properties) over HTML analysis when a supported framework is detectable on the page.
- **FR-003**: System MUST fall back to semantic HTML structure analysis (sections, articles, navigation, headers, footers, cards) when no supported framework is detected or accessible.
- **FR-004**: System MUST assign each identified component a consistent, human-readable URL slug (e.g., `hero-banner`, `product-card`) derived from its framework name, landmark role, or prominent class/attribute.
- **FR-005**: System MUST expose a component index page at `chrome-extension://[ID]/components/?page=[encoded-source-url]` listing all distinct component types found on the specified page.
- **FR-006**: Component index MUST display a visual preview of each component type alongside its name.
- **FR-007**: System MUST expose individual component pages at `chrome-extension://[ID]/components/[slug]/` that render the component in isolation, without surrounding page content.
- **FR-008**: Individual component pages MUST reflect property values passed via URL query string parameters, updating the component's content or configuration accordingly.
- **FR-009**: Component URL slugs MUST be stable — the same component on the same page MUST always resolve to the same slug across extension activations.
- **FR-010**: System MUST handle pages where component analysis is incomplete or unavailable without crashing, displaying a clear message to the user instead.
- **FR-011**: All extension URLs (index and individual component) MUST be shareable — another user with the extension installed opening the same URL MUST see the same content.

### Key Entities

- **Page**: A web URL that has been analysed by the extension. Identified by its normalised URL.
- **Component**: A discrete, reusable UI element found on a Page. Has a name, a URL slug, a source type (framework or HTML), and zero or more detectable properties.
- **ComponentProperty**: A named, string-representable attribute of a Component that influences its appearance or content and can be passed via query string.
- **ComponentIndex**: The full set of unique Component types identified for a given Page.
- **ComponentSnapshot**: The captured markup and styles required to render a Component in isolation within the extension.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can access the component index for any page within 5 seconds of activating the extension on that page.
- **SC-002**: At least 80% of visually distinct, reusable UI regions on a page are correctly identified as separate component types on pages built with supported frameworks or standard semantic HTML.
- **SC-003**: Individual components render in visual isolation — no other page content is visible in the component view — in 100% of cases.
- **SC-004**: A component URL with query string properties reliably reproduces the same rendered component state when opened by a second user with the extension installed.
- **SC-005**: Users can navigate from the component index to an individual component and back to the index using only browser navigation (URL bar and back button) with no dead ends.
- **SC-006**: The extension produces no visible errors or blank pages when activated on pages it cannot fully analyse — a graceful fallback message is shown instead.

## Assumptions

- The user has the Chrome extension installed and active in their browser.
- The extension is activated manually by the user (e.g., via a browser action button or popup), not automatically on every page visit.
- Pages built with React, Vue, or Angular may expose component tree information through browser devtools APIs or global runtime objects; pages that do not will be analysed via DOM inspection.
- Component naming on HTML-only pages derives from available signals in priority order: ARIA landmark roles, data attributes, class names, and HTML tag semantics.
- Component property detection is best-effort; not all component properties are guaranteed to be discoverable, especially on minified or obfuscated production builds.
- The source page must remain open in a browser tab (or have been recently analysed) for the extension to serve component data; the extension does not independently crawl or cache pages between browser sessions.
- Mobile-only pages and heavily canvas-based UIs are out of scope for component detection in the initial version.
