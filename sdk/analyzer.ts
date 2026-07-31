import { generateSlug, toDisplayName } from './slug';
import { captureSnapshot } from './snapshot';
import { captureCleanHtml, getSelectorPath } from './clean-snapshot';
import { extractCssForElement, extractMatchedStyleRules } from './css-extractor';
import { inferPropertiesFromCss, mergeProperties } from './property-inferrer';
import { buildPageHierarchy } from './hierarchy';
import type { InferredProperty } from './property-inferrer';
import type {
  Framework,
  ComponentProperty,
  AnalysisResult,
  AnalysedComponent,
} from './types';

interface RawComponent {
  slug: string;
  displayName: string;
  sourceType: 'framework' | 'html';
  frameworkName: string | null;
  instanceCount: number;
  properties: ComponentProperty[];
  snapshot: { html: string; css: string };
  selectorPath: string;
  cleanHtml: string;
  element: Element;
}

// ── HTML component detection ─────────────────────────────────────────────────

// Tier 1: explicit component-like elements (forms, search, cards, heroes)
const COMPONENT_SELECTORS = [
  'form',
  '[role="search"]',
  '[role="form"]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="tabpanel"]',
  '[role="tablist"]',
  '[data-component]',
  '[data-block]',
  '[data-module]',
  '[data-section]',
  '[data-testid]',
];

// Tier 2: semantic regions that often represent self-contained components
const REGION_SELECTORS = [
  'header:not(header header)',
  'nav',
  'article',
  'aside',
  'footer:not(footer footer)',
  'section',
  '[role="banner"]',
  '[role="navigation"]',
  '[role="complementary"]',
  '[role="contentinfo"]',
];

// Container tags that are layout wrappers, not components themselves
const CONTAINER_TAGS = new Set(['MAIN', 'BODY', 'HTML', 'DIV', 'SPAN']);

function isSignificant(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 80 && rect.height > 40;
}

function hasVisualIdentity(el: Element): boolean {
  const style = window.getComputedStyle(el);
  const bg = style.backgroundColor;
  const hasBg = bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
  const hasBgImage = style.backgroundImage !== 'none';
  const hasBorder = style.borderWidth !== '0px' && style.borderStyle !== 'none';
  const hasShadow = style.boxShadow !== 'none';
  const hasPadding = parseInt(style.paddingTop) + parseInt(style.paddingBottom) > 16;
  return hasBg || hasBgImage || hasBorder || hasShadow || hasPadding;
}

function hasRichContent(el: Element): boolean {
  const hasHeading = el.querySelector('h1, h2, h3, h4') !== null;
  const hasImage = el.querySelector('img, picture, video, svg') !== null;
  const hasCta = el.querySelector('a, button, [role="button"]') !== null;
  const hasForm = el.querySelector('form, input, textarea, select') !== null;
  const hasLargeText = Array.from(el.querySelectorAll('span, p, div')).some(child => {
    const fontSize = parseFloat(window.getComputedStyle(child).fontSize);
    return fontSize >= 24 && (child.textContent?.trim().length ?? 0) > 3;
  });
  const hasHeadingLike = hasHeading || hasLargeText;
  return (hasHeadingLike && hasCta) || (hasImage && (hasHeadingLike || hasCta)) || hasForm;
}

function expandToVisualContainer(el: Element): Element {
  let current = el.parentElement;
  let best = el;
  let depth = 0;

  while (current && current !== document.body && depth < 4) {
    const parentHasBg = hasVisualIdentity(current);
    const parentStyle = window.getComputedStyle(current);
    const parentIsLayoutContainer =
      parentStyle.display === 'grid' || parentStyle.display === 'inline-grid' ||
      parentStyle.display === 'flex' || parentStyle.display === 'inline-flex';
    const parentHasSiblingContent = Array.from(current.children).some(child =>
      child !== el && child !== best && isSignificant(child) &&
      (child.querySelector('h1, h2, h3, img, picture') !== null ||
       parseFloat(window.getComputedStyle(child).fontSize) >= 24)
    );

    if (parentHasBg || parentHasSiblingContent ||
        (parentIsLayoutContainer && parentHasSiblingContent)) {
      best = current;
      if (parentHasBg && parentHasSiblingContent) break;
    }
    current = current.parentElement;
    depth++;
  }
  return best;
}

