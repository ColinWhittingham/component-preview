import type {
  Message,
  GetComponentsPayload,
  GetComponentsResponse,
  GetSnapshotPayload,
  GetSnapshotResponse,
  FindComponentBySlugPayload,
  FindComponentBySlugResponse,
  ExportComponentPayload,
  ExportableComponent,
  HierarchyNode,
  PageHierarchy,
  ComponentRecord,
  ComponentProperty,
} from '../../shared/types';
import { buildPreviewFrame, getActiveRenderingTier } from './preview-frame';

// Find the deepest text node within an element, for setting text without
// destroying inner element structure (e.g. <button><span>Submit</span></button>)
function findDeepestTextNode(el: Element): Node | null {
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) return child;
  }
  for (const child of Array.from(el.children)) {
    const found = findDeepestTextNode(child);
    if (found) return found;
  }
  return null;
}

const PROP_SELECTORS: Record<string, { selector: string; apply: 'text' | 'src' | 'href' | 'alt' | 'attr' | 'placeholder' }> = {
  heading:      { selector: 'h1, h2, h3, h4, h5, h6', apply: 'text' },
  heading2:     { selector: 'h1 ~ h2, h2 ~ h3, h3 ~ h4, h2, h3, h4', apply: 'text' },
  heading3:     { selector: 'h3, h4, h5', apply: 'text' },
  bodyText:     { selector: 'p', apply: 'text' },
  imageSrc:     { selector: 'img', apply: 'src' },
  imageAlt:     { selector: 'img', apply: 'alt' },
  buttonText:   { selector: 'button, a.btn, a.button, a.cta, [role="button"], input[type="submit"]', apply: 'text' },
  buttonHref:   { selector: 'a.btn, a.button, a.cta, [role="button"]', apply: 'href' },
  linkText:     { selector: 'a[href]', apply: 'text' },
  linkText2:    { selector: 'a[href]:nth-of-type(2)', apply: 'text' },
  linkText3:    { selector: 'a[href]:nth-of-type(3)', apply: 'text' },
  placeholder:  { selector: 'input[placeholder], textarea[placeholder]', apply: 'placeholder' },
  title:        { selector: '[title]', apply: 'attr' },
  ariaLabel:    { selector: '[aria-label]', apply: 'attr' },
};

function applyPropsToHtml(html: string, props: ComponentProperty[], params: URLSearchParams): string {
  let doc: Document;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(html, 'text/html');
  } catch {
    return html;
  }

  const root = doc.body.firstElementChild;
  if (!root) return html;

  for (const prop of props) {
    const overrideValue = params.get(prop.name);
    if (overrideValue === null) continue;

    const mapping = PROP_SELECTORS[prop.name];
    if (mapping) {
      const el = root.querySelector(mapping.selector);
      if (el) {
        switch (mapping.apply) {
          case 'text':
            if (el.tagName === 'INPUT') {
              el.setAttribute('value', overrideValue);
            } else {
              // Find the deepest text node to preserve inner element structure
              const textNode = findDeepestTextNode(el);
              if (textNode) textNode.textContent = overrideValue;
              else el.textContent = overrideValue;
            }
            break;
          case 'src': el.setAttribute('src', overrideValue); break;
          case 'href': el.setAttribute('href', overrideValue); break;
          case 'alt': el.setAttribute('alt', overrideValue); break;
          case 'placeholder': el.setAttribute('placeholder', overrideValue); break;
          case 'attr': {
            const attrName = prop.name === 'ariaLabel' ? 'aria-label' : prop.name;
            el.setAttribute(attrName, overrideValue);
            break;
          }
        }
        continue;
      }
    }

    // Set data-* attribute on root and any descendants that have it
    const attrName = `data-${prop.name}`;
    if (root.hasAttribute(attrName)) root.setAttribute(attrName, overrideValue);
    root.querySelectorAll(`[${attrName}]`).forEach(el => {
      el.setAttribute(attrName, overrideValue);
    });
    // Also try class-based swapping
    if (prop.defaultValue) {
      if (root.classList.contains(prop.defaultValue)) {
        root.classList.remove(prop.defaultValue);
        root.classList.add(overrideValue);
      }
      root.querySelectorAll(`.${CSS.escape(prop.defaultValue)}`).forEach(el => {
        el.classList.remove(prop.defaultValue);
        el.classList.add(overrideValue);
      });
    }
  }

  return doc.body.innerHTML;
}

