const runtimeKey = '__materialColorRuntime';

export function createScope() {
  const controller = new AbortController();
  const cleanups = [];
  return {
    signal: controller.signal,
    add(cleanup) { cleanups.push(cleanup); },
    listen(target, type, listener, options) {
      target.addEventListener(type, listener, options);
      cleanups.push(() => target.removeEventListener(type, listener, options));
    },
    observe(target, options, callback) {
      const observer = new MutationObserver(callback);
      observer.observe(target, options);
      cleanups.push(() => observer.disconnect());
      return observer;
    },
    dispose() {
      if (controller.signal.aborted) return;
      controller.abort();
      for (const cleanup of cleanups.splice(0).reverse()) cleanup();
    },
  };
}

function createRuntime() {
  const factories = new Map();
  const scope = createScope();
  let active = null;
  let requestedMode = '';
  let scheduled = false;
  let suspended = false;

  function stop() {
    active?.dispose();
    active = null;
    document.getElementById('material-colors')?.remove();
    document.getElementById('material-dynamic-transitions')?.remove();
  }

  function reconcile() {
    scheduled = false;
    if (scope.signal.aborted || suspended) return;
    const marker = getComputedStyle(document.documentElement).getPropertyValue('--material-color-mode').trim();
    const mode = marker || requestedMode;
    if (active?.mode !== mode) {
      stop();
      if (factories.has(mode) && document.body) {
        const session = createScope();
        active = { mode, dispose: () => session.dispose(), refresh: null };
        const result = factories.get(mode)(session);
        active.refresh = result?.refresh;
      }
    } else {
      active?.refresh?.();
    }
  }

  function schedule() {
    if (scheduled || scope.signal.aborted) return;
    scheduled = true;
    queueMicrotask(reconcile);
  }

  function externalMutation(mutation) {
    let node = mutation.target.nodeType === 3 ? mutation.target.parentNode : mutation.target;
    while (node && node !== document.head) {
      if (['material-colors', 'material-dynamic-transitions', 'material-matugen-colors'].includes(node.id)) return false;
      node = node.parentNode;
    }
    if (mutation.type === 'childList') {
      const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
      if (nodes.length && nodes.every(item => ['material-colors', 'material-dynamic-transitions', 'material-matugen-colors'].includes(item.id))) return false;
    }
    return true;
  }

  scope.observe(document.head, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href', 'media', 'disabled'] }, mutations => {
    if (mutations.some(externalMutation)) schedule();
  });
  scope.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] }, schedule);
  // Resource load events do not reach Window consistently; capture them on Document.
  scope.listen(document, 'load', event => { if (event.target.tagName === 'LINK') schedule(); }, true);
  scope.listen(document, 'error', event => { if (event.target.tagName === 'LINK') schedule(); }, true);
  scope.listen(window, 'DOMContentLoaded', schedule);
  scope.listen(window, 'pagehide', event => {
    suspended = true;
    stop();
    if (!event.persisted) { scope.dispose(); delete window[runtimeKey]; }
  });
  scope.listen(window, 'pageshow', () => { suspended = false; reconcile(); });
  return {
    register(mode, factory) {
      factories.set(mode, factory);
      requestedMode = mode;
      if (active?.mode === mode) stop();
      reconcile();
    },
    dispose() { stop(); scope.dispose(); delete window[runtimeKey]; },
  };
}

export function installColorMode(mode, factory) {
  const runtime = window[runtimeKey] || (window[runtimeKey] = createRuntime());
  runtime.register(mode, factory);
}
