const IGNORED_CLASSES = new Set([
  'active', 'open', 'hidden', 'visible', 'show', 'hide', 'disabled',
  'selected', 'focused', 'expanded', 'collapsed', 'loading', 'error',
  'wrapper', 'container', 'inner', 'outer', 'content', 'body', 'main',
]);

function toKebab(name: string): string {
  return name
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function firstSemanticClass(el: Element): string | null {
  for (const cls of Array.from(el.classList)) {
    if (cls.length >= 5 && !IGNORED_CLASSES.has(cls.toLowerCase())) {
      return toKebab(cls);
    }
  }
  return null;
}

export function generateSlug(
  el: Element,
  opts: {
    frameworkName?: string | null;
    existingSlugs: Set<string>;
    index: number;
  }
): string {
  const { frameworkName, existingSlugs, index } = opts;

  let base: string | null = null;

  if (frameworkName) {
    base = toKebab(frameworkName);
  } else if (el.getAttribute('data-component')) {
    base = toKebab(el.getAttribute('data-component')!);
  } else if (el.getAttribute('data-testid')) {
    base = toKebab(el.getAttribute('data-testid')!);
  } else if (el.getAttribute('aria-label')) {
    base = toKebab(el.getAttribute('aria-label')!);
  } else {
    base = firstSemanticClass(el);
  }

  if (!base) {
    const role = el.getAttribute('role') || el.tagName.toLowerCase();
    base = `${toKebab(role)}-${index + 1}`;
  }

  if (!existingSlugs.has(base)) {
    existingSlugs.add(base);
    return base;
  }

  let suffix = 2;
  while (existingSlugs.has(`${base}-${suffix}`)) suffix++;
  const slug = `${base}-${suffix}`;
  existingSlugs.add(slug);
  return slug;
}

export function toDisplayName(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