function extractHtmlProperties(el: Element): ComponentProperty[] {
  const props: ComponentProperty[] = [];
  const seen = new Set<string>();

  function add(name: string, value: string, source: ComponentProperty['source']) {
    if (seen.has(name) || !value.trim() || value.length > 300) return;
    seen.add(name);
    props.push({ name, defaultValue: value.trim(), type: 'string', source });
  }

  const rootAttrs: Record<string, string> = {
    'title': 'title', 'aria-label': 'ariaLabel',
    'data-theme': 'theme', 'data-variant': 'variant',
  };
  for (const [attr, propName] of Object.entries(rootAttrs)) {
    const val = el.getAttribute(attr);
    if (val) add(propName, val, 'attribute');
  }

  const headings = el.querySelectorAll('h1, h2, h3, h4, h5, h6');
  headings.forEach((h, i) => {
    const text = h.textContent?.trim();
    if (text) {
      const name = i === 0 ? 'heading' : `heading${i + 1}`;
      add(name, text, 'slot');
    }
  });

  const paragraphs = el.querySelectorAll('p');
  for (const p of Array.from(paragraphs)) {
    const text = p.textContent?.trim();
    if (text && text.length > 10) {
      add('bodyText', text, 'slot');
      break;
    }
  }

  const images = el.querySelectorAll('img');
  for (const img of Array.from(images)) {
    const src = img.getAttribute('src') || img.getAttribute('data-src');
    if (src) {
      try {
        add('imageSrc', new URL(src, document.baseURI).href, 'attribute');
      } catch {
        add('imageSrc', src, 'attribute');
      }
      const alt = img.getAttribute('alt');
      if (alt) add('imageAlt', alt, 'attribute');
      break;
    }
  }

  const buttons = el.querySelectorAll('button, a.btn, a.button, a.cta, [role="button"], input[type="submit"]');
  for (const btn of Array.from(buttons)) {
    const text = btn.textContent?.trim() ||
                 (btn as HTMLInputElement).value;
    if (text) {
      add('buttonText', text, 'slot');
      const href = btn.getAttribute('href');
      if (href) {
        try { add('buttonHref', new URL(href, document.baseURI).href, 'attribute'); } catch { /* skip */ }
      }
      break;
    }
  }

  const links = el.querySelectorAll('a[href]');
  let linkIdx = 0;
  for (const a of Array.from(links)) {
    if (linkIdx >= 3) break;
    const text = a.textContent?.trim();
    if (text && text.length > 1 && text.length < 100) {
      const name = linkIdx === 0 ? 'linkText' : `linkText${linkIdx + 1}`;
      add(name, text, 'slot');
      linkIdx++;
    }
  }

  const inputs = el.querySelectorAll('input[placeholder], textarea[placeholder]');
  for (const input of Array.from(inputs)) {
    const ph = input.getAttribute('placeholder');
    if (ph) { add('placeholder', ph, 'attribute'); break; }
  }

  return props;
}

function findVisualBlocks(root: Element, alreadyFound: Set<Element>, maxDepth = 5): Element[] {
  if (maxDepth <= 0) return [];
  const blocks: Element[] = [];
  for (const child of Array.from(root.children)) {
    if (alreadyFound.has(child) || !isSignificant(child)) continue;

    const isComponent =
      hasVisualIdentity(child) ||
      hasRichContent(child) ||
      !CONTAINER_TAGS.has(child.tagName);

    if (isComponent) {
      blocks.push(child);
    } else {
      blocks.push(...findVisualBlocks(child, alreadyFound, maxDepth - 1));
    }
  }
  return blocks;
}