// Apply prop overrides to the live iframe DOM (for instant feedback without reload)
function applyPropsToIframe(iframe: HTMLIFrameElement, props: ComponentProperty[], params: URLSearchParams): void {
  const iframeDoc = iframe.contentDocument;
  if (!iframeDoc) return;
  const root = iframeDoc.body.firstElementChild;
  if (!root) return;

  for (const prop of props) {
    const overrideValue = params.get(prop.name);
    if (overrideValue === null) continue;

    const mapping = PROP_SELECTORS[prop.name];
    if (mapping) {
      const el = root.querySelector(mapping.selector);
      if (el) {
        switch (mapping.apply) {
          case 'text':
            if (el.tagName === 'INPUT') {
              el.setAttribute('value', overrideValue);
            } else {
              // Find the deepest text node to preserve inner element structure
              const textNode = findDeepestTextNode(el);
              if (textNode) textNode.textContent = overrideValue;
              else el.textContent = overrideValue;
            }
            break;
          case 'src': el.setAttribute('src', overrideValue); break;
          case 'href': el.setAttribute('href', overrideValue); break;
          case 'alt': el.setAttribute('alt', overrideValue); break;
          case 'placeholder': el.setAttribute('placeholder', overrideValue); break;
          case 'attr': {
            const attrName = prop.name === 'ariaLabel' ? 'aria-label' : prop.name;
            el.setAttribute(attrName, overrideValue);
            break;
          }
        }
        continue;
      }
    }

    // CSS-attribute sourced properties: set data-* attribute
    if (prop.source === 'css-attribute') {
      root.setAttribute(`data-${prop.name}`, overrideValue);
      // Also walk descendant elements that might have the same attribute
      root.querySelectorAll(`[data-${prop.name}]`).forEach(el => {
        el.setAttribute(`data-${prop.name}`, overrideValue);
      });
      continue;
    }

    // CSS-class sourced properties: toggle BEM modifier classes
    if (prop.source === 'css-class') {
      if (prop.values) {
        // Remove all variant classes, add the new one
        for (const val of prop.values) {
          // Try BEM pattern: block--modifier
          root.classList.forEach(cls => {
            if (cls.endsWith(`--${val}`)) root.classList.remove(cls);
          });
          // Try state pattern: is-state / has-state
          root.classList.remove(`is-${val}`, `has-${val}`);
        }
        // Add new variant
        if (prop.type === 'boolean') {
          if (overrideValue === 'true') root.classList.add(`is-${prop.name.replace(/^is/, '').replace(/^[A-Z]/, c => c.toLowerCase())}`);
        } else {
          // Find the BEM block prefix from current classes
          const blockPrefix = Array.from(root.classList).find(c => prop.values!.some(v => c.endsWith(`--${v}`)))?.replace(/--[^-]+$/, '');
          if (blockPrefix) root.classList.add(`${blockPrefix}--${overrideValue}`);
          else root.classList.add(overrideValue);
        }
      }
      continue;
    }

    // Generic data-attribute fallback — set on root and any descendants
    // that already have this attribute. Also try class-based switching.
    const attrName = `data-${prop.name}`;
    if (root.hasAttribute(attrName)) root.setAttribute(attrName, overrideValue);
    root.querySelectorAll(`[${attrName}]`).forEach(el => {
      el.setAttribute(attrName, overrideValue);
    });
    // Also try as a CSS class swap (for class-based theming)
    if (prop.defaultValue && root.classList.contains(prop.defaultValue)) {
      root.classList.remove(prop.defaultValue);
      root.classList.add(overrideValue);
    }
    root.querySelectorAll(`.${prop.defaultValue}`).forEach(el => {
      el.classList.remove(prop.defaultValue);
      el.classList.add(overrideValue);
    });
  }
}

