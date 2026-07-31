// Infers configurable properties from matched CSS rules.
// Detects theme variants, BEM class variants, state classes, and media breakpoints.

export interface InferredProperty {
  name: string;
  defaultValue: string;
  type: 'string' | 'enum' | 'number' | 'boolean';
  source: 'css-attribute' | 'css-class' | 'css-media' | 'prop' | 'attribute' | 'slot';
  values?: string[];
}

// Detect [data-*="value"] attribute selector patterns
const ATTR_SELECTOR_RE = /\[data-(theme|mode|variant|color-scheme|style|layout|size|state)\s*=\s*["']?([^"'\]]+)["']?\]/gi;

// Detect BEM modifier patterns: .block--modifier
const BEM_MODIFIER_RE = /\.([\w-]+)--([\w-]+)/g;

// Detect state class patterns: .is-state, .has-state
const STATE_CLASS_RE = /\.(is|has)-([\w-]+)/g;

// Detect @media breakpoints
const MEDIA_WIDTH_RE = /(min|max)-width\s*:\s*(\d+(?:\.\d+)?)(px|em|rem)/gi;

export function inferPropertiesFromCss(
  root: Element,
  matchedRules: CSSStyleRule[],
  mediaConditions: string[],
): InferredProperty[] {
  const properties: InferredProperty[] = [];
  const seenNames = new Set<string>();

  // 1. Attribute selector variants
  const attrVariants = new Map<string, Set<string>>();
  for (const rule of matchedRules) {
    let match: RegExpExecArray | null;
    ATTR_SELECTOR_RE.lastIndex = 0;
    while ((match = ATTR_SELECTOR_RE.exec(rule.selectorText)) !== null) {
      const attrName = match[1];
      const attrValue = match[2];
      if (!attrVariants.has(attrName)) attrVariants.set(attrName, new Set());
      attrVariants.get(attrName)!.add(attrValue);
    }
  }

  for (const [attrName, values] of attrVariants) {
    if (values.size < 2) continue; // Need at least 2 variants
    const currentValue = root.getAttribute(`data-${attrName}`) ?? Array.from(values)[0];
    if (!seenNames.has(attrName)) {
      seenNames.add(attrName);
      properties.push({
        name: attrName,
        defaultValue: currentValue,
        type: 'enum',
        source: 'css-attribute',
        values: Array.from(values),
      });
    }
  }

  // Also detect single-value attribute selectors if the element has the data attribute
  // (the page may only have CSS for the current value, but the attribute is still configurable)
  for (const attr of Array.from(root.attributes)) {
    if (attr.name.startsWith('data-') && !attr.name.startsWith('data-react') &&
        !attr.name.startsWith('data-v-') && !attr.name.startsWith('data-test')) {
      const name = attr.name.replace('data-', '');
      if (seenNames.has(name)) continue;
      // Check if any CSS rules reference this attribute
      const hasRule = matchedRules.some(r => r.selectorText.includes(`[${attr.name}`));
      if (hasRule || ['theme', 'mode', 'variant', 'style', 'layout', 'size'].includes(name)) {
        const existingValues = attrVariants.get(name);
        seenNames.add(name);
        properties.push({
          name,
          defaultValue: attr.value,
          type: existingValues && existingValues.size > 1 ? 'enum' : 'string',
          source: 'css-attribute',
          values: existingValues ? Array.from(existingValues) : undefined,
        });
      }
    }
  }

  // 2. BEM modifier variants
  const bemGroups = new Map<string, Set<string>>();
  for (const rule of matchedRules) {
    BEM_MODIFIER_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = BEM_MODIFIER_RE.exec(rule.selectorText)) !== null) {
      const block = match[1];
      const modifier = match[2];
      if (!bemGroups.has(block)) bemGroups.set(block, new Set());
      bemGroups.get(block)!.add(modifier);
    }
  }

  for (const [block, modifiers] of bemGroups) {
    if (modifiers.size < 2) continue;
    const propName = `${block}Variant`;
    if (seenNames.has(propName)) continue;
    // Determine current value from root's class list
    let currentValue = Array.from(modifiers)[0];
    for (const mod of modifiers) {
      if (root.classList.contains(`${block}--${mod}`)) { currentValue = mod; break; }
    }
    seenNames.add(propName);
    properties.push({
      name: propName,
      defaultValue: currentValue,
      type: 'enum',
      source: 'css-class',
      values: Array.from(modifiers),
    });
  }

  // 3. State class variants
  const stateGroups = new Map<string, Set<string>>();
  for (const rule of matchedRules) {
    STATE_CLASS_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = STATE_CLASS_RE.exec(rule.selectorText)) !== null) {
      const prefix = match[1]; // 'is' or 'has'
      const state = match[2];
      const group = prefix;
      if (!stateGroups.has(group)) stateGroups.set(group, new Set());
      stateGroups.get(group)!.add(state);
    }
  }

  for (const [prefix, states] of stateGroups) {
    for (const state of states) {
      const propName = `${prefix}${state.charAt(0).toUpperCase() + state.slice(1)}`;
      if (seenNames.has(propName)) continue;
      const currentValue = root.classList.contains(`${prefix}-${state}`) ? 'true' : 'false';
      seenNames.add(propName);
      properties.push({
        name: propName,
        defaultValue: currentValue,
        type: 'boolean',
        source: 'css-class',
      });
    }
  }

  // 4. Responsive breakpoints from @media conditions
  const breakpoints = new Set<string>();
  for (const condition of mediaConditions) {
    MEDIA_WIDTH_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = MEDIA_WIDTH_RE.exec(condition)) !== null) {
      const value = `${match[2]}${match[3]}`;
      breakpoints.add(value);
    }
  }

  if (breakpoints.size > 0 && !seenNames.has('viewport')) {
    const sorted = Array.from(breakpoints).sort((a, b) => parseFloat(a) - parseFloat(b));
    seenNames.add('viewport');
    properties.push({
      name: 'viewport',
      defaultValue: `${window.innerWidth}px`,
      type: 'enum',
      source: 'css-media',
      values: sorted,
    });
  }

  return properties;
}

// Merge CSS-inferred properties with HTML-extracted properties.
// CSS-inferred properties enrich existing HTML properties (add values array)
// and add new properties not detected from HTML.
export function mergeProperties(
  htmlProps: InferredProperty[],
  cssProps: InferredProperty[],
): InferredProperty[] {
  const merged = new Map<string, InferredProperty>();

  // Start with HTML properties
  for (const prop of htmlProps) {
    merged.set(prop.name, { ...prop });
  }

  // Merge or add CSS properties
  for (const cssProp of cssProps) {
    const existing = merged.get(cssProp.name);
    if (existing) {
      // Enrich: if CSS found values for an existing text prop, upgrade it to enum
      if (cssProp.values && cssProp.values.length > 1) {
        existing.type = 'enum';
        existing.values = cssProp.values;
        existing.source = cssProp.source;
      }
    } else {
      merged.set(cssProp.name, { ...cssProp });
    }
  }

  return Array.from(merged.values());
}