function detectHtmlComponents(): RawComponent[] {
  const found = new Set<Element>();
  const ordered: Element[] = [];

  function addCandidate(el: Element) {
    if (found.has(el) || !isSignificant(el)) return;
    found.add(el);
    ordered.push(el);
  }

  // Tier 1: explicit component markers — expand to visual container
  for (const sel of COMPONENT_SELECTORS) {
    try {
      document.querySelectorAll(sel).forEach(el => {
        addCandidate(expandToVisualContainer(el));
      });
    } catch { /* skip */ }
  }

  // Tier 2: semantic regions
  for (const sel of REGION_SELECTORS) {
    try {
      for (const el of Array.from(document.querySelectorAll(sel))) {
        if (!isSignificant(el)) continue;
        const rect = el.getBoundingClientRect();
        const isLargeContainer = rect.height > window.innerHeight * 0.6;

        if (isLargeContainer) {
          const blocks = findVisualBlocks(el, found);
          if (blocks.length >= 2) {
            blocks.forEach(addCandidate);
          } else {
            addCandidate(el);
          }
        } else {
          addCandidate(el);
        }
      }
    } catch { /* skip */ }
  }

  // Tier 3: visual blocks in main/body
  const mainEl = document.querySelector('main') ?? document.body;
  const extraBlocks = findVisualBlocks(mainEl, found, 6);
  extraBlocks.forEach(addCandidate);

  // Deduplicate: prefer children over parents
  const deduplicated = ordered.filter((el) => {
    const hasChildMatch = ordered.some((other) => other !== el && el.contains(other));
    if (!hasChildMatch) return true;
    const rect = el.getBoundingClientRect();
    return rect.height < window.innerHeight * 0.4;
  });

  const existingSlugs = new Set<string>();
  return deduplicated.map((el, idx) => {
    const slug = generateSlug(el, { frameworkName: null, existingSlugs, index: idx });
    return {
      slug,
      displayName: toDisplayName(slug),
      sourceType: 'html' as const,
      frameworkName: null,
      instanceCount: 1,
      properties: extractHtmlProperties(el),
      snapshot: captureSnapshot(el),
      selectorPath: getSelectorPath(el),
      cleanHtml: captureCleanHtml(el),
      element: el,
    };
  });
}

// ── React fiber detection ─────────────────────────────────────────────────────

function getReactFiberKey(el: Element): string | null {
  return Object.keys(el).find(
    (k) => k.startsWith('__reactFiber') || k.startsWith('_reactFiber')
  ) ?? null;
}

function getFiberName(fiber: Record<string, unknown>): string | null {
  const type = fiber['type'];
  if (!type) return null;
  if (typeof type === 'function') {
    return (
      (type as { displayName?: string }).displayName ||
      (type as { name?: string }).name ||
      null
    );
  }
  return null;
}

function detectReactComponents(): RawComponent[] | null {
  const hook = (window as Record<string, unknown>)['__REACT_DEVTOOLS_GLOBAL_HOOK__'];
  const renderers = (hook as { renderers?: Map<number, unknown> } | undefined)?.renderers;
  if (!renderers || renderers.size === 0) return null;

  const seen = new Set<string>();
  const components: RawComponent[] = [];
  const existingSlugs = new Set<string>();

  for (const el of Array.from(document.querySelectorAll('*'))) {
    const key = getReactFiberKey(el);
    if (!key) continue;
    const fiber = (el as unknown as Record<string, Record<string, unknown>>)[key];
    const name = getFiberName(fiber);
    if (!name || name === 'Fragment' || seen.has(name)) continue;
    seen.add(name);

    const memoizedProps = fiber['memoizedProps'] as Record<string, unknown> | null;
    const properties: ComponentProperty[] = [];
    if (memoizedProps) {
      for (const [k, v] of Object.entries(memoizedProps)) {
        if (k === 'children' || typeof v === 'function' || (v !== null && typeof v === 'object')) continue;
        properties.push({
          name: k,
          defaultValue: String(v),
          type: typeof v === 'boolean' ? 'boolean' : typeof v === 'number' ? 'number' : 'string',
          source: 'prop',
        });
      }
    }

    const slug = generateSlug(el, { frameworkName: name, existingSlugs, index: components.length });
    components.push({
      slug,
      displayName: toDisplayName(slug),
      sourceType: 'framework',
      frameworkName: name,
      instanceCount: 1,
      properties,
      snapshot: captureSnapshot(el),
      selectorPath: getSelectorPath(el),
      cleanHtml: captureCleanHtml(el),
      element: el,
    });
  }
  return components.length > 0 ? components : null;
}

// ── Vue 3 detection ────────────────────────────────────────────────────────────