function buildPropPanel(props: ComponentProperty[], params: URLSearchParams, slug: string, pageUrl: string | null): string {
  if (props.length === 0) {
    return '<div class="prop-panel"><p class="prop-panel__empty">No configurable properties detected.</p></div>';
  }

  const inputs = props.map((prop) => {
    const current = params.get(prop.name) ?? prop.defaultValue;
    const inputId = `prop-${prop.name}`;
    let inputHtml: string;

    if (prop.type === 'enum' && prop.values && prop.values.length > 0) {
      const options = prop.values.map(v =>
        `<option value="${v.replace(/"/g, '&quot;')}"${v === current ? ' selected' : ''}>${v}</option>`
      ).join('');
      inputHtml = `<select id="${inputId}" data-prop="${prop.name}" data-source="${prop.source}">${options}</select>`;
    } else if (prop.type === 'boolean') {
      inputHtml = `<select id="${inputId}" data-prop="${prop.name}" data-source="${prop.source}">
           <option value="true"${current === 'true' ? ' selected' : ''}>true</option>
           <option value="false"${current === 'false' ? ' selected' : ''}>false</option>
         </select>`;
    } else {
      inputHtml = `<input id="${inputId}" type="text" value="${current.replace(/"/g, '&quot;')}" data-prop="${prop.name}" data-source="${prop.source}" />`;
    }

    const sourceLabel = prop.source.startsWith('css-') ? prop.source : prop.type;
    return `<div class="prop-row">
      <label for="${inputId}" class="prop-row__label">
        <span class="prop-row__name">${prop.name}</span>
        <span class="prop-row__type">${sourceLabel}</span>
      </label>
      ${inputHtml}
    </div>`;
  }).join('');

  return `<aside class="prop-panel">
    <h2 class="prop-panel__title">Properties</h2>
    ${inputs}
    <p class="prop-panel__hint">Changes update the URL and preview live.</p>
  </aside>`;
}

// Mount prop panel listeners that update both the URL and the iframe content live
function mountPropListeners(
  root: HTMLElement,
  slug: string,
  pageUrl: string | null,
  props: ComponentProperty[],
): void {
  root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-prop]').forEach((input) => {
    const handler = () => {
      // Update URL for shareability
      const params = new URLSearchParams(window.location.search);
      params.set(input.dataset['prop']!, input.value);
      if (pageUrl && !params.has('page')) params.set('page', pageUrl);
      const newUrl = `${window.location.origin}/components/${slug}/?${params.toString()}`;
      history.replaceState(null, '', newUrl);

      // Update iframe content live (no page reload)
      const iframe = root.querySelector('.component-frame') as HTMLIFrameElement | null;
      if (iframe) {
        applyPropsToIframe(iframe, props, params);
      }
    };
    input.addEventListener('input', handler);
    input.addEventListener('change', handler);
  });
}

