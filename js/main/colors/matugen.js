import { installColorMode } from './runtime.js';

const urls = [
  'https://steamloopback.host/skins/Material-Theme/css/main/colors/matugen.css',
  'https://millennium.host/v1/themes/Material-Theme/css/main/colors/matugen.css',
];

export function startMatugen(scope) {
  const style = document.createElement('style');
  style.id = 'material-matugen-colors';
  document.head.appendChild(style);
  let timer;
  let request;
  let preferred = 0;
  let running = false;

  async function refresh() {
    if (running || scope.signal.aborted) return;
    running = true;
    try {
      for (const index of [preferred, 1 - preferred]) {
        if (scope.signal.aborted) return;
        const controller = new AbortController();
        request = controller;
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          const response = await fetch(urls[index], { signal: controller.signal, cache: 'no-cache' });
          const text = await response.text();
          if (!response.ok || !text.trim() || /<\s*(?:!doctype|html|head|body)\b/i.test(text)
            || text.includes('File Not Found') || !text.includes('--md-sys-color-')) continue;
          if (scope.signal.aborted) return;
          if (style.textContent !== text) style.textContent = text;
          preferred = index;
          return;
        } catch (error) {
          if (scope.signal.aborted) return;
        } finally {
          clearTimeout(timeout);
          if (request === controller) request = null;
        }
      }
    } finally {
      running = false;
      // Matugen is an external file: keep its existing refresh cadence, without overlapping requests.
      if (!scope.signal.aborted) {
        clearTimeout(timer);
        timer = setTimeout(refresh, 1500);
      }
    }
  }

  scope.add(() => { clearTimeout(timer); request?.abort(); style.remove(); });
  refresh();
  return { refresh };
}

installColorMode('matugen', startMatugen);