function detectVueComponents(): RawComponent[] | null {
  const seen = new Set<string>();
  const components: RawComponent[] = [];
  const existingSlugs = new Set<string>();

  for (const el of Array.from(document.querySelectorAll('*'))) {
    const vueComp = (el as unknown as Record<string, Record<string, unknown> | undefined>)['__vueParentComponent'];
    if (!vueComp) continue;
    const type = vueComp['type'] as Record<string, unknown> | null;
    if (!type) continue;
    const name = ((type['__name'] as string | undefined) || (type['name'] as string | undefined)) ?? null;
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const vueProps = vueComp['props'] as Record<string, unknown> | null;
    const properties: ComponentProperty[] = [];
    if (vueProps) {
      for (const [k, v] of Object.entries(vueProps)) {
        if (typeof v === 'function' || (v !== null && typeof v === 'object')) continue;
        properties.push({
          name: k,
          defaultValue: String(v),
          type: typeof v === 'boolean' ? 'boolean' : typeof v === 'number' ? 'number' : 'string',
          source: 'prop',
        });
      }
    }

    const slug = generateSlug(el, { frameworkName: name, existingSlugs, index: components.length });
    components.push({
      slug,
      displayName: toDisplayName(slug),
      sourceType: 'framework',
      frameworkName: name,
      instanceCount: 1,
      properties,
      snapshot: captureSnapshot(el),
      selectorPath: getSelectorPath(el),
      cleanHtml: captureCleanHtml(el),
      element: el,
    });
  }
  return components.length > 0 ? components : null;
}

// ── Angular Ivy detection ──────────────────────────────────────────────────────

function detectAngularComponents(): RawComponent[] | null {
  const ng = (window as Record<string, unknown>)['ng'] as Record<string, unknown> | undefined;
  if (!ng || typeof ng['getComponent'] !== 'function') return null;

  const seen = new Set<string>();
  const components: RawComponent[] = [];
  const existingSlugs = new Set<string>();

  for (const el of Array.from(document.querySelectorAll('*'))) {
    try {
      const comp = (ng['getComponent'] as (el: Element) => Record<string, unknown> | null)(el);
      if (!comp) continue;
      const name = (comp.constructor as { name?: string } | undefined)?.name ?? null;
      if (!name || name === 'Object' || seen.has(name)) continue;
      seen.add(name);

      const properties: ComponentProperty[] = [];
      for (const [k, v] of Object.entries(comp)) {
        if (k.startsWith('_') || typeof v === 'function' || (v !== null && typeof v === 'object')) continue;
        properties.push({
          name: k,
          defaultValue: String(v),
          type: typeof v === 'boolean' ? 'boolean' : typeof v === 'number' ? 'number' : 'string',
          source: 'prop',
        });
      }

      const slug = generateSlug(el, { frameworkName: name, existingSlugs, index: components.length });
      components.push({
        slug,
        displayName: toDisplayName(slug),
        sourceType: 'framework',
        frameworkName: name,
        instanceCount: 1,
        properties,
        snapshot: captureSnapshot(el),
        selectorPath: getSelectorPath(el),
        cleanHtml: captureCleanHtml(el),
        element: el,
      });
    } catch { /* skip */ }
  }
  return components.length > 0 ? components : null;
}

// ── Framework detection & main entry ─────────────────────────────────────────

function detectFramework(): Framework {
  const w = window as Record<string, unknown>;
  if (w['__REACT_DEVTOOLS_GLOBAL_HOOK__']) return 'react';
  if (Array.from(document.querySelectorAll('*')).some((el) => '__vueParentComponent' in el)) return 'vue';
  const ng = w['ng'] as Record<string, unknown> | undefined;
  if (ng && typeof ng['getComponent'] === 'function') return 'angular';
  return 'html';
}

function detectComponents(): { framework: Framework; components: RawComponent[] } {
  const framework = detectFramework();
  let components: RawComponent[] | null = null;

  if (framework === 'react') components = detectReactComponents();
  else if (framework === 'vue') components = detectVueComponents();
  else if (framework === 'angular') components = detectAngularComponents();

  if (!components || components.length === 0) {
    components = detectHtmlComponents();
  }

  return {
    framework: components.some((c) => c.sourceType === 'framework') ? framework : 'html',
    components,
  };
}

function extractMediaConditions(): string[] {
  const conditions: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        if (rule instanceof CSSMediaRule) {
          conditions.push(rule.conditionText);
        }
      }
    } catch { /* skip cross-origin */ }
  }
  return conditions;
}

