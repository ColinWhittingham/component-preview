import type { GetSnapshotResponse } from '../../shared/types';

export interface FrameOptions {
  className: string;
  overflow?: 'hidden' | 'auto' | 'visible';
  sandbox?: string;
  title?: string;
}

const COVERAGE_THRESHOLD = 0.70;

export function escapeForSrcdoc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// Extract background from inline-styled snapshot HTML. Searches the first
// few elements (outer wrapper + component root) for any background styling.
// Returns the first non-transparent background found.
function extractBodyBackground(inlineHtml: string): string {
  // Match all style attributes in the first 2000 chars (covers wrapper + root)
  const styleRegex = /style="([^"]+)"/g;
  const searchRegion = inlineHtml.slice(0, 2000);
  let match: RegExpExecArray | null;
  while ((match = styleRegex.exec(searchRegion)) !== null) {
    const style = match[1];
    // Skip transparent/default backgrounds
    const bgColorVal = style.match(/background-color:\s*([^;]+)/);
    if (bgColorVal && bgColorVal[1].trim() !== 'rgba(0, 0, 0, 0)' && bgColorVal[1].trim() !== 'transparent') {
      const parts: string[] = [`background-color:${bgColorVal[1]}`];
      const bgImage = style.match(/background-image:\s*([^;]+)/);
      if (bgImage) parts.push(`background-image:${bgImage[1]}`);
      const bgSize = style.match(/background-size:\s*([^;]+)/);
      if (bgSize) parts.push(`background-size:${bgSize[1]}`);
      const bgPos = style.match(/background-position:\s*([^;]+)/);
      if (bgPos) parts.push(`background-position:${bgPos[1]}`);
      return parts.join(';');
    }
    const bgShorthand = style.match(/background:\s*([^;]+)/);
    if (bgShorthand && !bgShorthand[1].includes('transparent') && !bgShorthand[1].includes('rgba(0, 0, 0, 0)')) {
      return `background:${bgShorthand[1]}`;
    }
    const bgImageOnly = style.match(/background-image:\s*(url\([^)]+\)[^;]*)/);
    if (bgImageOnly) {
      return `background-image:${bgImageOnly[1]}`;
    }
  }
  return '';
}

export function buildSnapshotFrame(
  html: string,
  css: string,
  opts: FrameOptions,
): string {
  const overflow = opts.overflow ?? 'auto';
  const sandbox = opts.sandbox ?? 'allow-same-origin allow-scripts';
  const title = opts.title ?? 'Component preview';

  const bodyBg = extractBodyBackground(html);
  const doc = `<!DOCTYPE html><html><head><style>*{box-sizing:border-box;}body{margin:0;overflow:${overflow};${bodyBg ? bodyBg + ';' : ''}}${css}</style></head><body>${html}</body></html>`;

  return `<iframe class="${opts.className}" srcdoc="${escapeForSrcdoc(doc)}" sandbox="${sandbox}" title="${title}"></iframe>`;
}

function buildStylesheetFrame(
  cleanHtml: string,
  stylesheetUrls: string[],
  designTokens: string,
  bodyBg: string,
  opts: FrameOptions,
): string {
  const overflow = opts.overflow ?? 'auto';
  const sandbox = opts.sandbox ?? 'allow-same-origin allow-scripts';
  const title = opts.title ?? 'Component preview';

  const linkTags = stylesheetUrls
    .map(url => `<link rel="stylesheet" href="${url}">`)
    .join('\n');
  const tokenStyle = designTokens ? `<style>${designTokens}</style>` : '';

  const doc = `<!DOCTYPE html><html><head>${linkTags}${tokenStyle}<style>body{margin:0;overflow:${overflow};${bodyBg ? bodyBg + ';' : ''}}</style></head><body>${cleanHtml}</body></html>`;

  return `<iframe class="${opts.className}" srcdoc="${escapeForSrcdoc(doc)}" sandbox="${sandbox}" title="${title}"></iframe>`;
}

function buildHybridFrame(
  snapshot: GetSnapshotResponse,
  bodyBg: string,
  opts: FrameOptions,
): string {
  const overflow = opts.overflow ?? 'auto';
  const sections: string[] = [
    '*, *::before, *::after { box-sizing: border-box; }',
    `body { margin: 0; overflow: ${overflow}; ${bodyBg ? bodyBg + ';' : ''} }`,
  ];
  if (snapshot.designTokens?.trim()) sections.push(snapshot.designTokens);
  if (snapshot.fonts?.length) sections.push(snapshot.fonts.join('\n'));
  sections.push(snapshot.matchedCss);
  const css = sections.join('\n');

  const sandbox = opts.sandbox ?? 'allow-same-origin allow-scripts';
  const title = opts.title ?? 'Component preview';
  const doc = `<!DOCTYPE html><html><head><style>${css}</style></head><body>${snapshot.cleanHtml}</body></html>`;

  return `<iframe class="${opts.className}" srcdoc="${escapeForSrcdoc(doc)}" sandbox="${sandbox}" title="${title}"></iframe>`;
}

// Three-tier rendering cascade:
// Tier 1: Original stylesheet URLs (most faithful — real CSS from the page)
// Tier 2: Hybrid CSS (matched rules with sufficient coverage)
// Tier 3: Inline-styled snapshot (always available fallback)
export function buildPreviewFrame(
  snapshot: GetSnapshotResponse,
  opts: FrameOptions,
): string {
  // Extract background from the inline-styled snapshot (always has ancestor context)
  const bodyBg = extractBodyBackground(snapshot.html);

  // Tier 1: Original stylesheets + clean HTML
  if (snapshot.stylesheetUrls && snapshot.stylesheetUrls.length > 0 &&
      snapshot.cleanHtml?.trim()) {
    return buildStylesheetFrame(snapshot.cleanHtml, snapshot.stylesheetUrls,
      snapshot.designTokens ?? '', bodyBg, opts);
  }

  // Tier 2: Hybrid CSS (clean HTML + matched rules) when coverage is good
  const coverage = snapshot.cssRuleCoverage ?? 0;
  const hasMatchedCss = (snapshot.matchedCss ?? '').trim().length > 0;
  const hasCleanHtml = (snapshot.cleanHtml ?? '').trim().length > 0;
  if (coverage >= COVERAGE_THRESHOLD && hasMatchedCss && hasCleanHtml) {
    return buildHybridFrame(snapshot, bodyBg, opts);
  }

  // Tier 3: Inline-styled snapshot (always available)
  return buildSnapshotFrame(snapshot.html, snapshot.css, opts);
}

export function getActiveRenderingTier(snapshot: GetSnapshotResponse): 'stylesheet' | 'hybrid' | 'inline' {
  if (snapshot.stylesheetUrls && snapshot.stylesheetUrls.length > 0 &&
      snapshot.cleanHtml?.trim()) return 'stylesheet';
  const coverage = snapshot.cssRuleCoverage ?? 0;
  if (coverage >= COVERAGE_THRESHOLD && (snapshot.matchedCss ?? '').trim() &&
      (snapshot.cleanHtml ?? '').trim()) return 'hybrid';
  return 'inline';
}

export function buildPlaceholder(message?: string): string {
  return `<div class="preview-placeholder">${message ?? 'No preview'}</div>`;
}
