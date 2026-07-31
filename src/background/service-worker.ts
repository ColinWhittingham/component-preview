import type {
  Message,
  AnalysePagePayload,
  GetComponentsPayload,
  GetSnapshotPayload,
  FindComponentBySlugPayload,
  ExportComponentPayload,
  GetComponentsResponse,
  GetSnapshotResponse,
  AnalysisCompleteResponse,
  ExportableComponent,
  ComponentRecord,
  PageRecord,
  ComponentSnapshot,
} from '../shared/types';
import {
  savePageRecord,
  saveComponentRecord,
  saveSnapshot,
  getPageRecord,
  getComponentRecords,
  getSnapshot,
  findComponentBySlug,
} from './storage';

// ── URL rewriting: serve components/index.html for all /components/* paths ──
self.addEventListener('fetch', (event: Event) => {
  const fetchEvent = event as FetchEvent;
  const url = new URL(fetchEvent.request.url);
  if (
    url.origin === self.location.origin &&
    url.pathname.startsWith('/components/') &&
    !url.pathname.endsWith('.html') &&
    !url.pathname.endsWith('.js') &&
    !url.pathname.endsWith('.css')
  ) {
    fetchEvent.respondWith(
      fetch(new URL('/components/index.html', self.location.origin).href)
    );
  }
});

// ── Message routing ──
chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse) => {
    handleMessage(message)
      .then((result) => {
        sendResponse(result);
        if (message.type === 'ANALYSE_PAGE') {
          chrome.runtime.sendMessage({
            type: 'ANALYSIS_COMPLETE',
            payload: result,
          } satisfies Message<AnalysisCompleteResponse>);
        }
      })
      .catch((err) => {
        console.error('[SW] message handler error', err);
        sendResponse({ error: String(err) });
      });
    return true;
  }
);

async function handleMessage(message: Message): Promise<unknown> {
  switch (message.type) {
    case 'ANALYSE_PAGE':
      return handleAnalysePage(message.payload as AnalysePagePayload);
    case 'GET_COMPONENTS':
      return handleGetComponents(message.payload as GetComponentsPayload);
    case 'GET_SNAPSHOT':
      return handleGetSnapshot(message.payload as GetSnapshotPayload);
    case 'FIND_COMPONENT_BY_SLUG':
      return findComponentBySlug((message.payload as FindComponentBySlugPayload).slug);
    case 'EXPORT_COMPONENT':
      return handleExportComponent(message.payload as ExportComponentPayload);
    default:
      return null;
  }
}

async function handleAnalysePage(
  payload: AnalysePagePayload
): Promise<AnalysisCompleteResponse> {
  const pageRecord: PageRecord = {
    url: payload.pageUrl,
    title: payload.pageTitle,
    framework: payload.framework,
    analyzedAt: Date.now(),
    componentSlugs: payload.components.map((c) => c.slug),
  };
  await savePageRecord(pageRecord);

  for (const comp of payload.components) {
    const id = `${payload.pageUrl}:${comp.slug}`;
    const snapshotId = `snap:${id}`;

    const record: ComponentRecord = {
      id,
      pageUrl: payload.pageUrl,
      slug: comp.slug,
      displayName: comp.displayName,
      sourceType: comp.sourceType,
      frameworkName: comp.frameworkName,
      properties: comp.properties,
      instanceCount: comp.instanceCount,
      previewSnapshotId: snapshotId,
    };
    await saveComponentRecord(record);

    const snapshot: ComponentSnapshot = {
      id: snapshotId,
      componentId: id,
      html: comp.snapshot.html,
      css: comp.snapshot.css,
      cleanHtml: comp.cleanHtml ?? '',
      matchedCss: comp.matchedCss ?? '',
      designTokens: comp.designTokens ?? '',
      fonts: comp.fonts ?? [],
      capturedAt: Date.now(),
      cssRuleCoverage: comp.cssRuleCoverage ?? 0,
      stylesheetUrls: comp.stylesheetUrls ?? [],
    };
    await saveSnapshot(snapshot);
  }

  const extensionId = chrome.runtime.id;
  const encodedUrl = encodeURIComponent(payload.pageUrl);
  const indexUrl = `chrome-extension://${extensionId}/components/index.html?page=${encodedUrl}`;

  return { indexUrl, componentCount: payload.components.length };
}

async function handleGetComponents(
  payload: GetComponentsPayload
): Promise<GetComponentsResponse> {
  const pageRecord = await getPageRecord(payload.pageUrl);
  const components = await getComponentRecords(payload.pageUrl);
  return { pageRecord, components };
}

async function handleGetSnapshot(
  payload: GetSnapshotPayload
): Promise<GetSnapshotResponse | null> {
  const snapshot = await getSnapshot(payload.componentId);
  if (!snapshot) return null;
  return {
    html: snapshot.html,
    css: snapshot.css,
    cleanHtml: snapshot.cleanHtml ?? '',
    matchedCss: snapshot.matchedCss ?? '',
    designTokens: snapshot.designTokens ?? '',
    fonts: snapshot.fonts ?? [],
    cssRuleCoverage: snapshot.cssRuleCoverage ?? 0,
    stylesheetUrls: snapshot.stylesheetUrls ?? [],
  };
}

async function handleExportComponent(
  payload: ExportComponentPayload
): Promise<ExportableComponent | null> {
  const { componentId, pageUrl } = payload;
  const key = `component:${componentId}`;
  const result = await chrome.storage.local.get(key);
  const record = result[key] as ComponentRecord | undefined;
  if (!record) return null;

  const snapshot = await getSnapshot(record.previewSnapshotId);
  if (!snapshot) return null;

  return {
    slug: record.slug,
    displayName: record.displayName,
    frameworkName: record.frameworkName,
    sourceType: record.sourceType,
    sourceUrl: pageUrl,
    properties: record.properties,
    cleanHtml: snapshot.cleanHtml || snapshot.html,
    matchedCss: snapshot.matchedCss || snapshot.css,
    designTokens: snapshot.designTokens || '',
    fonts: snapshot.fonts || [],
    capturedAt: snapshot.capturedAt,
  };
}