export async function renderComponentView(
  root: HTMLElement,
  slug: string,
  pageUrl: string | null,
  params: URLSearchParams
): Promise<void> {
  root.innerHTML = '<div class="spinner" aria-label="Loading…"></div>';

  let componentRecord: ComponentRecord | null = null;
  let resolvedPageUrl = pageUrl;

  if (pageUrl) {
    const resp = await chrome.runtime.sendMessage<Message<GetComponentsPayload>, GetComponentsResponse>({
      type: 'GET_COMPONENTS',
      payload: { pageUrl },
    });
    componentRecord = resp?.components?.find((c) => c.slug === slug) ?? null;
  }

  if (!componentRecord) {
    const found = await chrome.runtime.sendMessage<Message<FindComponentBySlugPayload>, FindComponentBySlugResponse | null>({
      type: 'FIND_COMPONENT_BY_SLUG',
      payload: { slug },
    });
    if (found) {
      componentRecord = found.component;
      resolvedPageUrl = found.pageUrl;
    }
  }

  const snapshotId = componentRecord?.previewSnapshotId ?? null;
  let snapshot: GetSnapshotResponse | null = null;

  if (snapshotId) {
    snapshot = await chrome.runtime.sendMessage<Message<GetSnapshotPayload>, GetSnapshotResponse | null>({
      type: 'GET_SNAPSHOT',
      payload: { componentId: snapshotId },
    });
  }

  if (!snapshot) {
    const backLink = resolvedPageUrl
      ? `<a href="${window.location.origin}/components/?page=${encodeURIComponent(resolvedPageUrl)}">← Back to index</a>`
      : '';
    root.innerHTML = `<div class="not-found">
      <h1>Component not found: <code>${slug}</code></h1>
      <p>This component hasn't been recorded yet, or the page URL is missing.</p>
      ${backLink}
    </div>`;
    return;
  }

  const props = componentRecord?.properties ?? [];
  const displayName = componentRecord?.displayName ?? slug;
  const backUrl = resolvedPageUrl
    ? `${window.location.origin}/components/?page=${encodeURIComponent(resolvedPageUrl)}`
    : `${window.location.origin}/components/`;
  const componentId = componentRecord?.id ?? '';

  // Pick the right HTML to modify based on which rendering tier will be used
  const tier = getActiveRenderingTier(snapshot);
  const htmlToModify = tier === 'inline' ? snapshot.html : (snapshot.cleanHtml || snapshot.html);
  const modifiedHtml = applyPropsToHtml(htmlToModify, props, params);
  const modifiedSnapshot: GetSnapshotResponse = tier === 'inline'
    ? { ...snapshot, html: modifiedHtml }
    : { ...snapshot, cleanHtml: modifiedHtml };

  const frameHtml = buildPreviewFrame(modifiedSnapshot, {
    className: 'component-frame',
    overflow: 'auto',
    title: displayName,
  });

  const hasExportCss = snapshot.matchedCss.trim().length > 0;
  const cssCoverage = snapshot.cssRuleCoverage ?? 0;
  // Single rendering quality badge combining tier + export status
  let qualityBadge: { label: string; cls: string; tip: string };
  if (tier === 'stylesheet' && hasExportCss) {
    qualityBadge = { label: 'live CSS', cls: 'badge--hybrid', tip: 'Preview uses original page stylesheets. CSS rules fully captured for export.' };
  } else if (tier === 'stylesheet') {
    qualityBadge = { label: 'live CSS (partial)', cls: 'badge--hybrid', tip: 'Preview uses original page stylesheets, but some CSS rules could not be extracted for export (cross-origin blocked).' };
  } else if (tier === 'hybrid') {
    qualityBadge = { label: 'hybrid CSS', cls: 'badge--hybrid', tip: `Preview uses ${Math.round(cssCoverage * 100)}% matched CSS rules. Hover states and media queries may work.` };
  } else if (hasExportCss) {
    qualityBadge = { label: 'inline + export', cls: '', tip: 'Preview uses inline computed styles for visual fidelity. CSS rules are available in JSON export.' };
  } else {
    qualityBadge = { label: 'inline only', cls: 'badge--warn', tip: 'Preview uses inline computed styles. CSS rules could not be extracted (cross-origin stylesheets blocked access).' };
  }
  const propPanelHtml = buildPropPanel(props, params, slug, resolvedPageUrl);

  root.innerHTML = `
    <header class="component-header">
      <a href="${backUrl}" class="back-link">← Index</a>
      <div class="component-header__info">
        <h1 class="component-header__name">${displayName}</h1>
        ${componentRecord?.frameworkName ? `<span class="badge" title="Detected via ${componentRecord.sourceType} framework runtime">${componentRecord.frameworkName}</span>` : ''}
        <span class="badge" title="Component detected from ${componentRecord?.sourceType === 'framework' ? 'framework component tree' : 'HTML semantic structure and visual heuristics'}">${componentRecord?.sourceType ?? 'html'}</span>
        <span class="badge ${qualityBadge.cls}" title="${qualityBadge.tip}">${qualityBadge.label}</span>
      </div>
      <div class="component-header__actions">
        <button class="btn-export" id="copy-json" title="Copy structured JSON to clipboard — includes component HTML, CSS, properties, and page hierarchy">Copy JSON</button>
      </div>
    </header>
    <div class="component-layout">
      <div class="component-canvas">${frameHtml}</div>
      ${propPanelHtml}
    </div>
    <div id="sub-components"></div>
    <div class="toast" id="toast"></div>`;

  mountPropListeners(root, slug, resolvedPageUrl, props);
  mountExportListeners(root, componentId, resolvedPageUrl ?? '', displayName);

  // Load hierarchy and render sub-components
  loadAndRenderSubComponents(root, slug, resolvedPageUrl);
}

