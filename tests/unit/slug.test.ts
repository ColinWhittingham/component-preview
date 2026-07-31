// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { generateSlug, toDisplayName } from '../../sdk/slug';

function makeEl(tag: string, attrs: Record<string, string> = {}, classes: string[] = []): Element {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const cls of classes) el.classList.add(cls);
  return el;
}

describe('generateSlug', () => {
  let existing: Set<string>;
  beforeEach(() => { existing = new Set(); });

  it('uses frameworkName when provided', () => {
    const el = makeEl('div');
    expect(generateSlug(el, { frameworkName: 'HeroBanner', existingSlugs: existing, index: 0 })).toBe('hero-banner');
  });

  it('uses data-component attribute', () => {
    const el = makeEl('div', { 'data-component': 'ProductCard' });
    expect(generateSlug(el, { frameworkName: null, existingSlugs: existing, index: 0 })).toBe('product-card');
  });

  it('uses data-testid attribute when no data-component', () => {
    const el = makeEl('div', { 'data-testid': 'hero-section' });
    expect(generateSlug(el, { frameworkName: null, existingSlugs: existing, index: 0 })).toBe('hero-section');
  });

  it('uses aria-label attribute', () => {
    const el = makeEl('section', { 'aria-label': 'Main Navigation' });
    expect(generateSlug(el, { frameworkName: null, existingSlugs: existing, index: 0 })).toBe('main-navigation');
  });

  it('uses first semantic CSS class (skips short/ignored classes)', () => {
    const el = makeEl('div', {}, ['active', 'hero-banner-container']);
    expect(generateSlug(el, { frameworkName: null, existingSlugs: existing, index: 0 })).toBe('hero-banner-container');
  });

  it('falls back to tagName + index when no other signal', () => {
    const el = makeEl('div');
    expect(generateSlug(el, { frameworkName: null, existingSlugs: existing, index: 2 })).toBe('div-3');
  });

  it('deduplicates with numeric suffix', () => {
    const el1 = makeEl('div');
    const el2 = makeEl('div');
    const slug1 = generateSlug(el1, { frameworkName: 'HeroBanner', existingSlugs: existing, index: 0 });
    const slug2 = generateSlug(el2, { frameworkName: 'HeroBanner', existingSlugs: existing, index: 1 });
    expect(slug1).toBe('hero-banner');
    expect(slug2).toBe('hero-banner-2');
  });

  it('deduplicates with incrementing suffix beyond -2', () => {
    const el = makeEl('div');
    existing.add('card');
    existing.add('card-2');
    expect(generateSlug(el, { frameworkName: 'Card', existingSlugs: existing, index: 0 })).toBe('card-3');
  });
});

describe('toDisplayName', () => {
  it('converts kebab slug to title case', () => {
    expect(toDisplayName('hero-banner')).toBe('Hero Banner');
    expect(toDisplayName('product-card')).toBe('Product Card');
    expect(toDisplayName('nav')).toBe('Nav');
  });
});
