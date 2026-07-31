// Assembles a self-contained HTML document from component data,
// suitable for pasting into an AI chat tool or saving as a file.

import type { ExportableComponent, PageHierarchy } from './types';

export function buildExportHtml(
  component: ExportableComponent,
  hierarchy?: PageHierarchy,
): string {
  const meta = buildMetadataComment(component);
  const styleBlock = buildStyleBlock(component);
  const title = `${component.displayName} — Component Preview`;

  let hierarchyBlock = '';
  if (hierarchy) {
    try {
      hierarchyBlock = `\n\n<!-- PAGE_HIERARCHY\n${JSON.stringify(hierarchy, null, 2)}\n-->`;
    } catch { /* skip if serialization fails */ }
  }

  return `${meta}${hierarchyBlock}
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
${styleBlock}
  </style>
</head>
<body>
${component.cleanHtml}
</body>
</html>`;
}

function buildMetadataComment(c: ExportableComponent): string {
  const lines = [
    `Component: ${c.displayName}`,
    `Source: ${c.sourceUrl}`,
  ];
  if (c.frameworkName) {
    lines.push(`Framework: ${c.sourceType} (${c.frameworkName})`);
  }
  lines.push(`Captured: ${new Date(c.capturedAt).toISOString()}`);

  if (c.properties.length > 0) {
    lines.push('');
    lines.push('Properties:');
    for (const p of c.properties) {
      lines.push(`  ${p.name} (${p.source}): "${p.defaultValue}"`);
    }
  }

  return `<!--\n${lines.map(l => '  ' + l).join('\n')}\n-->`;
}

function buildStyleBlock(c: ExportableComponent): string {
  const sections: string[] = [];

  if (c.designTokens.trim()) {
    sections.push(`    /* === Design Tokens === */\n    ${c.designTokens.trim()}`);
  }

  if (c.fonts.length > 0) {
    sections.push(`    /* === Fonts === */\n    ${c.fonts.join('\n    ')}`);
  }

  if (c.matchedCss.trim()) {
    sections.push(`    /* === Component Styles === */\n    ${c.matchedCss.trim()}`);
  }

  return sections.join('\n\n');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
