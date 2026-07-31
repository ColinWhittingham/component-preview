# Data Model: Inferred Component Browser

**Date**: 2026-07-30

---

## Entities

### PageRecord

Represents a web page that has been analysed by the extension.

| Field | Type | Notes |
|-------|------|-------|
| `url` | `string` | Normalised page URL (scheme + host + path, no hash). Primary key. |
| `title` | `string` | Page `<title>` at time of analysis. |
| `framework` | `'react' \| 'vue' \| 'angular' \| 'html'` | Detected or inferred source framework. |
| `analyzedAt` | `number` | Unix timestamp (ms) of last successful analysis. |
| `componentSlugs` | `string[]` | Ordered list of component slugs found on this page. |

**Storage**: `chrome.storage.local`, keyed by `page:[normalised-url]`.

---

### ComponentRecord

A single, distinct UI component type identified on a page.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | `[page-url-hash]:[slug]`. Stable composite key. |
| `pageUrl` | `string` | URL of the source page. |
| `slug` | `string` | Human-readable kebab-case identifier (e.g., `hero-banner`). Unique per page. |
| `displayName` | `string` | Human-readable label for the component index (e.g., "Hero Banner"). |
| `sourceType` | `'framework' \| 'html'` | Whether this was identified from framework metadata or HTML structure. |
| `frameworkName` | `string \| null` | Framework component class name, if applicable (e.g., `HeroBanner`). |
| `properties` | `ComponentProperty[]` | Detectable properties for this component. |
| `instanceCount` | `number` | Number of times this component type appears on the page. |
| `previewSnapshotId` | `string` | Reference to the IndexedDB snapshot entry used for the index preview. |

**Storage**: `chrome.storage.local`, keyed by `component:[id]`.

---

### ComponentProperty

A named attribute of a component that can be set via query string.

| Field | Type | Notes |
|-------|------|-------|
| `name` | `string` | Camel-case property name (e.g., `title`, `theme`). Maps to query string key. |
| `defaultValue` | `string` | Value observed on the source page at analysis time. |
| `type` | `'string' \| 'number' \| 'boolean'` | Inferred type from the observed value. |
| `source` | `'prop' \| 'attribute' \| 'slot'` | Where the property was detected: React/Vue prop, HTML attribute, or inner text. |

**Storage**: Embedded array within `ComponentRecord`.

---

### ComponentSnapshot

The captured, isolated HTML + CSS for rendering a component outside its source page.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | Matches `ComponentRecord.previewSnapshotId`. |
| `componentId` | `string` | FK → `ComponentRecord.id`. |
| `html` | `string` | Cloned `outerHTML` of the component root element. |
| `css` | `string` | Concatenated CSS rules from the source page's stylesheets that apply to the component subtree. |
| `capturedAt` | `number` | Unix timestamp of capture. |

**Storage**: IndexedDB, object store `snapshots`, keyed by `id`.

---

## State Transitions

```
[Page visited by user]
        │
        ▼
[User clicks "Analyse Page" in popup]
        │
        ▼
[Content script injected → framework detection]
        │
        ├─ Framework detected → extract component tree (names, props, DOM refs)
        └─ No framework → extract semantic HTML regions
        │
        ▼
[For each component region: capture snapshot (HTML + CSS)]
        │
        ▼
[Store PageRecord + ComponentRecords in chrome.storage.local]
[Store ComponentSnapshots in IndexedDB]
        │
        ▼
[Popup shows count + link to chrome-extension://[ID]/components/?page=[url]]
        │
        ▼
[User navigates extension index page]
        │
        ├─ Clicks component → navigates to chrome-extension://[ID]/components/[slug]/
        └─ Edits URL query string → component re-renders with updated props
```

---

## Slug Generation Rules

1. Prefer `frameworkName` converted to kebab-case (`HeroBanner` → `hero-banner`).
2. Else prefer `data-component` or `data-testid` attribute value, kebab-cased.
3. Else prefer first non-utility CSS class (class name ≥ 5 chars, not `active`/`open`/`hidden`).
4. Else use ARIA `role` + landmark index (`navigation-1`, `region-2`).
5. Else use HTML tag + index (`section-1`, `article-2`).
6. Append `-2`, `-3`… if slug already exists in the page's component list.
