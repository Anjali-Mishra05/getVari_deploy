// Central overlay manager to handle multiple overlays (modals/drawers)
// Saves and restores relevant style properties on html, body, and the app root
// to avoid leaving the page scroll-locked or shifted when overlays open/close.
let count = 0 as number;
const PREV_KEY = '__overlay_prev_styles_v1';

const TARGET_SELECTORS = [
  { key: 'html', el: () => document.documentElement },
  { key: 'body', el: () => document.body }
];

const PROPS: Array<keyof CSSStyleDeclaration> = [
  'overflow', 'overflowX', 'overflowY', 'overscrollBehavior', 'paddingRight'
];

function getScrollbarWidth() {
  return window.innerWidth - document.documentElement.clientWidth;
}

export function addOverlay() {
  if (typeof document === 'undefined') return;
  count = Math.max(0, count) + 1;
  if (count !== 1) return;

  try {
    const prev: Record<string, Record<string, string>> = {};

    TARGET_SELECTORS.forEach(({ key, el }) => {
      const element = el();
      if (!element) return;
      prev[key] = {};
      PROPS.forEach((prop) => {
        // save inline style value (may be empty string)
        // @ts-ignore
        prev[key][prop] = element.style.getPropertyValue(prop as any) || '';
      });
    });

    // If a scrollbar is present, add right padding to avoid layout shift
    const scrollbarWidth = getScrollbarWidth();
    if (scrollbarWidth > 0) {
      const body = document.body;
      prev['body'] = prev['body'] || {};
      prev['body']['paddingRight'] = body.style.getPropertyValue('padding-right') || '';
      body.style.paddingRight = `${(parseFloat(prev['body']['paddingRight']) || 0) + scrollbarWidth}px`;
    }

    // Apply scroll lock styles
    TARGET_SELECTORS.forEach(({ key, el }) => {
      const element = el();
      if (!element) return;
      element.style.overflow = 'hidden';
      element.style.overflowX = 'hidden';
      element.style.overflowY = 'hidden';
      element.style.overscrollBehavior = 'none';
    });

    (document as any)[PREV_KEY] = prev;
    document.body.classList.add('overlay-open');
    // Debug: output saved styles and current overlay count
    try { console.debug('[overlayManager] addOverlay saved styles:', prev, 'count:', count); } catch (e) {}
  } catch (e) {
    // ignore
  }
}

export function removeOverlay() {
  if (typeof document === 'undefined') return;
  count = Math.max(0, count - 1);
  if (count !== 0) return;

  try {
    const prev = (document as any)[PREV_KEY] as Record<string, Record<string, string>> | undefined;
    TARGET_SELECTORS.forEach(({ key, el }) => {
      const element = el();
      if (!element) return;
      const values = prev?.[key] || {};
      PROPS.forEach((prop) => {
        const v = values[prop as string];
        if (v || v === '') {
          if (v === '') {
            element.style.removeProperty(prop as any);
          } else {
            // @ts-ignore
            element.style.setProperty(prop as any, v);
          }
        }
      });
    });

    document.body.classList.remove('overlay-open');
    // Debug: output restored styles and overlay count
    try { console.debug('[overlayManager] removeOverlay restored styles:', prev, 'count:', count); } catch (e) {}
    delete (document as any)[PREV_KEY];
  } catch (e) {
    // ignore
  }
}

function detectBlockingElements() {
  if (typeof document === 'undefined') return [];
  const blocked: Array<{ el: Element; reason: string }> = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let node: Element | null = walker.currentNode as Element;
  while ((node = walker.nextNode() as Element | null)) {
    try {
      const cs = window.getComputedStyle(node);
      if (cs.overflow === 'hidden' || cs.overflowY === 'hidden' || cs.overflowX === 'hidden') {
        blocked.push({ el: node, reason: `overflow:${cs.overflow} overflowY:${cs.overflowY} overflowX:${cs.overflowX}` });
      }
      if (cs.position === 'fixed') {
        blocked.push({ el: node, reason: `position: fixed` });
      }
      if (cs.height === '100vh' || cs.height === '100dvh') {
        blocked.push({ el: node, reason: `height: ${cs.height}` });
      }
    } catch (e) {
      // ignore
    }
  }

  // include root-level checks
  try {
    const docEl = document.documentElement;
    const csHtml = window.getComputedStyle(docEl);
    if (csHtml.overflow === 'hidden' || csHtml.overflowY === 'hidden') {
      blocked.push({ el: docEl, reason: `html overflow:${csHtml.overflow} overflowY:${csHtml.overflowY}` });
    }
    const body = document.body;
    const csBody = window.getComputedStyle(body);
    if (csBody.overflow === 'hidden' || csBody.overflowY === 'hidden') {
      blocked.push({ el: body, reason: `body overflow:${csBody.overflow} overflowY:${csBody.overflowY}` });
    }
    const root = document.getElementById('admin-web-root');
    if (root) {
      const csRoot = window.getComputedStyle(root);
      if (csRoot.overflow === 'hidden' || csRoot.overflowY === 'hidden') {
        blocked.push({ el: root, reason: `root overflow:${csRoot.overflow} overflowY:${csRoot.overflowY}` });
      }
    }
  } catch (e) {}

  // simplify output
  const out = blocked.map(b => ({ tag: (b.el && (b.el as Element).tagName) || 'UNKNOWN', className: (b.el as Element).className, reason: b.reason }));
  try { console.debug('[overlayManager] detectBlockingElements:', out); } catch (e) {}
  return out;
}

export function currentCount() {
  return count;
}

// Forcefully clear any overlay locks and inline styles. Use only as a last-resort
// cleanup when an overlay may have left the page locked unexpectedly.
export function forceClearLocks() {
  if (typeof document === 'undefined') return;
  try {
    count = 0;
    delete (document as any)[PREV_KEY];
    document.body.classList.remove('overlay-open');
    const html = document.documentElement;
    const body = document.body;
    ['overflow', 'overflowX', 'overflowY', 'overscrollBehavior', 'paddingRight', 'padding-right'].forEach((p) => {
      try { html.style.removeProperty(p as any); } catch (e) {}
      try { body.style.removeProperty(p as any); } catch (e) {}
    });
    try { console.debug('[overlayManager] forceClearLocks ran'); } catch (e) {}
  } catch (e) {
    // ignore
  }
}
