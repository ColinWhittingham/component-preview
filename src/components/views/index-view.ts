import type {
  Message,
  GetComponentsPayload,
  GetComponentsResponse,
  GetSnapshotPayload,
  GetSnapshotResponse,
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
  const instanceBadge = comp.instanceCount > 1 ? `<span class="badge badge--count">×${comp.instanceCount}</span>` : '';
  return `
    <a class="card" href="${url}">
      <div class="card__preview">${buildPreviewCard(snapshot)}</div>
      <div class="card__info">
        <span class="card__name">${comp.displayName}</span>
        <div class="card__badges">${badge}${instanceBadge}</div>
      </div>
    </a>`;
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

  const snapshots = await Promise.all(
    components.map((c) => loadSnapshot(c.previewSnapshotId))
  );

  const cards = components
    .map((comp, i) => buildCard(comp, snapshots[i], pageUrl))
    .join('');

  root.innerHTML = `
    <header class="index-header">
      <div class="index-header__meta">
        <h1 class="index-header__title">${pageHost}</h1>
        <span class="badge">${label}</span>
        <span class="badge badge--count">${components.length} component${components.length !== 1 ? 's' : ''}</span>
      </div>
      <p class="index-header__url">${pageUrl}</p>
    </header>
    <main class="card-grid">${cards}</main>`;
}
