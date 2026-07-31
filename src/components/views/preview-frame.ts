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

export function buildSnapshotFrame(
  html: string,
  css: string,
  opts: FrameOptions,
): string {
  const overflow = opts.overflow ?? 'auto';
  const sandbox = opts.sandbox ?? 'allow-same-origin';
  const title = opts.title ?? 'Component preview';

  // Extract background from the outermost element's inline style to set on body,
  // preventing white-text-on-white-background when the component expects a dark parent
  const bgMatch = html.match(/^<div[^>]+style="[^"]*?(background(?:-color)?:[^;]+)/);
  const bodyBg = bgMatch ? bgMatch[1] + ';' : '';
  const doc = `<!DOCTYPE html><html><head><style>*{box-sizing:border-box;}body{margin:0;overflow:${overflow};${bodyBg}}${css}</style></head><body>${html}</body></html>`;

  return `<iframe class="${opts.className}" srcdoc="${escapeForSrcdoc(doc)}" sandbox="${sandbox}" title="${title}"></iframe>`;
}

function buildStylesheetFrame(
  cleanHtml: string,
  stylesheetUrls: string[],
  designTokens: string,
  opts: FrameOptions,
): string {
  const overflow = opts.overflow ?? 'auto';
  const sandbox = opts.sandbox ?? 'allow-same-origin';
  const title = opts.title ?? 'Component preview';

  const linkTags = stylesheetUrls
    .map(url => `<link rel="stylesheet" href="${url}">`)
    .join('\n');
  const tokenStyle = designTokens ? `<style>${designTokens}</style>` : '';

  const doc = `<!DOCTYPE html><html><head>${linkTags}${tokenStyle}<style>body{margin:0;overflow:${overflow};}</style></head><body>${cleanHtml}</body></html>`;

  return `<iframe class="${opts.className}" srcdoc="${escapeForSrcdoc(doc)}" sandbox="${sandbox}" title="${title}"></iframe>`;
}

function buildHybridFrame(
  snapshot: GetSnapshotResponse,
  opts: FrameOptions,
): string {
  const overflow = opts.overflow ?? 'auto';
  const sections: string[] = [
    '*, *::before, *::after { box-sizing: border-box; }',
    `body { margin: 0; overflow: ${overflow}; }`,
  ];
  if (snapshot.designTokens?.trim()) sections.push(snapshot.designTokens);
  if (snapshot.fonts?.length) sections.push(snapshot.fonts.join('\n'));
  sections.push(snapshot.matchedCss);
  const css = sections.join('\n');

  const sandbox = opts.sandbox ?? 'allow-same-origin';
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
  // Tier 1: Original stylesheets + clean HTML
  if (snapshot.stylesheetUrls && snapshot.stylesheetUrls.length > 0 &&
      snapshot.cleanHtml?.trim()) {
    return buildStylesheetFrame(snapshot.cleanHtml, snapshot.stylesheetUrls,
      snapshot.designTokens ?? '', opts);
  }

  // Tier 2: Hybrid CSS (clean HTML + matched rules) when coverage is good
  const coverage = snapshot.cssRuleCoverage ?? 0;
  const hasMatchedCss = (snapshot.matchedCss ?? '').trim().length > 0;
  const hasCleanHtml = (snapshot.cleanHtml ?? '').trim().length > 0;
  if (coverage >= COVERAGE_THRESHOLD && hasMatchedCss && hasCleanHtml) {
    return buildHybridFrame(snapshot, opts);
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
