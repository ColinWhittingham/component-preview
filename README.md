# Component Preview

Inferred Storybook for pages you don't own. A Chrome extension and standalone SDK that identifies UI components on any web page, captures them with high-fidelity snapshots, and exposes them via a browsable, configurable preview interface.

## What it does

- **Detects UI components** from any web page — React, Vue, Angular, or plain HTML
- **Captures snapshots** with inline styles, matched CSS rules, and original class names
- **Renders components in isolation** via a predictable URL pattern
- **Configurable properties** — text, themes, variants — editable via a prop panel or URL query string
- **Exports for AI** — "Copy for AI" produces a self-contained HTML document with clean CSS and a hierarchical page structure, ready to paste into an AI chat tool

## Architecture

```
sdk/                    # Standalone SDK (zero Chrome APIs)
├── index.ts            # Public API: ComponentPreview.analyse()
├── analyzer.ts         # Component detection (3-tier HTML, React/Vue/Angular)
├── snapshot.ts         # Inline-styled DOM cloning
├── css-extractor.ts    # document.styleSheets CSS extraction
├── hierarchy.ts        # Significance-filtered DOM tree
├── clean-snapshot.ts   # Class-preserving HTML (no inline styles)
├── property-inferrer.ts # Theme/variant/breakpoint inference from CSS
├── export-builder.ts   # Self-contained HTML document assembly
├── slug.ts             # Component slug generation
└── types.ts            # Shared type definitions

src/                    # Chrome extension wrapper
├── background/         # Service worker (storage, message routing)
├── content/            # Bridge script (postMessage relay)
├── popup/              # "Analyse Page" button
└── components/         # SPA views (index grid, component detail, prop panel)
```

The SDK does all analysis work — the extension just injects it and stores/displays results.

## Quick start

### Chrome extension

```bash
npm install
npm run build
```

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click "Load unpacked" → select `dist/`
4. Visit any page → click the extension icon → "Analyse Page"

### Standalone SDK (drop-in script)

```html
<script src="dist/sdk/component-preview-sdk.js"></script>
<script>
  ComponentPreview.analyse().then(result => {
    console.log(result.components); // detected components with snapshots
  });
</script>
```

## Preview rendering

Components render through a three-tier cascade, using the best available CSS source:

| Tier | Source | When |
|------|--------|------|
| **Live CSS** | Original `<link>` stylesheets | Stylesheet URLs are accessible |
| **Hybrid CSS** | Matched CSS rules from `document.styleSheets` | CSS rule coverage > 70% |
| **Inline styles** | `getComputedStyle` baked onto every element | Always (fallback) |

## URL scheme

```
chrome-extension://[ID]/components/?page=[encoded-url]           # Component index
chrome-extension://[ID]/components/[slug]/                       # Isolated component
chrome-extension://[ID]/components/[slug]/?heading=Hello&theme=dark  # With prop overrides
```

## Component properties

The SDK detects configurable properties from multiple sources:

- **HTML content**: headings, body text, images, buttons, links
- **Framework props**: React `memoizedProps`, Vue `props`, Angular component inputs
- **CSS patterns**: `[data-theme]` attribute selectors, BEM class variants, `@media` breakpoints

Properties are editable in the prop panel and via URL query string.

## Export for AI

Click "Copy for AI" on any component to get a self-contained HTML document:

```html
<!--
  Component: Hero Section
  Source: https://www.example.com/
  Properties:
    heading (slot): "Welcome"
    buttonText (slot): "Get Started"
    theme (css-attribute): "light"
-->
<!-- PAGE_HIERARCHY
{ "rootNode": { "tag": "body", ... }, "nodeCount": 42 }
-->
<!DOCTYPE html>
<html>
<head>
  <style>
    :root { --primary: #2563eb; }
    .hero { display: flex; padding: 64px; }
    .hero__cta { background: var(--primary); }
  </style>
</head>
<body>
  <div class="hero">
    <h1>Welcome</h1>
    <a class="hero__cta">Get Started</a>
  </div>
</body>
</html>
```

The export includes matched CSS rules with real selectors (not inline styles), design tokens, font faces, and a hierarchical page structure in a JSON comment block.

## Development

```bash
npm run build        # Build extension + SDK
npm run build:watch  # Watch mode
npm test             # Run tests
npm run test:watch   # Watch mode
```

## License

MIT
