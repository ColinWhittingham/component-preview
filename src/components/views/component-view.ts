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
  ComponentRecord,
  ComponentProperty,
} from '../../shared/types';
import { buildPreviewFrame, getActiveRenderingTier } from './preview-frame';
import { buildExportHtml } from '../../../sdk/export-builder';

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
          case 'text': el.textContent = overrideValue; break;
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

    // Theme/variant: set as data attribute on root — hybrid CSS rules will respond
    if (prop.name === 'theme' || prop.name === 'variant') {
      root.setAttribute(`data-${prop.name}`, overrideValue);
      // Also try class-based theming
      root.classList.forEach((cls) => {
        if (cls.includes(`${prop.name}-`) || cls === prop.defaultValue) root.classList.remove(cls);
      });
      root.classList.add(overrideValue);
      continue;
    }

    if (prop.source === 'attribute') {
      const attrName = prop.name.replace(/([A-Z])/g, '-$1').toLowerCase();
      const el = root.querySelector(`[${attrName}]`) ?? (root.hasAttribute(attrName) ? root : null);
      if (el) el.setAttribute(attrName, overrideValue);
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
          case 'text': el.textContent = overrideValue; break;
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

    // Generic data-attribute fallback
    if (prop.name === 'theme' || prop.name === 'variant' || prop.name === 'mode') {
      root.setAttribute(`data-${prop.name}`, overrideValue);
    }
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

  const tierLabel = tier === 'stylesheet' ? 'live CSS' : tier === 'hybrid' ? 'hybrid CSS' : '';
  const hasExportCss = snapshot.matchedCss.trim().length > 0;
  const propPanelHtml = buildPropPanel(props, params, slug, resolvedPageUrl);

  root.innerHTML = `
    <header class="component-header">
      <a href="${backUrl}" class="back-link">← Index</a>
      <div class="component-header__info">
        <h1 class="component-header__name">${displayName}</h1>
        ${componentRecord?.frameworkName ? `<span class="badge">${componentRecord.frameworkName}</span>` : ''}
        <span class="badge">${componentRecord?.sourceType ?? 'html'}</span>
        ${tierLabel ? `<span class="badge badge--hybrid">${tierLabel}</span>` : ''}
        ${hasExportCss ? '<span class="badge">export ready</span>' : ''}
      </div>
      <div class="component-header__actions">
        <button class="btn-export" id="copy-ai" title="Copy self-contained HTML to clipboard for AI">Copy for AI</button>
        <button class="btn-export" id="export-html" title="Download as .html file">Export HTML</button>
      </div>
    </header>
    <div class="component-layout">
      <div class="component-canvas">${frameHtml}</div>
      ${propPanelHtml}
    </div>
    <div class="toast" id="toast"></div>`;

  mountPropListeners(root, slug, resolvedPageUrl, props);
  mountExportListeners(root, componentId, resolvedPageUrl ?? '', displayName);
}

function showToast(root: HTMLElement, message: string): void {
  const toast = root.querySelector('#toast') as HTMLElement | null;
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('toast--visible');
  setTimeout(() => toast.classList.remove('toast--visible'), 2000);
}

async function getExportHtml(componentId: string, pageUrl: string): Promise<string | null> {
  const exportable = await chrome.runtime.sendMessage<Message<ExportComponentPayload>, ExportableComponent | null>({
    type: 'EXPORT_COMPONENT',
    payload: { componentId, pageUrl },
  });
  if (!exportable) return null;
  return buildExportHtml(exportable);
}

function mountExportListeners(root: HTMLElement, componentId: string, pageUrl: string, displayName: string): void {
  root.querySelector('#copy-ai')?.addEventListener('click', async () => {
    const html = await getExportHtml(componentId, pageUrl);
    if (!html) { showToast(root, 'Export data not available'); return; }
    try {
      await navigator.clipboard.writeText(html);
      showToast(root, 'Copied to clipboard');
    } catch {
      showToast(root, 'Clipboard access denied');
    }
  });

  root.querySelector('#export-html')?.addEventListener('click', async () => {
    const html = await getExportHtml(componentId, pageUrl);
    if (!html) { showToast(root, 'Export data not available'); return; }
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${displayName.toLowerCase().replace(/\s+/g, '-')}.html`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(root, 'Downloaded');
  });
}
