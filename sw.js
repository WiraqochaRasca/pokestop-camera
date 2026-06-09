const CACHE_NAME = 'pscamera-pwa-v25-upload-orientation-fix';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

const INJECT_MARKER = 'pscamera-v25-upload-orientation-fix';

const INJECT_SCRIPT = String.raw`
<script id="pscamera-v25-upload-orientation-fix">
(() => {
  'use strict';

  const MARK = 'pscameraV25UploadOrientationFixInstalled';
  if (window[MARK]) return;
  window[MARK] = true;

  const VERSION_TEXT = 'v1.25-upload-orientation-fix';

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function $(selector) {
    return document.querySelector(selector);
  }

  function setActive(id, active) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', !!active);
  }

  function setGiftMode() {
    document.body.classList.remove('mode-disk');
    document.body.classList.add('mode-gift');
    setActive('btn-disk', false);
    setActive('btn-disk-shooting', false);
    setActive('btn-gift', true);
    setActive('btn-gift-shooting', true);
  }

  function refreshShootingButtonText() {
    const btn = document.getElementById('btn-shooting-mode');
    if (!btn) return;
    if (document.body.classList.contains('shooting-mode')) {
      btn.textContent = '通常表示';
    } else if (!btn.textContent.trim()) {
      btn.textContent = '撮影モード';
    }
  }

  function updateVersionText() {
    try {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const targets = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (/v1\.(21-image-management|24-shooting-mode-fix|25-upload-orientation-fix)/.test(node.nodeValue)) {
          targets.push(node);
        }
      }
      targets.forEach(node => {
        node.nodeValue = node.nodeValue.replace(
          /v1\.(21-image-management|24-shooting-mode-fix|25-upload-orientation-fix)/g,
          VERSION_TEXT
        );
      });
    } catch (error) {
      console.log('[pscamera v25] version text update skipped:', error);
    }
  }

  async function normalizeImageFile(file) {
    if (!file || !file.type || !file.type.startsWith('image/')) return file;

    // GIF/SVGはアニメーションやベクター情報を壊しやすいので、そのまま渡す。
    if (/image\/(gif|svg\+xml)/i.test(file.type)) return file;

    if (!('createImageBitmap' in window)) return file;

    let bitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (error) {
      console.log('[pscamera v25] createImageBitmap failed, original file used:', file.name, error);
      return file;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0);

      const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const blob = await new Promise(resolve => canvas.toBlob(resolve, type, 0.95));
      if (!blob) return file;

      return new File([blob], file.name, {
        type,
        lastModified: file.lastModified || Date.now()
      });
    } catch (error) {
      console.log('[pscamera v25] image normalization skipped:', file.name, error);
      return file;
    } finally {
      if (bitmap && typeof bitmap.close === 'function') bitmap.close();
    }
  }

  function canUseDataTransfer() {
    try {
      const dt = new DataTransfer();
      return !!dt.items;
    } catch (_) {
      return false;
    }
  }

  async function buildNormalizedFileList(files) {
    const normalized = [];
    for (const file of files) {
      normalized.push(await normalizeImageFile(file));
    }
    return normalized;
  }

  function dispatchNormalizedChange(input, files) {
    if (!input || !canUseDataTransfer()) return false;

    const dt = new DataTransfer();
    files.forEach(file => dt.items.add(file));
    input.files = dt.files;

    const event = new Event('change', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'pscameraV25Normalized', { value: true });
    input.dispatchEvent(event);
    return true;
  }

  function installFileInputPatch() {
    const input = document.getElementById('fileInput');
    if (!input || input.dataset.pscameraV25InputPatch === '1') return;
    input.dataset.pscameraV25InputPatch = '1';

    input.addEventListener('change', async event => {
      if (event.pscameraV25Normalized) return;
      if (input.dataset.pscameraV25Busy === '1') return;

      const files = Array.from(input.files || []);
      if (!files.length) return;
      if (!files.some(file => file.type && file.type.startsWith('image/'))) return;
      if (!canUseDataTransfer()) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      input.dataset.pscameraV25Busy = '1';
      try {
        const normalizedFiles = await buildNormalizedFileList(files);
        dispatchNormalizedChange(input, normalizedFiles);
      } finally {
        delete input.dataset.pscameraV25Busy;
      }
    }, true);
  }

  function installDropPatch() {
    if (document.documentElement.dataset.pscameraV25DropPatch === '1') return;
    document.documentElement.dataset.pscameraV25DropPatch = '1';

    document.addEventListener('drop', async event => {
      if (event.pscameraV25NormalizedDrop) return;

      const files = Array.from((event.dataTransfer && event.dataTransfer.files) || []);
      if (!files.length) return;
      if (!files.some(file => file.type && file.type.startsWith('image/'))) return;
      if (!canUseDataTransfer()) return;

      const nearApp = event.target && event.target.closest && event.target.closest('#dropzone, .dropzone, #stage, .stage, #holder, .holder');
      if (!nearApp) return;

      const input = document.getElementById('fileInput');
      if (!input) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      const normalizedFiles = await buildNormalizedFileList(files);
      dispatchNormalizedChange(input, normalizedFiles);
    }, true);
  }

  function installShootingModePatch() {
    document.addEventListener('click', event => {
      const shootingModeButton = event.target && event.target.closest && event.target.closest('#btn-shooting-mode');
      if (shootingModeButton) {
        setTimeout(() => {
          if (document.body.classList.contains('shooting-mode')) {
            setGiftMode();
          }
          refreshShootingButtonText();
        }, 0);
      }

      const shootingClearButton = event.target && event.target.closest && event.target.closest('#btn-clear-all-shooting');
      if (shootingClearButton) {
        const wasShooting = document.body.classList.contains('shooting-mode');
        setTimeout(() => {
          if (wasShooting) {
            document.body.classList.add('shooting-mode');
            setGiftMode();
            refreshShootingButtonText();
          }
        }, 80);
      }
    }, true);

    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes' && record.attributeName === 'class') {
          if (document.body.classList.contains('shooting-mode')) {
            setGiftMode();
          }
          refreshShootingButtonText();
        }
      }
    });

    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  function installSmallStyles() {
    if (document.getElementById('pscamera-v25-small-styles')) return;
    const style = document.createElement('style');
    style.id = 'pscamera-v25-small-styles';
    style.textContent = [
      '.holder > img, .thumb { image-orientation: from-image; }',
      'body.shooting-mode.mode-gift .inner-disk-guide { display: block; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  ready(() => {
    updateVersionText();
    installSmallStyles();
    installFileInputPatch();
    installDropPatch();
    installShootingModePatch();
    refreshShootingButtonText();
  });
})();
</script>`;

