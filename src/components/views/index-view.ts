import type {
  Message,
  GetComponentsPayload,
  GetComponentsResponse,
  GetSnapshotPayload,
  GetSnapshotResponse,
  HierarchyNode,
  PageHierarchy,
  ComponentRecord,
} from '../../shared/types';
import { buildPreviewFrame as buildFrame, buildPlaceholder } from './preview-frame';

function componentUrl(slug: string, pageUrl: string | null): string {
  const base = `${window.location.origin}/components/${slug}/`;
  return pageUrl ? `${base}?page=${encodeURIComponent(pageUrl)}` : base;
}

async function loadSnapshot(
  componentId: string
): Promise<GetSnapshotResponse | null> {
  return chrome.runtime.sendMessage<Message<GetSnapshotPayload>, GetSnapshotResponse | null>({
    type: 'GET_SNAPSHOT',
    payload: { componentId },
  });
}

function buildPreviewCard(snapshot: GetSnapshotResponse | null): string {
  if (!snapshot) return buildPlaceholder();
  return buildFrame(snapshot, {
    className: 'preview-frame',
    overflow: 'hidden',
  });
}

function buildCard(comp: ComponentRecord, snapshot: GetSnapshotResponse | null, pageUrl: string | null): string {
  const url = componentUrl(comp.slug, pageUrl);
  const badge = `<span class="badge">${comp.sourceType === 'framework' ? comp.frameworkName ?? comp.sourceType : 'HTML'}</span>`;
  const instanceBadge = comp.instanceCount > 1 ? `<span class="badge badge--count">${comp.instanceCount}</span>` : '';
  return `
    <a class="card" href="${url}">
      <div class="card__preview">${buildPreviewCard(snapshot)}</div>
      <div class="card__info">
        <span class="card__name">${comp.displayName}</span>
        <div class="card__badges">${badge}${instanceBadge}</div>
      </div>
    </a>`;
}

// Group components by their nearest section ancestor in the hierarchy tree
interface SectionGroup {
  sectionName: string;
  components: ComponentRecord[];
}

function findSectionForSlug(node: HierarchyNode, slug: string, sectionPath: string[]): string | null {
  if (node.componentSlug === slug) {
    return sectionPath.length > 0 ? sectionPath[sectionPath.length - 1] : 'Page';
  }
  const isSectionNode = /^(header|nav|main|section|article|aside|footer)$/i.test(node.tag) ||
    node.role === 'banner' || node.role === 'navigation' || node.role === 'main' ||
    node.role === 'contentinfo' || node.role === 'complementary';

  const newPath = isSectionNode
    ? [...sectionPath, describeSectionNode(node)]
    : sectionPath;

  for (const child of node.children) {
    const found = findSectionForSlug(child, slug, newPath);
    if (found) return found;
  }
  return null;
}

function describeSectionNode(node: HierarchyNode): string {
  if (node.role) {
    const roleNames: Record<string, string> = {
      banner: 'Header', navigation: 'Navigation', main: 'Main Content',
      contentinfo: 'Footer', complementary: 'Sidebar',
    };
    return roleNames[node.role] ?? node.role.charAt(0).toUpperCase() + node.role.slice(1);
  }
  const tagNames: Record<string, string> = {
    header: 'Header', nav: 'Navigation', main: 'Main Content',
    footer: 'Footer', aside: 'Sidebar', article: 'Article',
  };
  const baseName = tagNames[node.tag] ?? node.tag.charAt(0).toUpperCase() + node.tag.slice(1);
  if (node.classes?.length) {
    const className = node.classes[0].split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return className;
  }
  return baseName;
}

function groupBySection(
  components: ComponentRecord[],
  hierarchy: PageHierarchy | null,
): SectionGroup[] {
  if (!hierarchy?.rootNode) {
    return [{ sectionName: 'All Components', components }];
  }

  const groups = new Map<string, ComponentRecord[]>();
  const order: string[] = [];

  for (const comp of components) {
    const section = findSectionForSlug(hierarchy.rootNode, comp.slug, []) ?? 'Other';
    if (!groups.has(section)) {
      groups.set(section, []);
      order.push(section);
    }
    groups.get(section)!.push(comp);
  }

  return order.map(name => ({ sectionName: name, components: groups.get(name)! }));
}

