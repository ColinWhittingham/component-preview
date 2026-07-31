export interface SnapshotResult {
  html: string;
  css: string;
}

const VISUAL_PROPS = [
  'display', 'position', 'top', 'right', 'bottom', 'left',
  'float', 'clear',
  'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-radius', 'border-color', 'border-style', 'border-width',
  'background', 'background-color', 'background-image', 'background-size',
  'background-position', 'background-repeat', 'background-clip',
  'color', 'font-family', 'font-size', 'font-weight', 'font-style',
  'line-height', 'letter-spacing', 'text-align', 'text-decoration',
  'text-decoration-color', 'text-decoration-style', 'text-decoration-thickness',
  'text-underline-offset', 'text-transform', 'white-space', 'word-break',
  'word-spacing', 'overflow-wrap',
  'opacity', 'visibility', 'overflow', 'overflow-x', 'overflow-y',
  'box-shadow', 'text-shadow',
  'outline', 'outline-color', 'outline-style', 'outline-width', 'outline-offset',
  'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content',
  'align-self', 'flex-grow', 'flex-shrink', 'flex-basis', 'gap', 'order',
  'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row',
  'grid-gap', 'column-gap', 'row-gap', 'grid-auto-flow', 'grid-auto-columns',
  'grid-auto-rows',
  'z-index', 'cursor', 'pointer-events', 'user-select',
  'list-style', 'list-style-type', 'list-style-position',
  'object-fit', 'object-position',
  'transform', 'transform-origin', 'transition',
  'animation', 'animation-name', 'animation-duration', 'animation-timing-function',
  'animation-delay', 'animation-iteration-count', 'animation-direction',
  'animation-fill-mode', 'animation-play-state',
  'box-sizing',
  'appearance', 'vertical-align', 'table-layout', 'border-collapse',
  'border-spacing', 'clip-path', 'filter', 'backdrop-filter',
  'mix-blend-mode', 'isolation',
  'aspect-ratio', 'contain', 'content-visibility',
  'accent-color', 'caret-color', 'writing-mode', 'direction',
];

// Background-related props captured from ancestor wrappers
const BG_PROPS = [
  'background', 'background-color', 'background-image', 'background-size',
  'background-position', 'background-repeat',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-radius',
];

function resolveUrl(url: string): string {
  try { return new URL(url, document.baseURI).href; } catch { return url; }
}

