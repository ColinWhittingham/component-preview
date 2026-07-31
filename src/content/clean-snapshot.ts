// Produces clean HTML from a DOM element: original class names preserved,
// inline styles removed, framework noise stripped, resource URLs resolved.

const FRAMEWORK_ATTR_PATTERNS = [
  /^_ngcontent-/,
  /^_nghost-/,
  /^ng-/,
  /^data-v-/,
  /^data-reactid$/,
  /^data-react-/,
];

function isFrameworkAttr(name: string): boolean {
  return FRAMEWORK_ATTR_PATTERNS.some(p => p.test(name));
}

function resolveUrl(url: string, baseURI: string): string {
  try { return new URL(url, baseURI).href; } catch { return url; }
}

export function captureCleanHtml(el: Element): string {
  const baseURI = el.ownerDocument.baseURI;
  const clone = el.cloneNode(true) as Element;

  // Remove inline styles — CSS will come from matched rules via CDP
  removeInlineStyles(clone);

  // Remove framework-internal attributes
  removeFrameworkAttrs(clone);

  // Resolve resource URLs to absolute
  resolveResources(clone, baseURI);

  return clone.outerHTML;
}

function removeInlineStyles(root: Element): void {
  root.removeAttribute('style');
  root.querySelectorAll('[style]').forEach(el => el.removeAttribute('style'));
}

function removeFrameworkAttrs(root: Element): void {
  stripAttrs(root);
  root.querySelectorAll('*').forEach(stripAttrs);
}

function stripAttrs(el: Element): void {
  const toRemove: string[] = [];
  for (const attr of Array.from(el.attributes)) {
    if (isFrameworkAttr(attr.name)) toRemove.push(attr.name);
  }
  toRemove.forEach(name => el.removeAttribute(name));
}

function resolveResources(root: Element, baseURI: string): void {
  root.querySelectorAll('img').forEach(img => {
    if (img.getAttribute('src')) img.setAttribute('src', resolveUrl(img.getAttribute('src')!, baseURI));
    if (img.getAttribute('srcset')) {
      img.setAttribute('srcset', resolveSrcset(img.getAttribute('srcset')!, baseURI));
    }
    img.removeAttribute('loading');
  });
  root.querySelectorAll('source[srcset]').forEach(s => {
    s.setAttribute('srcset', resolveSrcset(s.getAttribute('srcset')!, baseURI));
  });
  root.querySelectorAll('a[href]').forEach(a => {
    a.setAttribute('href', resolveUrl(a.getAttribute('href')!, baseURI));
  });
  root.querySelectorAll('video[poster]').forEach(v => {
    v.setAttribute('poster', resolveUrl(v.getAttribute('poster')!, baseURI));
  });
}

function resolveSrcset(srcset: string, baseURI: string): string {
  return srcset
    .split(',')
    .map(entry => {
      const parts = entry.trim().split(/\s+/);
      parts[0] = resolveUrl(parts[0], baseURI);
      return parts.join(' ');
    })
    .join(', ');
}

// Generate a unique CSS selector path for an element (used to identify it via CDP)
export function getSelectorPath(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== document.documentElement) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector = `#${CSS.escape(current.id)}`;
      parts.unshift(selector);
      break;
    }
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(c => c.tagName === current!.tagName);
      if (siblings.length > 1) {
        const idx = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${idx})`;
      }
    }
    parts.unshift(selector);
    current = parent;
  }
  return parts.join(' > ');
}