export async function renderIndexView(root: HTMLElement, pageUrl: string | null): Promise<void> {
  root.innerHTML = '<div class="spinner" aria-label="Loading…"></div>';

  if (!pageUrl) {
    root.innerHTML = `<div class="empty-state">
      <h1>Component Preview</h1>
      <p>No page specified. Activate the extension on a page first, then follow the link from the popup.</p>
    </div>`;
    return;
  }

  const response = await chrome.runtime.sendMessage<Message<GetComponentsPayload>, GetComponentsResponse>({
    type: 'GET_COMPONENTS',
    payload: { pageUrl },
  });

  if (!response?.components?.length) {
    root.innerHTML = `<div class="empty-state">
      <h1>No components found</h1>
      <p>No components were recorded for <code>${pageUrl}</code>.</p>
      <p>Navigate to that page and activate the extension, then return here.</p>
    </div>`;
    return;
  }

  const { pageRecord, components } = response;
  const pageHost = new URL(pageUrl).hostname;
  const framework = pageRecord?.framework ?? 'html';
  const label = framework === 'html' ? 'HTML' : framework.charAt(0).toUpperCase() + framework.slice(1);

  // Load hierarchy for section grouping
  const hierarchy = await chrome.runtime.sendMessage<Message, PageHierarchy | null>({
    type: 'GET_HIERARCHY',
    payload: null,
  });

  const snapshots = await Promise.all(
    components.map((c) => loadSnapshot(c.previewSnapshotId))
  );
  const snapshotMap = new Map<string, GetSnapshotResponse | null>();
  components.forEach((c, i) => snapshotMap.set(c.slug, snapshots[i]));

  const sections = groupBySection(components, hierarchy);
  const hasSections = sections.length > 1 || sections[0]?.sectionName !== 'All Components';

  let gridHtml: string;
  if (hasSections) {
    gridHtml = sections.map(section => {
      const sectionCards = section.components
        .map(comp => buildCard(comp, snapshotMap.get(comp.slug) ?? null, pageUrl))
        .join('');
      return `
        <section class="section-group">
          <h2 class="section-group__title">${section.sectionName}
            <span class="badge badge--count">${section.components.length}</span>
          </h2>
          <div class="card-grid">${sectionCards}</div>
        </section>`;
    }).join('');
  } else {
    const cards = components
      .map((comp, i) => buildCard(comp, snapshots[i], pageUrl))
      .join('');
    gridHtml = `<main class="card-grid">${cards}</main>`;
  }

  root.innerHTML = `
    <header class="index-header">
      <div class="index-header__meta">
        <h1 class="index-header__title">${pageHost}</h1>
        <span class="badge">${label}</span>
        <span class="badge badge--count">${components.length} component${components.length !== 1 ? 's' : ''}</span>
        <button class="btn-export" id="copy-all-json" title="Copy all components as structured JSON — the full page catalogue for AI consumption">Copy All JSON</button>
      </div>
      <p class="index-header__url">${pageUrl}</p>
    </header>
    ${gridHtml}
    <div class="toast" id="toast"></div>`;

  // Copy All JSON handler
  root.querySelector('#copy-all-json')?.addEventListener('click', async () => {
    const allComponents = await Promise.all(
      components.map(async (comp) => {
        const snap = snapshotMap.get(comp.slug);
        const encodedPage = encodeURIComponent(pageUrl!);
        return {
          slug: comp.slug,
          name: comp.displayName,
          url: `${window.location.origin}/components/${comp.slug}/?page=${encodedPage}`,
          framework: comp.frameworkName,
          sourceType: comp.sourceType,
          properties: comp.properties.map(p => ({
            name: p.name,
            type: p.type,
            source: p.source,
            defaultValue: p.defaultValue,
            ...(p.values ? { values: p.values } : {}),
          })),
          html: snap?.cleanHtml || snap?.html || '',
          css: snap?.matchedCss || snap?.css || '',
          designTokens: snap?.designTokens || '',
          fonts: snap?.fonts || [],
        };
      })
    );

    const json = JSON.stringify({
      page: { url: pageUrl, title: pageRecord?.title ?? '', framework },
      components: allComponents,
      ...(hierarchy ? { hierarchy } : {}),
    }, null, 2);

    try {
      await navigator.clipboard.writeText(json);
      const toast = root.querySelector('#toast') as HTMLElement | null;
      if (toast) {
        toast.textContent = `${allComponents.length} components copied as JSON`;
        toast.classList.add('toast--visible');
        setTimeout(() => toast.classList.remove('toast--visible'), 2000);
      }
    } catch {
      const toast = root.querySelector('#toast') as HTMLElement | null;
      if (toast) {
        toast.textContent = 'Clipboard access denied';
        toast.classList.add('toast--visible');
        setTimeout(() => toast.classList.remove('toast--visible'), 2000);
      }
    }
  });
}