function resolveBackgroundUrls(value: string): string {
  return value.replace(/url\(["']?(.*?)["']?\)/g, (_match, u: string) =>
    `url("${resolveUrl(u)}")`
  );
}

// Properties where 'none' is a meaningful override of browser defaults
// (e.g. text-decoration:none on <a> tags must be preserved)
const KEEP_NONE = new Set([
  'text-decoration', 'box-shadow', 'text-shadow', 'outline',
  'list-style', 'list-style-type', 'border', 'border-top', 'border-right',
  'border-bottom', 'border-left', 'transform', 'transition',
  'background', 'background-image',
]);

const INHERITED_PROPS = [
  'font-family', 'font-size', 'font-weight', 'font-style',
  'color', 'line-height', 'letter-spacing', 'text-align',
  'text-transform', 'text-decoration', 'white-space',
  'word-spacing', 'word-break', 'overflow-wrap',
  'direction', 'writing-mode', 'visibility', 'cursor',
  'list-style', 'list-style-type', 'list-style-position',
];

function inlineStyles(original: Element, clone: Element): void {
  const computed = window.getComputedStyle(original);
  const styles: string[] = [];
  for (const prop of VISUAL_PROPS) {
    const val = computed.getPropertyValue(prop);
    if (!val) continue;
    if (val === 'none' && prop !== 'display' && !KEEP_NONE.has(prop)) continue;
    const resolved = prop.includes('background') ? resolveBackgroundUrls(val) : val;
    styles.push(`${prop}:${resolved}`);
  }
  (clone as HTMLElement).style.cssText = styles.join(';');

  const origChildren = original.children;
  const cloneChildren = clone.children;
  for (let i = 0; i < origChildren.length && i < cloneChildren.length; i++) {
    inlineStyles(origChildren[i], cloneChildren[i]);
  }
}

// Capture inherited styles from ancestors outside the component boundary
// onto the clone's root element so they survive isolation in the iframe.
function captureInheritedStyles(el: Element, clone: Element): void {
  const computed = window.getComputedStyle(el);
  const inherited: string[] = [];
  for (const prop of INHERITED_PROPS) {
    const val = computed.getPropertyValue(prop);
    if (val) inherited.push(`${prop}:${val}`);
  }
  const existing = (clone as HTMLElement).style.cssText;
  (clone as HTMLElement).style.cssText = inherited.join(';') + ';' + existing;
}

const LAYOUT_PROPS = [
  'display', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items',
  'align-content', 'gap', 'grid-template-columns', 'grid-template-rows',
  'grid-auto-flow', 'grid-auto-columns', 'grid-auto-rows',
  'column-gap', 'row-gap',
];

// Walk up ancestors and collect visual context — backgrounds, layout containers.
// Captures up to 3 background layers and flex/grid layout parents.
function buildAncestorWrapper(el: Element, clone: Element): Element {
  let wrapped = clone;
  let current = el.parentElement;
  let depth = 0;
  let bgLayersCaptured = 0;

  while (current && current !== document.body && depth < 6) {
    const style = window.getComputedStyle(current);
    const bg = style.backgroundColor;
    const hasBg = bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
    const hasBgImage = style.backgroundImage !== 'none';
    const display = style.display;
    const isFlexOrGrid = display === 'flex' || display === 'inline-flex' ||
                         display === 'grid' || display === 'inline-grid';

    const shouldCaptureBg = (hasBg || hasBgImage) && bgLayersCaptured < 3;
    const shouldCaptureLayout = isFlexOrGrid;

    if (shouldCaptureBg || shouldCaptureLayout) {
      const wrapper = document.createElement('div');
      const wrapStyles: string[] = [];

      if (shouldCaptureBg) {
        for (const prop of BG_PROPS) {
          const val = style.getPropertyValue(prop);
          if (!val || (val === 'none' && !prop.startsWith('background'))) continue;
          const resolved = prop.includes('background') ? resolveBackgroundUrls(val) : val;
          wrapStyles.push(`${prop}:${resolved}`);
        }
        bgLayersCaptured++;
      }

      if (shouldCaptureLayout) {
        for (const prop of LAYOUT_PROPS) {
          const val = style.getPropertyValue(prop);
          if (!val || val === 'none') continue;
          wrapStyles.push(`${prop}:${val}`);
        }
      }

      if (wrapStyles.length > 0) {
        wrapper.setAttribute('style', wrapStyles.join(';'));
        wrapper.appendChild(wrapped);
        wrapped = wrapper;
      }
    }

    current = current.parentElement;
    depth++;
  }

  return wrapped;
}

// Clean up form inputs so preview shows them in their empty/placeholder state.
// Operates on the original element too (to read state), then modifies the clone.
function cleanFormInputs(original: Element, clone: Element): void {
  // Collect filled-field states from the ORIGINAL before modifying the clone
  const origInputs = original.querySelectorAll('input');
  const cloneInputs = clone.querySelectorAll('input');

  for (let i = 0; i < cloneInputs.length && i < origInputs.length; i++) {
    const input = cloneInputs[i] as HTMLInputElement;
    const type = input.getAttribute('type') ?? 'text';
    if (type === 'hidden' || type === 'submit' || type === 'button') continue;
    if (type === 'checkbox' || type === 'radio') {
      input.removeAttribute('checked');
      continue;
    }
    // Clear value: both the DOM property and the HTML attribute
    input.value = '';
    input.defaultValue = '';
    input.removeAttribute('value');
  }

  clone.querySelectorAll('textarea').forEach(ta => {
    (ta as HTMLTextAreaElement).value = '';
    (ta as HTMLTextAreaElement).defaultValue = '';
    ta.textContent = '';
    ta.removeAttribute('value');
  });

  clone.querySelectorAll('select').forEach(sel => {
    sel.querySelectorAll('option').forEach(opt => opt.removeAttribute('selected'));
    const first = sel.querySelector('option');
    if (first) first.setAttribute('selected', '');
  });
}

// Post-process the HTML string to strip residual value attributes from
// text-like inputs. Preserves value on submit/button inputs (it's their label).
function stripInputValues(html: string): string {
  return html.replace(
    /(<input\b[^>]*?)\s+value\s*=\s*"[^"]*"/gi,
    (_match, prefix: string) => {
      if (/type\s*=\s*["']?(submit|button|hidden)/i.test(prefix)) return _match;
      return prefix;
    }
  ).replace(
    /(<textarea\b[^>]*?)\s+value\s*=\s*"[^"]*"/gi,
    '$1'
  );
}

function resolveResourceUrls(clone: Element): void {
  clone.querySelectorAll('img').forEach(img => {
    // Handle lazy-loaded images: data-src, data-lazy-src, data-original
    const lazySrc = img.getAttribute('data-src') ||
                    img.getAttribute('data-lazy-src') ||
                    img.getAttribute('data-original');
    if (lazySrc && !img.getAttribute('src')) {
      img.setAttribute('src', resolveUrl(lazySrc));
    } else if (img.getAttribute('src')) {
      img.setAttribute('src', resolveUrl(img.getAttribute('src')!));
    }
    // Handle lazy srcset
    const lazySrcset = img.getAttribute('data-srcset') || img.getAttribute('data-lazy-srcset');
    if (lazySrcset && !img.getAttribute('srcset')) {
      img.setAttribute('srcset', resolveSrcset(lazySrcset));
    } else if (img.getAttribute('srcset')) {
      img.setAttribute('srcset', resolveSrcset(img.getAttribute('srcset')!));
    }
    img.removeAttribute('loading');
    img.removeAttribute('data-src');
    img.removeAttribute('data-lazy-src');
    img.removeAttribute('data-original');
  });
  clone.querySelectorAll('source[srcset], source[data-srcset]').forEach(s => {
    const srcset = s.getAttribute('srcset') || s.getAttribute('data-srcset');
    if (srcset) s.setAttribute('srcset', resolveSrcset(srcset));
  });
  clone.querySelectorAll('a[href]').forEach(a => {
    a.setAttribute('href', resolveUrl(a.getAttribute('href')!));
  });
  clone.querySelectorAll('video').forEach(v => {
    if (v.getAttribute('poster')) v.setAttribute('poster', resolveUrl(v.getAttribute('poster')!));
    // Enable autoplay for video previews (muted to satisfy browser autoplay policy)
    v.setAttribute('autoplay', '');
    v.setAttribute('muted', '');
    v.setAttribute('loop', '');
    v.setAttribute('playsinline', '');
    v.removeAttribute('loading');
    // Resolve video source URLs
    v.querySelectorAll('source').forEach(source => {
      if (source.getAttribute('src')) source.setAttribute('src', resolveUrl(source.getAttribute('src')!));
    });
    if (v.getAttribute('src')) v.setAttribute('src', resolveUrl(v.getAttribute('src')!));
  });
}

function resolveSrcset(srcset: string): string {
  return srcset.split(',').map(entry => {
    const parts = entry.trim().split(/\s+/);
    parts[0] = resolveUrl(parts[0]);
    return parts.join(' ');
  }).join(', ');
}

// Collect @font-face URLs from same-origin stylesheets for fonts used in the component
function collectFontFaces(el: Element): string {
  const usedFamilies = new Set<string>();

  // Gather font-family values from the component and its descendants
  function gather(node: Element) {
    const ff = window.getComputedStyle(node).fontFamily;
    if (ff) ff.split(',').forEach(f => usedFamilies.add(f.trim().replace(/['"]/g, '').toLowerCase()));
    for (const child of Array.from(node.children)) gather(child);
  }
  gather(el);

  const fontRules: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSFontFaceRule) {
        const familyMatch = rule.cssText.match(/font-family\s*:\s*['"]?([^'";]+)/i);
        if (familyMatch && usedFamilies.has(familyMatch[1].trim().toLowerCase())) {
          fontRules.push(resolveBackgroundUrls(rule.cssText));
        }
      }
    }
  }
  return fontRules.join('\n');
}

function getCssCustomProperties(componentEl?: Element): string {
  const props: string[] = [];
  const seen = new Set<string>();

  // Global variables from :root/html/body rules
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try { rules = sheet.cssRules; } catch { continue; }
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSStyleRule &&
            /^(:root|html|body)$/i.test(rule.selectorText.trim())) {
          const text = rule.cssText;
          if (!seen.has(text)) { seen.add(text); props.push(text); }
        }
      }
    }
  } catch { /* skip */ }

  // CSS variables from ancestor elements (intermediate scope)
  if (componentEl) {
    let ancestor = componentEl.parentElement;
    let depth = 0;
    while (ancestor && ancestor !== document.documentElement && depth < 10) {
      const varDecls: string[] = [];
      // Check inline style for custom properties
      for (let i = 0; i < ancestor.style.length; i++) {
        const prop = ancestor.style[i];
        if (prop.startsWith('--')) {
          varDecls.push(`${prop}: ${ancestor.style.getPropertyValue(prop)}`);
        }
      }
      // Check matched stylesheet rules for custom properties on this ancestor
      try {
        for (const sheet of Array.from(document.styleSheets)) {
          let rules: CSSRuleList;
          try { rules = sheet.cssRules; } catch { continue; }
          for (const rule of Array.from(rules)) {
            if (!(rule instanceof CSSStyleRule)) continue;
            try { if (!ancestor!.matches(rule.selectorText)) continue; } catch { continue; }
            for (let i = 0; i < rule.style.length; i++) {
              const prop = rule.style[i];
              if (prop.startsWith('--')) {
                const decl = `${prop}: ${rule.style.getPropertyValue(prop)}`;
                if (!seen.has(decl)) { seen.add(decl); varDecls.push(decl); }
              }
            }
          }
        }
      } catch { /* skip */ }
      if (varDecls.length > 0) {
        props.push(`:root { ${varDecls.join('; ')} }`);
      }
      ancestor = ancestor.parentElement;
      depth++;
    }
  }

  return props.join('\n');
}

// Capture ::before and ::after pseudo-element content and key styles.
// Since pseudo-elements can't exist in cloned HTML, we inject real elements.
function capturePseudoElements(original: Element, clone: Element): void {
  injectPseudo(original, clone, '::before', 'beforebegin');
  injectPseudo(original, clone, '::after', 'beforeend');

  const origChildren = original.children;
  const cloneChildren = clone.children;
  for (let i = 0; i < origChildren.length && i < cloneChildren.length; i++) {
    capturePseudoElements(origChildren[i], cloneChildren[i]);
  }
}

function injectPseudo(
  original: Element,
  clone: Element,
  pseudo: '::before' | '::after',
  position: InsertPosition,
): void {
  const style = window.getComputedStyle(original, pseudo);
  const content = style.getPropertyValue('content');
  if (!content || content === 'none' || content === 'normal') return;

  const span = document.createElement('span');
  span.setAttribute('data-pseudo', pseudo);
  const styles: string[] = [];
  for (const prop of VISUAL_PROPS) {
    const val = style.getPropertyValue(prop);
    if (!val) continue;
    if (val === 'none' && prop !== 'display' && !KEEP_NONE.has(prop)) continue;
    const resolved = prop.includes('background') ? resolveBackgroundUrls(val) : val;
    styles.push(`${prop}:${resolved}`);
  }
  styles.push(`content:${content}`);
  span.setAttribute('style', styles.join(';'));
  clone.insertAdjacentElement(position === 'beforebegin' ? 'afterbegin' : 'beforeend', span);
}

export interface PreExtractedCss {
  designTokens: string;
  fonts: string[];
}

export function captureSnapshot(el: Element, extracted?: PreExtractedCss): SnapshotResult {
  const clone = el.cloneNode(true) as Element;
  inlineStyles(el, clone);
  captureInheritedStyles(el, clone);
  capturePseudoElements(el, clone);
  cleanFormInputs(el, clone);
  resolveResourceUrls(clone);

  const wrapped = buildAncestorWrapper(el, clone);

  const customProps = extracted?.designTokens ?? getCssCustomProperties(el);
  const fontFaces = extracted ? extracted.fonts.join('\n') : collectFontFaces(el);
  const resetCss = `*, *::before, *::after { box-sizing: border-box; }`;
  const css = [resetCss, fontFaces, customProps].filter(Boolean).join('\n');

  const html = stripInputValues(wrapped.outerHTML);
  return { html, css };
}
