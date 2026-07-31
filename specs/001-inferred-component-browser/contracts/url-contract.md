# URL Contract: Inferred Component Browser

**Date**: 2026-07-30

All extension URLs are served from a single HTML entry point (`components/index.html`). A service worker intercepts navigation within the `chrome-extension://[ID]/components/` path prefix and responds with this entry point, which then reads `window.location.pathname` and `window.location.search` to render the correct view.

---

## Routes

### Component Index

```
chrome-extension://[ID]/components/?page=[encoded-url]
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `page` | Yes | URL-encoded source page URL (e.g., `https%3A%2F%2Fwww.example.com`) |

**Renders**: A grid of all component types identified on the specified page. Each entry shows the component name and a visual preview thumbnail. Clicking a component navigates to its individual view.

**Example**:
```
chrome-extension://[ID]/components/?page=https%3A%2F%2Fwww.example.com
```

---

### Individual Component View (default props)

```
chrome-extension://[ID]/components/[slug]/
```

| Segment | Description |
|---------|-------------|
| `[slug]` | Kebab-case component identifier (e.g., `hero-banner`, `product-card`) |

**Renders**: The component in isolation using its default property values captured at analysis time. No surrounding page content is visible.

**Example**:
```
chrome-extension://[ID]/components/hero-banner/
```

---

### Individual Component View (custom props)

```
chrome-extension://[ID]/components/[slug]/?[prop]=[value]&[prop]=[value]
```

| Parameter | Description |
|-----------|-------------|
| `[prop]` | Any property name from the component's `ComponentProperty` list |
| `[value]` | URL-encoded string value to apply. Booleans: `true`/`false`. Numbers: numeric string. |

**Behaviour**: Each recognised query parameter overrides the default value for that property in the rendered component. Unrecognised parameters are silently ignored.

**Example**:
```
chrome-extension://[ID]/components/hero-banner/?title=Example%20Hero&theme=dark
```

---

## Internal Messaging Contract

Content scripts communicate with the service worker via `chrome.runtime.sendMessage`. Message shapes:

### `ANALYSE_PAGE` (content → background)

Sent when the content script finishes page analysis.

```json
{
  "type": "ANALYSE_PAGE",
  "payload": {
    "pageUrl": "https://www.example.com",
    "pageTitle": "Example Domain",
    "framework": "react",
    "components": [
      {
        "slug": "hero-banner",
        "displayName": "Hero Banner",
        "sourceType": "framework",
        "frameworkName": "HeroBanner",
        "instanceCount": 1,
        "properties": [
          { "name": "title", "defaultValue": "Welcome", "type": "string", "source": "prop" },
          { "name": "theme", "defaultValue": "light", "type": "string", "source": "prop" }
        ]
      }
    ]
  }
}
```

### `GET_COMPONENTS` (extension page → background)

Requested by the components index page on load.

```json
{ "type": "GET_COMPONENTS", "payload": { "pageUrl": "https://www.example.com" } }
```

**Response**:
```json
{
  "pageRecord": { "url": "…", "framework": "react", "analyzedAt": 1753833600000 },
  "components": [ { "slug": "hero-banner", "displayName": "Hero Banner", "properties": [] } ]
}
```

### `GET_SNAPSHOT` (extension page → background)

Requested by the individual component view to retrieve isolated HTML+CSS.

```json
{ "type": "GET_SNAPSHOT", "payload": { "componentId": "[page-hash]:hero-banner" } }
```

**Response**:
```json
{
  "html": "<div class=\"hero-banner\">…</div>",
  "css": ".hero-banner { … }"
}
```
