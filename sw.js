const CACHE_NAME = 'pscamera-pwa-v24-shooting-mode-fix-rotate';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

const INJECT_MARKER = 'pscamera-shooting-mode-fix-v24-plus-rotate';
const INJECT_SCRIPT = `<script id="pscamera-shooting-mode-fix-v24-plus-rotate">
(() => {
  'use strict';

  const FIX_VERSION = 'v1.24-shooting-mode-fix-rotate';
  const INSTALL_FLAG = 'pscameraV24ShootingFixPlusRotateInstalled';
  if (window[INSTALL_FLAG]) return;
  window[INSTALL_FLAG] = true;

  function $(id) {
    return document.getElementById(id);
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function setVersionText() {
    const footerVersion = document.querySelector('.footer span:last-child');
    if (footerVersion) footerVersion.textContent = FIX_VERSION;

    try {
      const re = /v1\.(21-image-management|24-shooting-mode-fix|24-shooting-mode-fix-rotate|25-upload-orientation-fix|25-rotate-tools|25-rotate-tools-direct|25-rotate-tools-full|26-capture-landscape-fix)/g;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const targets = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (re.test(node.nodeValue)) targets.push(node);
        re.lastIndex = 0;
      }
      targets.forEach(node => {
        node.nodeValue = node.nodeValue.replace(re, FIX_VERSION);
      });
    } catch (error) {
      console.log('[pscamera v24+rotate] version text update skipped:', error);
    }
  }

  function setActive(id, active) {
    const el = $(id);
    if (el) el.classList.toggle('active', !!active);
  }

  function forceSquareModeForShooting() {
    const body = document.body;
    if (!body || !body.classList.contains('shooting-mode')) return;

    body.classList.remove('mode-disk');
    body.classList.add('mode-gift');

    setActive('btn-disk', false);
    setActive('btn-gift', true);
    setActive('btn-disk-shooting', false);
    setActive('btn-gift-shooting', true);
  }

  function keepShootingModeAfterClear() {
    const body = document.body;
    if (!body) return;

    body.classList.add('shooting-mode');

    const btnShootingMode = $('btn-shooting-mode');
    if (btnShootingMode) btnShootingMode.textContent = '通常表示に戻る';

    forceSquareModeForShooting();
  }

  function bindShootingFixes() {
    const body = document.body;
    const btnShootingMode = $('btn-shooting-mode');
    const btnClearAllShooting = $('btn-clear-all-shooting');

    if (btnShootingMode && !btnShootingMode.dataset.shootingFixRotateBound) {
      btnShootingMode.dataset.shootingFixRotateBound = '1';
      btnShootingMode.addEventListener('click', () => {
        setTimeout(forceSquareModeForShooting, 0);
      });
    }

    if (btnClearAllShooting && !btnClearAllShooting.dataset.shootingFixRotateBound) {
      btnClearAllShooting.dataset.shootingFixRotateBound = '1';
      btnClearAllShooting.addEventListener('click', () => {
        const wasShootingMode = body && body.classList.contains('shooting-mode');
        setTimeout(() => {
          if (wasShootingMode) keepShootingModeAfterClear();
        }, 0);
      });
    }

    if (body && !body.dataset.shootingFixRotateObserver) {
      body.dataset.shootingFixRotateObserver = '1';
      let lastShootingMode = body.classList.contains('shooting-mode');

      const observer = new MutationObserver(() => {
        const nowShootingMode = body.classList.contains('shooting-mode');
        if (nowShootingMode && !lastShootingMode) {
          forceSquareModeForShooting();
        }
        lastShootingMode = nowShootingMode;
      });

      observer.observe(body, {
        attributes: true,
        attributeFilter: ['class']
      });
    }

    forceSquareModeForShooting();
  }

  function getVisibleImageElement() {
    const holder = $('holder');
    if (!holder) return null;

    const imgs = Array.from(holder.querySelectorAll('img'));
    const visible = imgs.find(img => {
      const rect = img.getBoundingClientRect();
      const style = getComputedStyle(img);
      return img.src && rect.width > 8 && rect.height > 8 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || 1) !== 0;
    });

    return visible || imgs.find(img => img.src) || null;
  }

  function hasCurrentImage() {
    const del = $('btn-delete-current');
    const cameraOn = document.body && document.body.classList.contains('camera-on');
    return !!getVisibleImageElement() && !cameraOn && (!del || !del.disabled);
  }

  function updateRotateButtonsState() {
    const disabled = !hasCurrentImage();
    const left = $('btn-rotate-left');
    const right = $('btn-rotate-right');
    if (left) left.disabled = disabled;
    if (right) right.disabled = disabled;
  }

  function canUseDataTransfer() {
    try {
      const dt = new DataTransfer();
      return !!dt.items;
    } catch (_) {
      return false;
    }
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('画像を読み込めませんでした'));
      img.src = src;
    });
  }

  function canvasToFile(canvas, fileName) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (!blob) {
          reject(new Error('回転後画像の作成に失敗しました'));
          return;
        }
        resolve(new File([blob], fileName, {
          type: 'image/jpeg',
          lastModified: Date.now()
        }));
      }, 'image/jpeg', 0.95);
    });
  }

  function makeFileName(deg) {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const suffix = deg < 0 ? 'left' : 'right';
    return 'pscamera_rotated_' + suffix + '_' +
      d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' +
      pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '.jpg';
  }

  async function rotateImageSrcToFile(src, deg) {
    const img = await loadImage(src);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error('画像サイズを取得できませんでした');

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('canvasが使用できません');

    const normalizedDeg = ((deg % 360) + 360) % 360;
    if (normalizedDeg === 90 || normalizedDeg === 270) {
      canvas.width = h;
      canvas.height = w;
    } else {
      canvas.width = w;
      canvas.height = h;
    }

    if (normalizedDeg === 90) {
      ctx.translate(canvas.width, 0);
      ctx.rotate(Math.PI / 2);
    } else if (normalizedDeg === 270) {
      ctx.translate(0, canvas.height);
      ctx.rotate(-Math.PI / 2);
    } else if (normalizedDeg === 180) {
      ctx.translate(canvas.width, canvas.height);
      ctx.rotate(Math.PI);
    }

    ctx.drawImage(img, 0, 0, w, h);
    return canvasToFile(canvas, makeFileName(deg));
  }

  function dispatchFileToApp(file) {
    const input = $('fileInput');
    if (!input || !canUseDataTransfer()) return false;

    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;

    const event = new Event('change', {
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(event, 'pscameraV24RotateSynthetic', {
      value: true
    });
    input.dispatchEvent(event);
    return true;
  }

  async function rotateCurrentImage(deg) {
    const left = $('btn-rotate-left');
    const right = $('btn-rotate-right');
    const buttons = [left, right].filter(Boolean);

    const img = getVisibleImageElement();
    if (!img || !img.src) {
      alert('回転する画像がありません。先に画像を選択してください。');
      return;
    }

    const beforeTexts = buttons.map(btn => btn.textContent);
    buttons.forEach(btn => {
      btn.disabled = true;
      btn.textContent = '処理中...';
    });

    try {
      const src = img.currentSrc || img.src;
      const rotatedFile = await rotateImageSrcToFile(src, deg);

      // 既存アプリの内部データへ直接触らず、現在の画像を削除してから回転後画像を追加する。
      // これが一番UIを壊しにくい置き換え方法。
      const del = $('btn-delete-current');
      if (del && !del.disabled) {
        del.click();
        await sleep(120);
      }

      const ok = dispatchFileToApp(rotatedFile);
      if (!ok) throw new Error('回転後画像をアプリへ渡せませんでした');
      await sleep(120);
      updateRotateButtonsState();
    } catch (error) {
      console.error('[pscamera v24+rotate] rotate failed:', error);
      alert('画像の回転に失敗しました。画像を選択し直してからもう一度試してください。');
    } finally {
      buttons.forEach((btn, index) => {
        btn.textContent = beforeTexts[index];
      });
      updateRotateButtonsState();
    }
  }

  function installRotateButtons() {
    if ($('btn-rotate-left') || $('btn-rotate-right')) {
      updateRotateButtonsState();
      return;
    }

    const wrap = document.querySelector('.image-management') || document.querySelector('.image-management-details');
    if (!wrap) return;

    const left = document.createElement('button');
    left.className = 'camera-btn';
    left.id = 'btn-rotate-left';
    left.type = 'button';
    left.textContent = '左回転';
    left.disabled = true;

    const right = document.createElement('button');
    right.className = 'camera-btn';
    right.id = 'btn-rotate-right';
    right.type = 'button';
    right.textContent = '右回転';
    right.disabled = true;

    const save = $('btn-save');
    const del = $('btn-delete-current');
    if (save && save.parentElement === wrap) {
      save.insertAdjacentElement('afterend', right);
      save.insertAdjacentElement('afterend', left);
    } else if (del && del.parentElement === wrap) {
      del.insertAdjacentElement('beforebegin', left);
      left.insertAdjacentElement('afterend', right);
    } else {
      wrap.appendChild(left);
      wrap.appendChild(right);
    }

    left.addEventListener('click', () => rotateCurrentImage(-90));
    right.addEventListener('click', () => rotateCurrentImage(90));
    updateRotateButtonsState();
  }

  function installRotateObserver() {
    if (document.documentElement.dataset.pscameraV24RotateObserver) return;
    document.documentElement.dataset.pscameraV24RotateObserver = '1';

    const observer = new MutationObserver(() => {
      setVersionText();
      installRotateButtons();
      updateRotateButtonsState();
    });

    [document.body, $('holder'), $('thumbs'), $('btn-delete-current')].filter(Boolean).forEach(target => {
      observer.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['disabled', 'class', 'style', 'src']
      });
    });

    document.addEventListener('click', () => {
      setTimeout(updateRotateButtonsState, 80);
    }, true);
  }

  function installSmallStyle() {
    if ($('pscamera-v24-rotate-style')) return;
    const style = document.createElement('style');
    style.id = 'pscamera-v24-rotate-style';
    style.textContent = '#btn-rotate-left,#btn-rotate-right{min-height:42px;}';
    document.head.appendChild(style);
  }

  function bindFixes() {
    setVersionText();
    installSmallStyle();
    bindShootingFixes();
    installRotateButtons();
    installRotateObserver();
    updateRotateButtonsState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindFixes, { once: true });
  } else {
    bindFixes();
  }

  setTimeout(bindFixes, 300);
  setTimeout(bindFixes, 1000);
  setTimeout(bindFixes, 2500);
})();
</script>`;