function showToast(root: HTMLElement, message: string): void {
  const toast = root.querySelector('#toast') as HTMLElement | null;
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('toast--visible');
  setTimeout(() => toast.classList.remove('toast--visible'), 2000);
}

async function getExportJson(componentId: string, pageUrl: string): Promise<string | null> {
  const exportable = await chrome.runtime.sendMessage<Message<ExportComponentPayload>, ExportableComponent | null>({
    type: 'EXPORT_COMPONENT',
    payload: { componentId, pageUrl },
  });
  if (!exportable) return null;

  const hierarchy = await chrome.runtime.sendMessage<Message, PageHierarchy | null>({
    type: 'GET_HIERARCHY',
    payload: null,
  });

  const encodedPage = encodeURIComponent(exportable.sourceUrl);
  const json = {
    component: {
      slug: exportable.slug,
      name: exportable.displayName,
      url: `${window.location.origin}/components/${exportable.slug}/?page=${encodedPage}`,
      framework: exportable.frameworkName,
      sourceType: exportable.sourceType,
      sourceUrl: exportable.sourceUrl,
      capturedAt: new Date(exportable.capturedAt).toISOString(),
      properties: exportable.properties.map(p => ({
        name: p.name,
        type: p.type,
        source: p.source,
        defaultValue: p.defaultValue,
        ...(p.values ? { values: p.values } : {}),
      })),
      html: exportable.cleanHtml,
      css: exportable.matchedCss,
      designTokens: exportable.designTokens,
      fonts: exportable.fonts,
    },
    ...(hierarchy ? { hierarchy } : {}),
  };

  return JSON.stringify(json, null, 2);
}

function mountExportListeners(root: HTMLElement, componentId: string, pageUrl: string, _displayName: string): void {
  root.querySelector('#copy-json')?.addEventListener('click', async () => {
    const json = await getExportJson(componentId, pageUrl);
    if (!json) { showToast(root, 'Export data not available'); return; }
    try {
      await navigator.clipboard.writeText(json);
      showToast(root, 'JSON copied to clipboard');
    } catch {
      showToast(root, 'Clipboard access denied');
    }
  });
}

// Find the hierarchy node for a given component slug, then extract its
// significant children as "sub-components" for display.
function findNodeBySlug(node: HierarchyNode, slug: string): HierarchyNode | null {
  if (node.componentSlug === slug) return node;
  for (const child of node.children) {
    const found = findNodeBySlug(child, slug);
    if (found) return found;
  }
  return null;
}

function collectSubElements(node: HierarchyNode, maxItems = 12): HierarchyNode[] {
  const subs: HierarchyNode[] = [];

  function collect(parent: HierarchyNode) {
    for (const child of parent.children) {
      if (subs.length >= maxItems) return;
      if (child.componentSlug) {
        subs.push(child);
        continue;
      }
      const isMeaningfulTag = /^(h[1-6]|nav|form|img|button|a|video|picture|ul|ol|table|p|input|select|textarea)$/i.test(child.tag);
      const hasContent = !!(child.textContent || child.imageSrc);
      const hasVisual = !!(child.backgroundColor || child.classes?.length);
      const isLargeEnough = child.width > 40 && child.height > 20;

      if ((isMeaningfulTag && (hasContent || isLargeEnough)) || (hasContent && isLargeEnough) || (hasVisual && isLargeEnough && child.height > 40)) {
        subs.push(child);
      } else if (child.children.length > 0) {
        collect(child);
      }
    }
  }

  collect(node);
  return subs;
}

function buildCssSelector(node: HierarchyNode): string {
  const parts: string[] = [node.tag];
  if (node.id) return `#${node.id}`;
  if (node.classes?.length) parts.push(`.${node.classes[0]}`);
  return parts.join('');
}

