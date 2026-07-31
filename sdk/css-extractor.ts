// Direct document.styleSheets CSS extraction.
// Runs in the page context (MAIN world or standalone script).
// No Chrome APIs — pure DOM.

export interface ExtractedCss {
  matchedRules: string;
  designTokens: string;
  fonts: string[];
  keyframes: string;
  coverageRatio: number;
}

interface CollectedRule {
  text: string;
  order: number;
}

// Inheritable CSS properties — rules matching ancestors that set these
// should be included because they cascade into the component subtree.
const INHERITABLE = new Set([
  'color', 'font-family', 'font-size', 'font-weight', 'font-style',
  'line-height', 'letter-spacing', 'text-align', 'text-transform',
  'text-decoration', 'white-space', 'word-spacing', 'word-break',
  'overflow-wrap', 'direction', 'visibility', 'cursor', 'list-style',
  'list-style-type', 'list-style-position', 'quotes', 'orphans', 'widows',
]);

function resolveUrl(url: string, base: string): string {
  try { return new URL(url, base).href; } catch { return url; }
}

function resolveUrlsInCss(cssText: string, baseUrl: string): string {
  return cssText.replace(/url\(["']?(.*?)["']?\)/g, (_match, u: string) =>
    `url("${resolveUrl(u, baseUrl)}")`
  );
}

function ruleKey(selectorText: string, cssText: string): string {
  return `${selectorText}{${cssText}}`;
}

function hasInheritableProperty(style: CSSStyleDeclaration): boolean {
  for (let i = 0; i < style.length; i++) {
    if (INHERITABLE.has(style[i])) return true;
  }
  return false;
}

// Cache for cross-origin stylesheet fetches (shared across all components on the page)
const fetchCache = new Map<string, CSSRuleList | null>();

async function fetchAndParseSheet(href: string): Promise<CSSRuleList | null> {
  if (fetchCache.has(href)) return fetchCache.get(href)!;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(href, { mode: 'cors', signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) { fetchCache.set(href, null); return null; }
    const text = await response.text();
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(text);
    fetchCache.set(href, sheet.cssRules);
    return sheet.cssRules;
  } catch {
    fetchCache.set(href, null);
    return null;
  }
}

export async function extractCssForElement(root: Element): Promise<ExtractedCss> {
  const subtreeElements = [root, ...Array.from(root.querySelectorAll('*'))];

  // Collect ancestor elements for inheritable property matching
  const ancestors: Element[] = [];
  let parent = root.parentElement;
  for (let i = 0; i < 5 && parent && parent !== document.documentElement; i++) {
    ancestors.push(parent);
    parent = parent.parentElement;
  }

  const seen = new Set<string>();
  const rules: CollectedRule[] = [];
  const tokenRules: CollectedRule[] = [];
  const usedAnimations = new Set<string>();
  const usedFonts = new Set<string>();
  const collectedKeyframes: CollectedRule[] = [];
  const collectedFontFaces: CollectedRule[] = [];
  const matchedElements = new Set<Element>();
  let order = 0;

  // Gather font-family usage from computed styles for font-face matching
  for (const el of subtreeElements) {
    const computed = window.getComputedStyle(el);
    const ff = computed.fontFamily;
    if (ff) ff.split(',').forEach(f => usedFonts.add(f.trim().replace(/['"]/g, '').toLowerCase()));
  }

  for (const sheet of Array.from(document.styleSheets)) {
    const baseUrl = sheet.href || document.baseURI;
    let cssRules: CSSRuleList;

    try {
      cssRules = sheet.cssRules;
    } catch {
      // Cross-origin sheet — try fetching
      if (sheet.href) {
        const fetched = await fetchAndParseSheet(sheet.href);
        if (fetched) {
          processRuleList(fetched, baseUrl, subtreeElements, ancestors, seen, rules, tokenRules,
            usedAnimations, usedFonts, collectedKeyframes, collectedFontFaces, matchedElements, order);
          order += fetched.length;
        }
      }
      continue;
    }

    processRuleList(cssRules, baseUrl, subtreeElements, ancestors, seen, rules, tokenRules,
      usedAnimations, usedFonts, collectedKeyframes, collectedFontFaces, matchedElements, order);
    order += cssRules.length;
  }

  // Filter keyframes to only those referenced by matched rules
  const matchedKeyframes = collectedKeyframes.filter(kf => {
    const nameMatch = kf.text.match(/@keyframes\s+([^\s{]+)/);
    return nameMatch && usedAnimations.has(nameMatch[1]);
  });

  // Filter font-faces to only those referenced by matched rules or computed styles
  const matchedFonts = collectedFontFaces.filter(ff => {
    const familyMatch = ff.text.match(/font-family\s*:\s*['"]?([^'";}\n]+)/i);
    return familyMatch && usedFonts.has(familyMatch[1].trim().toLowerCase());
  });

  // Sort by source order
  rules.sort((a, b) => a.order - b.order);
  tokenRules.sort((a, b) => a.order - b.order);

  const coverageRatio = subtreeElements.length > 0
    ? matchedElements.size / subtreeElements.length
    : 0;

  return {
    matchedRules: rules.map(r => r.text).join('\n\n'),
    designTokens: tokenRules.map(r => r.text).join('\n'),
    fonts: matchedFonts.map(r => r.text),
    keyframes: matchedKeyframes.map(r => r.text).join('\n\n'),
    coverageRatio,
  };
}

function processRuleList(
  cssRules: CSSRuleList,
  baseUrl: string,
  subtreeElements: Element[],
  ancestors: Element[],
  seen: Set<string>,
  rules: CollectedRule[],
  tokenRules: CollectedRule[],
  usedAnimations: Set<string>,
  usedFonts: Set<string>,
  collectedKeyframes: CollectedRule[],
  collectedFontFaces: CollectedRule[],
  matchedElements: Set<Element>,
  orderOffset: number,
): void {
  for (let i = 0; i < cssRules.length; i++) {
    const rule = cssRules[i];

    if (rule instanceof CSSStyleRule) {
      processStyleRule(rule, baseUrl, subtreeElements, ancestors, seen, rules, tokenRules,
        usedAnimations, matchedElements, orderOffset + i);
    } else if (rule instanceof CSSMediaRule) {
      processConditionalRule(rule, `@media ${rule.conditionText}`, baseUrl, subtreeElements,
        ancestors, seen, rules, tokenRules, usedAnimations, orderOffset + i);
    } else if (rule instanceof CSSSupportsRule) {
      processConditionalRule(rule, `@supports ${rule.conditionText}`, baseUrl, subtreeElements,
        ancestors, seen, rules, tokenRules, usedAnimations, orderOffset + i);
    } else if (rule instanceof CSSKeyframesRule) {
      const text = resolveUrlsInCss(rule.cssText, baseUrl);
      if (!seen.has(text)) {
        seen.add(text);
        collectedKeyframes.push({ text, order: orderOffset + i });
      }
    } else if (rule instanceof CSSFontFaceRule) {
      const text = resolveUrlsInCss(rule.cssText, baseUrl);
      if (!seen.has(text)) {
        seen.add(text);
        collectedFontFaces.push({ text, order: orderOffset + i });
      }
    }
  }
}

function processStyleRule(
  rule: CSSStyleRule,
  baseUrl: string,
  subtreeElements: Element[],
  ancestors: Element[],
  seen: Set<string>,
  rules: CollectedRule[],
  tokenRules: CollectedRule[],
  usedAnimations: Set<string>,
  matchedElements: Set<Element>,
  order: number,
): void {
  const selectorText = rule.selectorText;
  const cssText = rule.style.cssText;
  if (!cssText.trim()) return;

  const key = ruleKey(selectorText, cssText);
  if (seen.has(key)) return;

  if (/^(:root|html|body)$/i.test(selectorText.trim()) && cssText.includes('--')) {
    seen.add(key);
    tokenRules.push({ text: resolveUrlsInCss(rule.cssText, baseUrl), order });
    return;
  }

  const selectors = selectorText.split(',').map(s => s.trim());
  let matched = false;

  for (const sel of selectors) {
    if (matched) break;

    for (const el of subtreeElements) {
      try {
        if (el.matches(sel)) { matched = true; matchedElements.add(el); break; }
      } catch { /* invalid selector */ }
    }

    if (!matched && hasInheritableProperty(rule.style)) {
      for (const ancestor of ancestors) {
        try {
          if (ancestor.matches(sel)) { matched = true; break; }
        } catch { /* invalid selector */ }
      }
    }
  }

  if (matched) {
    seen.add(key);
    const resolvedText = resolveUrlsInCss(rule.cssText, baseUrl);
    rules.push({ text: resolvedText, order });

    // Track animation-name references
    const animName = rule.style.getPropertyValue('animation-name');
    if (animName && animName !== 'none') {
      animName.split(',').forEach(n => usedAnimations.add(n.trim()));
    }
    const anim = rule.style.getPropertyValue('animation');
    if (anim && anim !== 'none') {
      // animation shorthand: first non-keyword token is typically the name
      const parts = anim.split(/\s+/);
      for (const p of parts) {
        if (!/^\d/.test(p) && !['ease', 'linear', 'ease-in', 'ease-out', 'ease-in-out',
            'normal', 'reverse', 'alternate', 'alternate-reverse', 'none', 'forwards',
            'backwards', 'both', 'infinite', 'paused', 'running'].includes(p)) {
          usedAnimations.add(p);
          break;
        }
      }
    }

    // Track font-family references
    const ff = rule.style.getPropertyValue('font-family');
    if (ff) ff.split(',').forEach(f => usedFonts.add(f.trim().replace(/['"]/g, '').toLowerCase()));
  }
}

function processConditionalRule(
  rule: CSSMediaRule | CSSSupportsRule,
  wrapper: string,
  baseUrl: string,
  subtreeElements: Element[],
  ancestors: Element[],
  seen: Set<string>,
  rules: CollectedRule[],
  tokenRules: CollectedRule[],
  usedAnimations: Set<string>,
  order: number,
): void {
  const innerRules: string[] = [];

  for (let i = 0; i < rule.cssRules.length; i++) {
    const child = rule.cssRules[i];
    if (!(child instanceof CSSStyleRule)) continue;

    const selectorText = child.selectorText;
    const cssText = child.style.cssText;
    if (!cssText.trim()) continue;

    const key = `${wrapper}{${ruleKey(selectorText, cssText)}}`;
    if (seen.has(key)) continue;

    const selectors = selectorText.split(',').map(s => s.trim());
    let matched = false;

    for (const sel of selectors) {
      if (matched) break;
      for (const el of subtreeElements) {
        try { if (el.matches(sel)) { matched = true; break; } } catch { /* skip */ }
      }
      if (!matched && hasInheritableProperty(child.style)) {
        for (const ancestor of ancestors) {
          try { if (ancestor.matches(sel)) { matched = true; break; } } catch { /* skip */ }
        }
      }
    }

    if (matched) {
      seen.add(key);
      innerRules.push(`  ${resolveUrlsInCss(child.cssText, baseUrl)}`);

      const animName = child.style.getPropertyValue('animation-name');
      if (animName && animName !== 'none') {
        animName.split(',').forEach(n => usedAnimations.add(n.trim()));
      }
    }
  }

  if (innerRules.length > 0) {
    rules.push({ text: `${wrapper} {\n${innerRules.join('\n')}\n}`, order });
  }
}

// Export the raw matched CSSStyleRule objects for property inference
export function extractMatchedStyleRules(root: Element): CSSStyleRule[] {
  const subtreeElements = [root, ...Array.from(root.querySelectorAll('*'))];
  const matched: CSSStyleRule[] = [];
  const seen = new Set<string>();

  for (const sheet of Array.from(document.styleSheets)) {
    let cssRules: CSSRuleList;
    try { cssRules = sheet.cssRules; } catch { continue; }

    for (const rule of Array.from(cssRules)) {
      if (!(rule instanceof CSSStyleRule)) continue;
      const key = ruleKey(rule.selectorText, rule.style.cssText);
      if (seen.has(key)) continue;

      const selectors = rule.selectorText.split(',').map(s => s.trim());
      for (const sel of selectors) {
        let found = false;
        for (const el of subtreeElements) {
          try { if (el.matches(sel)) { found = true; break; } } catch { /* skip */ }
        }
        if (found) {
          seen.add(key);
          matched.push(rule);
          break;
        }
      }
    }

    // Also check inside @media rules
    for (const rule of Array.from(cssRules)) {
      if (!(rule instanceof CSSMediaRule)) continue;
      for (const child of Array.from(rule.cssRules)) {
        if (!(child instanceof CSSStyleRule)) continue;
        const key = `@media{${ruleKey(child.selectorText, child.style.cssText)}}`;
        if (seen.has(key)) continue;

        const selectors = child.selectorText.split(',').map(s => s.trim());
        for (const sel of selectors) {
          let found = false;
          for (const el of subtreeElements) {
            try { if (el.matches(sel)) { found = true; break; } } catch { /* skip */ }
          }
          if (found) {
            seen.add(key);
            matched.push(child);
            break;
          }
        }
      }
    }
  }

  return matched;
}
