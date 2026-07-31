// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { escapeForSrcdoc, buildSnapshotFrame, buildPreviewFrame, buildPlaceholder } from '../../src/components/views/preview-frame';
import type { GetSnapshotResponse } from '../../sdk/types';

function makeSnapshot(overrides: Partial<GetSnapshotResponse> = {}): GetSnapshotResponse {
  return {
    html: '<div style="color:red">inline</div>',
    css: '* { box-sizing: border-box; }',
    cleanHtml: '<div class="comp">clean</div>',
    matchedCss: '.comp { color: blue; }',
    designTokens: ':root { --primary: #000; }',
    fonts: ['@font-face { font-family: X; src: url(x.woff2); }'],
    cssRuleCoverage: 0,
    stylesheetUrls: [],
    ...overrides,
  };
}

describe('escapeForSrcdoc', () => {
  it('escapes & before "', () => {
    const input = 'He said &amp; she said "hello"';
    const result = escapeForSrcdoc(input);
    expect(result).toBe('He said &amp;amp; she said &quot;hello&quot;');
  });

  it('preserves &lt; entities through the srcdoc roundtrip', () => {
    expect(escapeForSrcdoc('&lt;script&gt;')).toBe('&amp;lt;script&amp;gt;');
  });

  it('handles &nbsp; entities', () => {
    expect(escapeForSrcdoc('hello&nbsp;world')).toBe('hello&amp;nbsp;world');
  });

  it('handles strings with no special characters', () => {
    expect(escapeForSrcdoc('plain text')).toBe('plain text');
  });

  it('handles empty string', () => {
    expect(escapeForSrcdoc('')).toBe('');
  });
});

describe('buildSnapshotFrame', () => {
  it('produces an iframe with srcdoc attribute', () => {
    const result = buildSnapshotFrame('<div>hi</div>', 'p{color:red}', { className: 'test-frame' });
    expect(result).toMatch(/^<iframe /);
    expect(result).toContain('srcdoc="');
    expect(result).toContain('class="test-frame"');
  });

  it('does NOT include loading="lazy"', () => {
    const result = buildSnapshotFrame('<div></div>', '', { className: 'f' });
    expect(result).not.toContain('loading=');
  });

  it('includes sandbox attribute', () => {
    const result = buildSnapshotFrame('<div></div>', '', { className: 'f' });
    expect(result).toContain('sandbox="allow-same-origin"');
  });

  it('respects overflow option', () => {
    const hidden = buildSnapshotFrame('<div></div>', '', { className: 'f', overflow: 'hidden' });
    const auto = buildSnapshotFrame('<div></div>', '', { className: 'f', overflow: 'auto' });
    expect(hidden).toContain('overflow:hidden');
    expect(auto).toContain('overflow:auto');
  });

  it('correctly escapes HTML entities in snapshot content', () => {
    const html = '<span>&amp; &lt; &nbsp;</span>';
    const result = buildSnapshotFrame(html, '', { className: 'f' });
    expect(result).toContain('&amp;amp;');
    expect(result).toContain('&amp;lt;');
    expect(result).toContain('&amp;nbsp;');
  });
});

describe('buildPreviewFrame', () => {
  it('Tier 1: uses stylesheet URLs when available', () => {
    const snapshot = makeSnapshot({ stylesheetUrls: ['https://cdn.example.com/style.css'] });
    const result = buildPreviewFrame(snapshot, { className: 'f' });
    expect(result).toContain('cdn.example.com/style.css');
    expect(result).toContain('clean');
    expect(result).not.toContain('style=');
  });

  it('Tier 2: uses hybrid CSS when coverage is good', () => {
    const snapshot = makeSnapshot({ cssRuleCoverage: 0.85, stylesheetUrls: [] });
    const result = buildPreviewFrame(snapshot, { className: 'f' });
    expect(result).toContain('clean');
    expect(result).toContain('color: blue');
  });

  it('Tier 3: falls back to inline when coverage is low', () => {
    const snapshot = makeSnapshot({ cssRuleCoverage: 0.3, matchedCss: '.x{color:red}', stylesheetUrls: [] });
    const result = buildPreviewFrame(snapshot, { className: 'f' });
    expect(result).toContain('inline');
    expect(result).toContain('style=');
  });

  it('Tier 3: falls back when no clean HTML', () => {
    const snapshot = makeSnapshot({ cleanHtml: '', matchedCss: '', stylesheetUrls: [] });
    const result = buildPreviewFrame(snapshot, { className: 'f' });
    expect(result).toContain('inline');
  });

  it('produces an iframe', () => {
    const snapshot = makeSnapshot();
    const result = buildPreviewFrame(snapshot, { className: 'test-frame' });
    expect(result).toMatch(/^<iframe /);
    expect(result).toContain('class="test-frame"');
  });
});

describe('buildPlaceholder', () => {
  it('returns default message', () => {
    expect(buildPlaceholder()).toContain('No preview');
  });

  it('uses custom message', () => {
    expect(buildPlaceholder('Custom')).toContain('Custom');
  });
});