function injectIntoHtml(html) {
  if (!html) return html;

  let nextHtml = html
    .replace(/v1\.21-image-management/g, 'v1.25-upload-orientation-fix')
    .replace(/v1\.24-shooting-mode-fix/g, 'v1.25-upload-orientation-fix');

  if (nextHtml.includes(INJECT_MARKER)) return nextHtml;

  if (/<\/body>/i.test(nextHtml)) {
    return nextHtml.replace(/<\/body>/i, INJECT_SCRIPT + '\n</body>');
  }
  return nextHtml + '\n' + INJECT_SCRIPT;
}

async function responseWithInjectedHtml(response) {
  const html = await response.text();
  return new Response(injectIntoHtml(html), {
    status: response.status,
    statusText: response.statusText,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}

async function cacheInjectedIndex(response) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const injected = await responseWithInjectedHtml(response.clone());
    await cache.put('./index.html', injected.clone());
  } catch (error) {
    console.log('[pscamera v25] index.html cache update skipped:', error);
  }
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(async response => {
          const cloned = response.clone();
          cacheInjectedIndex(cloned);
          return responseWithInjectedHtml(response);
        })
        .catch(async () => {
          const cached = await caches.match('./index.html');
          if (cached) return responseWithInjectedHtml(cached);
          throw new Error('No cached index.html');
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const networkFetch = fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const responseCopy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, responseCopy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
