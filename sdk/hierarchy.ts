// Significance-filtered DOM tree capture for AI consumption.
// Produces a lightweight hierarchical representation of the page
// with component associations marked at matching nodes.

import type { HierarchyNode, PageHierarchy } from './types';

const SEMANTIC_TAGS = /^(HEADER|NAV|MAIN|SECTION|ARTICLE|ASIDE|FOOTER|FORM|H[1-6])$/i;
const FRAMEWORK_CLASS_RE = /^(ng-|_ng|data-v-|__react|css-[a-z0-9]{6,})/;
const MAX_DEPTH = 20;
const MAX_NODES = 500;

function isFrameworkClass(cls: string): boolean {
  return FRAMEWORK_CLASS_RE.test(cls);
}

function getDirectText(el: Element): string {
  let text = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += (node.textContent ?? '').trim() + ' ';
    }
  }
  return text.trim();
}

export function buildPageHierarchy(
  componentSlugs: Map<Element, string>,
): PageHierarchy {
  let nodeCount = 0;

  function walk(el: Element, depth: number): HierarchyNode | null {
    if (depth > MAX_DEPTH || nodeCount >= MAX_NODES) return null;

    const rect = el.getBoundingClientRect();
    const isSizable = rect.width > 20 && rect.height > 10;
    const isSemantic = SEMANTIC_TAGS.test(el.tagName);
    const isComponent = componentSlugs.has(el);

    if (!isSizable && !isSemantic && !isComponent) return null;

    const children: HierarchyNode[] = [];
    for (const child of Array.from(el.children)) {
      if (nodeCount >= MAX_NODES) break;
      const childNode = walk(child, depth + 1);
      if (childNode) children.push(childNode);
    }

    // Flatten wrapper nodes: div/span with no visual identity, no text,
    // no component match, and exactly one child
    const directText = getDirectText(el);
    const computed = window.getComputedStyle(el);
    const bg = computed.backgroundColor;
    const hasVisualIdentity = (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') ||
      computed.backgroundImage !== 'none';

    const isWrapper = !isComponent &&
      children.length === 1 &&
      !directText &&
      !hasVisualIdentity &&
      /^(DIV|SPAN)$/i.test(el.tagName);

    if (isWrapper) return children[0];

    nodeCount++;

    const node: HierarchyNode = {
      tag: el.tagName.toLowerCase(),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      children,
    };

    if (el.id) node.id = el.id;
    const classes = Array.from(el.classList).filter(c => !isFrameworkClass(c));
    if (classes.length > 0) node.classes = classes.slice(0, 5);
    const role = el.getAttribute('role');
    if (role) node.role = role;

    const display = computed.display;
    if (display && display !== 'block') node.display = display;
    const position = computed.position;
    if (position && position !== 'static') node.position = position;
    if (hasVisualIdentity) node.backgroundColor = bg;
    const fontSize = computed.fontSize;
    if (fontSize && parseFloat(fontSize) >= 18) node.fontSize = fontSize;
    const fontWeight = computed.fontWeight;
    if (fontWeight && parseInt(fontWeight) >= 600) node.fontWeight = fontWeight;

    if (directText) node.textContent = directText.slice(0, 200);
    const firstImg = el.querySelector('img');
    if (firstImg) {
      const src = firstImg.getAttribute('src') || firstImg.getAttribute('data-src');
      if (src) {
        try { node.imageSrc = new URL(src, document.baseURI).href; }
        catch { node.imageSrc = src; }
      }
    }

    const slug = componentSlugs.get(el);
    if (slug) node.componentSlug = slug;

    return node;
  }

  const rootNode = walk(document.body, 0) ?? {
    tag: 'body', width: 0, height: 0, children: [],
  };

  return { rootNode, capturedAt: Date.now(), nodeCount };
}
