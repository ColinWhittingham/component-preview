import { renderIndexView } from './views/index-view';
import { renderComponentView } from './views/component-view';

const app = document.getElementById('app')!;

function route(): void {
  // Normalise path: strip leading /components or /components/index.html
  const raw = window.location.pathname.replace(/^\/components(\/index\.html)?/, '') || '/';
  const params = new URLSearchParams(window.location.search);

  // Index: /components/?page=...  →  raw = '/' or ''
  if (raw === '/' || raw === '') {
    const page = params.get('page');
    renderIndexView(app, page);
    return;
  }

  // Component view: /components/[slug]/  →  raw = '/[slug]/'
  const match = raw.match(/^\/([^/]+)\/?$/);
  if (match) {
    const slug = match[1];
    const page = params.get('page') ?? null;
    renderComponentView(app, slug, page, params);
    return;
  }

  app.innerHTML = `<div class="not-found">
    <h1>Not Found</h1>
    <p>No route matched: <code>${raw}</code></p>
    <a href="javascript:history.back()">← Back</a>
  </div>`;
}

route();
