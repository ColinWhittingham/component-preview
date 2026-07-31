// Runs in ISOLATED world. Relays messages from the MAIN world analyzer
// (which cannot access chrome.runtime) back to the extension.
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== 'component-preview-analyzer') return;
  chrome.runtime.sendMessage(event.data.message);
});