function stripOldInjectedScripts(html) {
  if (!html) return html;
  return html
    .replace(/<script id=["']pscamera-shooting-mode-fix-v24["']>[\s\S]*?<\/script>/g, '')
    .replace(/<script id=["']pscamera-v26-capture-landscape-fix["']>[\s\S]*?<\/script>/g, '')
    .replace(/<script id=["']pscamera-v25-rotate-tools-direct["']>[\s\S]*?<\/script>/g, '');
}

function injectIntoHtml(html) {
  if (!html) return html;

  let nextHtml = stripOldInjectedScripts(html);
  if (nextHtml.includes(INJECT_MARKER)) return nextHtml;

  nextHtml = nextHtml.replace(
    /v1\.(21-image-management|24-shooting-mode-fix|24-shooting-mode-fix-rotate|25-upload-orientation-fix|25-rotate-tools|25-rotate-tools-direct|25-rotate-tools-full|26-capture-landscape-fix)/g,
    'v1.24-shooting-mode-fix-rotate'
  );

  if (nextHtml.includes('</body>')) {
    return nextHtml.replace('</body>', `${INJECT_SCRIPT}
</body>`);
  }

  return `${nextHtml}
${INJECT_SCRIPT}`;
}

async function responseWithInjectedHtml(response) {
  const html = await response.text();
  return new Response(injectIntoHtml(html), {
    status: response.status,
    statusText: response.statusText,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache'
    }
  });
}

async function cacheInjectedIndex(response) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const injected = await responseWithInjectedHtml(response.clone());
    await cache.put('./index.html', injected.clone());
  } catch (error) {
    console.log('index.html cache update skipped:', error);
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
    caches.keys().then(keys => Promise.all(
      keys
        .filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))
    )).then(() => self.clients.claim())
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
