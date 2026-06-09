const CACHE_NAME = 'pscamera-pwa-v25-rotate-tools';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

const INJECT_MARKER = 'pscamera-v25-rotate-tools';

const INJECT_SCRIPT = String.raw`
<script id="pscamera-v25-rotate-tools">
(() => {
  'use strict';

  const MARK = 'pscameraV25RotateToolsInstalled';
  if (window[MARK]) return;
  window[MARK] = true;

  const VERSION_TEXT = 'v1.25-rotate-tools';

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function setActive(id, active) {
    const el = byId(id);
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
    const btn = byId('btn-shooting-mode');
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
        if (/v1\.(21-image-management|24-shooting-mode-fix|25-upload-orientation-fix|25-rotate-tools|26-capture-landscape-fix)/.test(node.nodeValue)) {
          targets.push(node);
        }
      }
      targets.forEach(node => {
        node.nodeValue = node.nodeValue.replace(
          /v1\.(21-image-management|24-shooting-mode-fix|25-upload-orientation-fix|25-rotate-tools|26-capture-landscape-fix)/g,
          VERSION_TEXT
        );
      });
    } catch (error) {
      console.log('[pscamera v25 rotate] version text update skipped:', error);
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
      console.log('[pscamera v25 rotate] createImageBitmap failed, original file used:', file.name, error);
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
      console.log('[pscamera v25 rotate] image normalization skipped:', file.name, error);
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
    const input = byId('fileInput');
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

      const input = byId('fileInput');
      if (!input) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      const normalizedFiles = await buildNormalizedFileList(files);
      dispatchNormalizedChange(input, normalizedFiles);
    }, true);
  }

  function installShootingModePatch() {
    if (document.documentElement.dataset.pscameraV25ShootingPatch === '1') return;
    document.documentElement.dataset.pscameraV25ShootingPatch = '1';

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
    if (byId('pscamera-v25-rotate-small-styles')) return;
    const style = document.createElement('style');
    style.id = 'pscamera-v25-rotate-small-styles';
    style.textContent = [
      '.holder > img, .thumb { image-orientation: from-image; }',
      'body.shooting-mode.mode-gift .inner-disk-guide { display: block; }',
      '#btn-rotate-left, #btn-rotate-right { min-height: 42px; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  function getCurrentImageElement() {
    const holder = byId('holder');
    if (!holder) return null;
    const imgs = Array.from(holder.querySelectorAll('img'));
    if (!imgs.length) return null;

    const visible = imgs.filter(img => {
      const style = getComputedStyle(img);
      return style.display !== 'none' && style.visibility !== 'hidden' && img.naturalWidth > 0 && img.naturalHeight > 0;
    });
    return visible[visible.length - 1] || imgs[imgs.length - 1] || null;
  }

  function getImageBlobFromElement(img) {
    return new Promise((resolve, reject) => {
      const src = img && img.currentSrc ? img.currentSrc : (img && img.src ? img.src : '');
      if (!src) {
        reject(new Error('current image src not found'));
        return;
      }

      // blob/data URLはfetchで読むのが一番安定。失敗時はImage描画にフォールバックする。
      fetch(src)
        .then(response => {
          if (!response.ok) throw new Error('fetch image failed');
          return response.blob();
        })
        .then(resolve)
        .catch(() => {
          const image = new Image();
          image.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = image.naturalWidth || image.width;
              canvas.height = image.naturalHeight || image.height;
              const ctx = canvas.getContext('2d', { alpha: true });
              if (!ctx) throw new Error('canvas context unavailable');
              ctx.drawImage(image, 0, 0);
              canvas.toBlob(blob => {
                if (blob) resolve(blob);
                else reject(new Error('canvas.toBlob returned null'));
              }, 'image/jpeg', 0.95);
            } catch (error) {
              reject(error);
            }
          };
          image.onerror = () => reject(new Error('fallback image load failed'));
          image.src = src;
        });
    });
  }

  function makeRotatedFileName(direction) {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const suffix = direction < 0 ? 'left' : 'right';
    return [
      'pscamera_rotated_' + suffix,
      d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()),
      pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds())
    ].join('_') + '.jpg';
  }

  async function rotateCurrentImageToFile(direction) {
    const img = getCurrentImageElement();
    if (!img) throw new Error('current image not found');

    const blob = await getImageBlobFromElement(img);
    let bitmap;
    try {
      if ('createImageBitmap' in window) {
        bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      } else {
        throw new Error('createImageBitmap unavailable');
      }
    } catch (_) {
      // createImageBitmapが使えない時の簡易フォールバック
      bitmap = await new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(blob);
        const image = new Image();
        image.onload = () => {
          URL.revokeObjectURL(objectUrl);
          resolve(image);
        };
        image.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('image decode failed'));
        };
        image.src = objectUrl;
      });
    }

    try {
      const sourceW = bitmap.width || bitmap.naturalWidth;
      const sourceH = bitmap.height || bitmap.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = sourceH;
      canvas.height = sourceW;
      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) throw new Error('canvas context unavailable');

      if (direction < 0) {
        // 左回転 90度
        ctx.translate(0, sourceW);
        ctx.rotate(-Math.PI / 2);
      } else {
        // 右回転 90度
        ctx.translate(sourceH, 0);
        ctx.rotate(Math.PI / 2);
      }
      ctx.drawImage(bitmap, 0, 0, sourceW, sourceH);

      const outBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
      if (!outBlob) throw new Error('rotated canvas.toBlob returned null');
      return new File([outBlob], makeRotatedFileName(direction), { type: 'image/jpeg', lastModified: Date.now() });
    } finally {
      if (bitmap && typeof bitmap.close === 'function') bitmap.close();
    }
  }

  function setRotateButtonsDisabled(disabled) {
    const left = byId('btn-rotate-left');
    const right = byId('btn-rotate-right');
    if (left) left.disabled = !!disabled;
    if (right) right.disabled = !!disabled;
  }

  function updateRotateButtonsState() {
    const deleteBtn = byId('btn-delete-current');
    const hasImage = !!getCurrentImageElement();
    const disabled = !hasImage || (deleteBtn && deleteBtn.disabled);
    setRotateButtonsDisabled(disabled);
  }

  function flashButton(btn, label) {
    if (!btn) return;
    const before = btn.textContent;
    btn.textContent = label;
    setTimeout(() => { btn.textContent = before; }, 700);
  }

  async function rotateSelectedImage(direction, btn) {
    const input = byId('fileInput');
    if (!input || !canUseDataTransfer()) {
      alert('このブラウザでは回転処理に必要な機能が使えません。');
      return;
    }

    if (btn && btn.dataset.busy === '1') return;
    if (btn) {
      btn.dataset.busy = '1';
      btn.disabled = true;
      btn.textContent = direction < 0 ? '左回転中...' : '右回転中...';
    }

    try {
      const rotatedFile = await rotateCurrentImageToFile(direction);

      // 既存アプリの内部配列を壊さないため、現在の選択画像を削除してから、回転後画像を再追加する。
      // これにより「保存/共有」「全保存」は回転後の画像を使う。
      const deleteBtn = byId('btn-delete-current');
      if (deleteBtn && !deleteBtn.disabled) {
        deleteBtn.click();
        await new Promise(resolve => setTimeout(resolve, 120));
      }

      const ok = dispatchNormalizedChange(input, [rotatedFile]);
      if (!ok) throw new Error('failed to dispatch rotated file');
      await new Promise(resolve => setTimeout(resolve, 120));
      updateRotateButtonsState();
      flashButton(btn, '回転しました');
    } catch (error) {
      console.error('[pscamera v25 rotate] rotate failed:', error);
      alert('画像の回転に失敗しました。いったん保存してから画像を追加し直してください。');
    } finally {
      if (btn) {
        delete btn.dataset.busy;
        btn.textContent = direction < 0 ? '左回転' : '右回転';
      }
      updateRotateButtonsState();
    }
  }

  function installRotateButtons() {
    const box = document.querySelector('.image-management');
    if (!box || byId('btn-rotate-left') || byId('btn-rotate-right')) return;

    const leftBtn = document.createElement('button');
    leftBtn.className = 'camera-btn';
    leftBtn.id = 'btn-rotate-left';
    leftBtn.type = 'button';
    leftBtn.disabled = true;
    leftBtn.textContent = '左回転';

    const rightBtn = document.createElement('button');
    rightBtn.className = 'camera-btn';
    rightBtn.id = 'btn-rotate-right';
    rightBtn.type = 'button';
    rightBtn.disabled = true;
    rightBtn.textContent = '右回転';

    const deleteBtn = byId('btn-delete-current');
    if (deleteBtn && deleteBtn.parentNode === box) {
      box.insertBefore(leftBtn, deleteBtn);
      box.insertBefore(rightBtn, deleteBtn);
    } else {
      box.appendChild(leftBtn);
      box.appendChild(rightBtn);
    }

    leftBtn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      rotateSelectedImage(-1, leftBtn);
    });

    rightBtn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      rotateSelectedImage(1, rightBtn);
    });

    const stage = byId('stage');
    const thumbs = byId('thumbs');
    const observer = new MutationObserver(updateRotateButtonsState);
    if (stage) observer.observe(stage, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'class', 'style', 'disabled'] });
    if (thumbs) observer.observe(thumbs, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'src'] });
    const controls = document.querySelector('.controls');
    if (controls) observer.observe(controls, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });

    document.addEventListener('click', () => setTimeout(updateRotateButtonsState, 60), true);
    setInterval(updateRotateButtonsState, 1000);
    updateRotateButtonsState();
  }

  function installLaterIfNeeded() {
    const retry = () => {
      updateVersionText();
      installFileInputPatch();
      installDropPatch();
      installShootingModePatch();
      installRotateButtons();
      refreshShootingButtonText();
      updateRotateButtonsState();
    };
    retry();
    setTimeout(retry, 300);
    setTimeout(retry, 1000);
    setTimeout(retry, 2000);
  }

  ready(() => {
    updateVersionText();
    installSmallStyles();
    installFileInputPatch();
    installDropPatch();
    installShootingModePatch();
    installRotateButtons();
    refreshShootingButtonText();
    installLaterIfNeeded();
  });
})();
</script>
`;

function stripV26CapturePatch(html) {
  if (!html) return html;
  // 失敗したv26の撮影処理上書きスクリプトを、配信時に無効化する。
  return html.replace(/\s*<script\s+id=["']pscamera-v26-capture-landscape-fix["'][^>]*>[\s\S]*?<\/script>\s*/gi, '
');
}

function injectIntoHtml(html) {
  if (!html) return html;

  let nextHtml = stripV26CapturePatch(html)
    .replace(/v1\.21-image-management/g, 'v1.25-rotate-tools')
    .replace(/v1\.24-shooting-mode-fix/g, 'v1.25-rotate-tools')
    .replace(/v1\.25-upload-orientation-fix/g, 'v1.25-rotate-tools')
    .replace(/v1\.26-capture-landscape-fix/g, 'v1.25-rotate-tools');

  if (nextHtml.includes(INJECT_MARKER)) return nextHtml;

  if (/<\/body>/i.test(nextHtml)) {
    return nextHtml.replace(/<\/body>/i, INJECT_SCRIPT + '
</body>');
  }
  return nextHtml + '
' + INJECT_SCRIPT;
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
    console.log('[pscamera v25 rotate] index.html cache update skipped:', error);
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
