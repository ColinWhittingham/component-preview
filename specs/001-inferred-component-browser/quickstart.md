# Quickstart Validation Guide: Inferred Component Browser

**Date**: 2026-07-30

---

## Prerequisites

- Chrome browser (stable channel, 116+)
- Node.js 20+ installed
- Extension built (see build steps below)

---

## Setup

```sh
cd /c/Git/component-preview
npm install
npm run build
```

Load the extension in Chrome:
1. Navigate to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select `dist/` folder
4. Note the extension ID shown on the card (e.g., `abcdefghijklmnopqrstuvwxyz123456`)

---

## Validation Scenarios

### Scenario 1 — Component index loads for a React page

1. Navigate to a React application (e.g., `https://react.dev`)
2. Click the extension icon in the toolbar → click **Analyse Page**
3. Popup shows a component count and a link to the index
4. Click the link

**Expected**: `chrome-extension://[ID]/components/?page=https%3A%2F%2Freact.dev` loads a grid of labelled component cards with visual previews. At least one component name matches a React component name (not a generic HTML tag).

---

### Scenario 2 — Component index loads for a plain HTML page

1. Navigate to `https://example.com`
2. Activate the extension → **Analyse Page**

**Expected**: Index page lists at least one component (likely `main-1` or `section-1` based on semantic HTML). No error or blank page is shown.

---

### Scenario 3 — Individual component renders in isolation

1. From any component index page, click a component card.

**Expected**: Navigates to `chrome-extension://[ID]/components/[slug]/`. The component renders without any surrounding page content. The URL is in the browser address bar and can be copied.

---

### Scenario 4 — Query string props update the component

1. From an individual component page (e.g., `.../components/hero-banner/`)
2. Append `?title=Hello+World` to the URL and press Enter.

**Expected**: The component re-renders. The title text visible in the component changes to "Hello World". No page reload error.

---

### Scenario 5 — URL is shareable

1. Copy the component URL with query string from Scenario 4.
2. Open a new Chrome window with the same extension installed.
3. Paste the URL and navigate.

**Expected**: The same component renders with the same props. No "Not Found" error.

---

### Scenario 6 — Unknown query string key is ignored

1. Navigate to `chrome-extension://[ID]/components/hero-banner/?unknownProp=foo`

**Expected**: Component renders with default props. No error message or broken layout.

---

## What to Check If a Scenario Fails

- **Blank index page**: Open DevTools on the extension page → Console. Check for `GET_COMPONENTS` message errors. Verify `chrome.storage.local` has data (`chrome.storage.local.get(null, console.log)` in background service worker console).
- **Component renders broken/unstyled**: Check that the CSS snapshot was captured (`GET_SNAPSHOT` response in DevTools). Try on a page with less aggressive style scoping.
- **Framework not detected**: Check background service worker console for framework detection logs. Confirm the page uses a detectable framework (React DevTools hook present).
- **Service worker routing fails**: Navigate directly to `chrome-extension://[ID]/components/index.html?page=…` (bypassing SW rewrite) to verify the SPA itself works, then debug the SW fetch handler.

---

## Key Artifacts

- URL contract: [contracts/url-contract.md](contracts/url-contract.md)
- Data model: [data-model.md](data-model.md)
- Spec: [spec.md](spec.md)
