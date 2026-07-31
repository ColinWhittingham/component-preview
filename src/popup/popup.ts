import type { AnalysisCompleteResponse, Message } from '../shared/types';

const btn = document.getElementById('analyse-btn') as HTMLButtonElement;
const status = document.getElementById('status') as HTMLParagraphElement;
const indexLink = document.getElementById('index-link') as HTMLAnchorElement;

function setStatus(text: string, kind: 'default' | 'error' | 'success' = 'default') {
  status.textContent = text;
  status.className = kind === 'default' ? '' : kind;
}

btn.addEventListener('click', async () => {
  btn.disabled = true;
  setStatus('Analysing page…');
  indexLink.style.display = 'none';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found.');
    const tabId = tab.id;

    const result = await new Promise<AnalysisCompleteResponse>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Analysis timed out after 30 s.')),
        30_000
      );

      const listener = (msg: Message) => {
        if (msg.type !== 'ANALYSIS_COMPLETE') return;
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(listener);
        const payload = msg.payload as AnalysisCompleteResponse & { error?: string };
        if (payload.error) reject(new Error(payload.error));
        else resolve(payload);
      };
      chrome.runtime.onMessage.addListener(listener);

      // 1. Set extension flag so the SDK knows to auto-run and postMessage
      chrome.scripting.executeScript({
        target: { tabId },
        func: () => { (window as Record<string, unknown>)['__COMPONENT_PREVIEW_EXTENSION__'] = true; },
        world: 'MAIN',
      })
      // 2. Inject bridge (ISOLATED world) to relay postMessage → chrome.runtime
      .then(() => chrome.scripting.executeScript({
        target: { tabId },
        files: ['content/bridge.js'],
        world: 'ISOLATED',
      }))
      // 3. Inject SDK (MAIN world) — auto-runs analysis and posts results
      .then(() => chrome.scripting.executeScript({
        target: { tabId },
        files: ['sdk/component-preview-sdk.js'],
        world: 'MAIN',
      }))
      .catch((err: Error) => {
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(listener);
        reject(err);
      });
    });

    setStatus(
      `Found ${result.componentCount} component${result.componentCount !== 1 ? 's' : ''}.`,
      'success'
    );
    indexLink.href = result.indexUrl;
    indexLink.style.display = 'block';
  } catch (err) {
    setStatus(err instanceof Error ? err.message : 'Analysis failed.', 'error');
  } finally {
    btn.disabled = false;
  }
});