// Enrich a single component with CSS data. Wrapped in a timeout so one
// slow component doesn't hang the entire analysis.
function collectStylesheetUrls(): string[] {
  const urls: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    if (sheet.href) {
      try { urls.push(new URL(sheet.href, document.baseURI).href); }
      catch { urls.push(sheet.href); }
    }
  }
  return urls;
}

async function enrichWithCss(raw: RawComponent, mediaConditions: string[], stylesheetUrls: string[]): Promise<AnalysedComponent> {
  let matchedCss = '';
  let designTokens = '';
  let fonts: string[] = [];
  let keyframes = '';
  let cssRuleCoverage = 0;
  let mergedProps = raw.properties;

  try {
    const extracted = await extractCssForElement(raw.element);
    matchedCss = [extracted.matchedRules, extracted.keyframes].filter(Boolean).join('\n\n');
    designTokens = extracted.designTokens;
    fonts = extracted.fonts;
    keyframes = extracted.keyframes;
    cssRuleCoverage = extracted.coverageRatio;

    const matchedStyleRules = extractMatchedStyleRules(raw.element);
    const cssProps = inferPropertiesFromCss(raw.element, matchedStyleRules, mediaConditions);
    mergedProps = mergeProperties(raw.properties as InferredProperty[], cssProps);
  } catch (err) {
    console.warn(`[ComponentPreview] CSS extraction failed for ${raw.slug}:`, err);
  }

  return {
    slug: raw.slug,
    displayName: raw.displayName,
    sourceType: raw.sourceType,
    frameworkName: raw.frameworkName,
    instanceCount: raw.instanceCount,
    properties: mergedProps,
    snapshot: raw.snapshot,
    cleanHtml: raw.cleanHtml,
    matchedCss,
    designTokens,
    fonts,
    keyframes,
    selectorPath: raw.selectorPath,
    cssRuleCoverage,
    stylesheetUrls,
  };
}

function rawToComponent(raw: RawComponent): AnalysedComponent {
  return {
    slug: raw.slug,
    displayName: raw.displayName,
    sourceType: raw.sourceType,
    frameworkName: raw.frameworkName,
    instanceCount: raw.instanceCount,
    properties: raw.properties,
    snapshot: raw.snapshot,
    cleanHtml: raw.cleanHtml,
    matchedCss: '',
    designTokens: '',
    fonts: [],
    keyframes: '',
    selectorPath: raw.selectorPath,
  };
}

// Fast synchronous analysis — component detection + inline-style snapshots + hierarchy.
export function analyseSync(): AnalysisResult {
  const { framework, components: rawComponents } = detectComponents();
  const stylesheetUrls = collectStylesheetUrls();

  const componentMap = new Map<Element, string>();
  rawComponents.forEach(raw => componentMap.set(raw.element, raw.slug));

  let hierarchy;
  try { hierarchy = buildPageHierarchy(componentMap); } catch { /* non-critical */ }

  return {
    pageUrl: window.location.href,
    pageTitle: document.title,
    framework,
    components: rawComponents.map(raw => ({
      ...rawToComponent(raw),
      stylesheetUrls,
    })),
    hierarchy,
  };
}

// Full async analysis — includes CSS extraction, property inference, and hierarchy.
export async function analyse(): Promise<AnalysisResult> {
  const { framework, components: rawComponents } = detectComponents();
  const mediaConditions = extractMediaConditions();
  const stylesheetUrls = collectStylesheetUrls();

  const componentMap = new Map<Element, string>();
  rawComponents.forEach(raw => componentMap.set(raw.element, raw.slug));

  let hierarchy;
  try { hierarchy = buildPageHierarchy(componentMap); } catch { /* non-critical */ }

  const components = await Promise.all(
    rawComponents.map(raw =>
      enrichWithCss(raw, mediaConditions, stylesheetUrls).catch((err) => {
        console.warn(`[ComponentPreview] CSS enrichment failed for ${raw.slug}:`, err);
        return { ...rawToComponent(raw), stylesheetUrls };
      })
    )
  );

  return {
    pageUrl: window.location.href,
    pageTitle: document.title,
    framework,
    components,
    hierarchy,
  };
}