function buildSubComponentCard(node: HierarchyNode, pageUrl: string | null): string {
  const label = node.componentSlug
    ? node.componentSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : describeNode(node);
  const classes = node.classes?.slice(0, 3).join(', ') ?? '';
  const preview = node.textContent
    ? `<span class="sub-text">${node.textContent.slice(0, 80)}${node.textContent.length > 80 ? '…' : ''}</span>`
    : node.imageSrc
      ? `<img class="sub-img" src="${node.imageSrc}" alt="" loading="lazy" />`
      : `<span class="sub-tag">&lt;${node.tag}&gt;</span>`;

  const isLink = !!node.componentSlug;
  const href = isLink && pageUrl
    ? `${window.location.origin}/components/${node.componentSlug}/?page=${encodeURIComponent(pageUrl)}`
    : '';

  const selector = buildCssSelector(node);
  const inner = `
    <div class="sub-card__preview">${preview}</div>
    <div class="sub-card__info">
      <span class="sub-card__name">${label}</span>
      ${classes ? `<span class="sub-card__classes">${classes}</span>` : ''}
      <span class="sub-card__dims">${node.width}×${node.height}</span>
    </div>`;

  if (isLink) {
    return `<a class="sub-card sub-card--link" href="${href}">${inner}</a>`;
  }
  return `<div class="sub-card sub-card--highlight" data-selector="${selector.replace(/"/g, '&quot;')}">${inner}</div>`;
}

function describeNode(node: HierarchyNode): string {
  if (node.role) return node.role.charAt(0).toUpperCase() + node.role.slice(1);
  const tag = node.tag.toUpperCase();
  if (/^H[1-6]$/.test(tag)) return `Heading ${tag.slice(1)}`;
  if (tag === 'IMG' || tag === 'PICTURE') return 'Image';
  if (tag === 'NAV') return 'Navigation';
  if (tag === 'FORM') return 'Form';
  if (tag === 'BUTTON' || tag === 'A') return 'Button / Link';
  if (tag === 'VIDEO') return 'Video';
  if (tag === 'UL' || tag === 'OL') return 'List';
  if (node.classes?.length) return node.classes[0].split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return tag.charAt(0) + tag.slice(1).toLowerCase();
}

async function loadAndRenderSubComponents(root: HTMLElement, slug: string, pageUrl: string | null): Promise<void> {
  const container = root.querySelector('#sub-components');
  if (!container) return;

  const hierarchy = await chrome.runtime.sendMessage<Message, PageHierarchy | null>({
    type: 'GET_HIERARCHY',
    payload: null,
  });

  if (!hierarchy?.rootNode) return;

  const componentNode = findNodeBySlug(hierarchy.rootNode, slug);
  if (!componentNode) return;

  const subElements = collectSubElements(componentNode);
  if (subElements.length === 0) return;

  const cards = subElements.map(n => buildSubComponentCard(n, pageUrl)).join('');
  container.innerHTML = `
    <div class="sub-components">
      <h2 class="sub-components__title">Sub-elements (${subElements.length})</h2>
      <div class="sub-components__grid">${cards}</div>
    </div>`;

  // Click-to-highlight: clicking a non-link sub-card outlines the matching
  // element inside the preview iframe
  container.querySelectorAll<HTMLElement>('.sub-card--highlight').forEach(card => {
    card.addEventListener('click', () => {
      const selector = card.dataset['selector'];
      if (!selector) return;
      const iframe = root.querySelector('.component-frame') as HTMLIFrameElement | null;
      const iframeDoc = iframe?.contentDocument;
      if (!iframeDoc) return;

      // Remove any previous highlight
      iframeDoc.querySelectorAll('[data-cp-highlight]').forEach(el => {
        (el as HTMLElement).style.outline = '';
        (el as HTMLElement).style.outlineOffset = '';
        el.removeAttribute('data-cp-highlight');
      });

      // Highlight the matched element
      const target = iframeDoc.querySelector(selector);
      if (target) {
        (target as HTMLElement).style.outline = '3px solid #2563eb';
        (target as HTMLElement).style.outlineOffset = '2px';
        target.setAttribute('data-cp-highlight', '1');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      // Toggle active state on the card
      container.querySelectorAll('.sub-card--active').forEach(c => c.classList.remove('sub-card--active'));
      card.classList.add('sub-card--active');
    });
  });
}
