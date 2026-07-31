import type { PageRecord, ComponentRecord, ComponentSnapshot } from '../shared/types';

const DB_NAME = 'component-preview';
const DB_VERSION = 2;
const SNAPSHOTS_STORE = 'snapshots';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(SNAPSHOTS_STORE)) {
        req.result.createObjectStore(SNAPSHOTS_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// PageRecord helpers
export async function savePageRecord(record: PageRecord): Promise<void> {
  await chrome.storage.local.set({ [`page:${record.url}`]: record });
}

export async function getPageRecord(url: string): Promise<PageRecord | null> {
  const result = await chrome.storage.local.get(`page:${url}`);
  return (result[`page:${url}`] as PageRecord) ?? null;
}

// ComponentRecord helpers
export async function saveComponentRecord(record: ComponentRecord): Promise<void> {
  await chrome.storage.local.set({ [`component:${record.id}`]: record });
}

export async function getComponentRecords(pageUrl: string): Promise<ComponentRecord[]> {
  const page = await getPageRecord(pageUrl);
  if (!page) return [];
  const keys = page.componentSlugs.map((slug) => `component:${pageUrl}:${slug}`);
  if (keys.length === 0) return [];
  const result = await chrome.storage.local.get(keys);
  return keys.map((k) => result[k] as ComponentRecord).filter(Boolean);
}

// Slug lookup: find a component across all analysed pages
export async function findComponentBySlug(
  slug: string
): Promise<{ pageUrl: string; component: ComponentRecord } | null> {
  const all = await chrome.storage.local.get(null);
  let best: { pageUrl: string; component: ComponentRecord; analyzedAt: number } | null = null;

  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith('page:')) continue;
    const page = value as PageRecord;
    if (!page.componentSlugs.includes(slug)) continue;

    const comp = all[`component:${page.url}:${slug}`] as ComponentRecord | undefined;
    if (!comp) continue;

    if (!best || page.analyzedAt > best.analyzedAt) {
      best = { pageUrl: page.url, component: comp, analyzedAt: page.analyzedAt };
    }
  }

  return best ? { pageUrl: best.pageUrl, component: best.component } : null;
}

// ComponentSnapshot helpers
export async function saveSnapshot(snapshot: ComponentSnapshot): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SNAPSHOTS_STORE, 'readwrite');
    tx.objectStore(SNAPSHOTS_STORE).put(snapshot);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getSnapshot(id: string): Promise<ComponentSnapshot | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SNAPSHOTS_STORE, 'readonly');
    const req = tx.objectStore(SNAPSHOTS_STORE).get(id);
    req.onsuccess = () => resolve((req.result as ComponentSnapshot) ?? null);
    req.onerror = () => reject(req.error);
  });
}
