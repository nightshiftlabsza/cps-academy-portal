'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.OfflineManager = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const SW_VERSION = 'v0.4.0';
  const SNAPSHOT_DATE = '2026-09-06';
  let isFallback = false;
  let swRegistration = null;

  function isSecureOrigin() {
    if (typeof window === 'undefined') return false;
    const h = window.location.hostname;
    return window.location.protocol === 'https:' || h === 'localhost' || h === '127.0.0.1';
  }

  function isFormDirty() {
    if (typeof document === 'undefined') return false;
    const detailDialog = document.querySelector('#detail-dialog');
    const newDialog = document.querySelector('#new-dialog');
    return Boolean((detailDialog && detailDialog.open) || (newDialog && newDialog.open));
  }

  function initServiceWorker() {
    if (!isSecureOrigin() || !('serviceWorker' in navigator)) {
      return Promise.resolve(null);
    }
    return navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => {
        swRegistration = reg;
        reg.onupdatefound = () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.onstatechange = () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              if (isFormDirty()) {
                console.log('Unsaved form is open; deferring service worker reload.');
                return;
              }
            }
          };
        };
        return reg;
      })
      .catch((err) => {
        console.warn('Service worker registration failed:', err.message);
        return null;
      });
  }

  async function loadWorkbook() {
    isFallback = false;
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 3500) : null;
      const res = await fetch('workbook.json', { signal: controller?.signal });
      if (timeoutId) clearTimeout(timeoutId);

      if (res.ok) {
        if (res.headers.get('X-CPS-Offline-Fallback') === '1') {
          isFallback = true;
        }
        const data = await res.json();
        if (data && typeof data === 'object' && data['Morning Report']) {
          return data;
        }
      }
    } catch {}

    if (typeof caches !== 'undefined') {
      try {
        const match = await caches.match('workbook.json');
        if (match) {
          const data = await match.json();
          if (data && typeof data === 'object' && data['Morning Report']) {
            isFallback = true;
            return data;
          }
        }
      } catch {}
    }

    throw new Error('Could not load workbook (offline with no cached snapshot)');
  }

  function getOfflineStatus() {
    return {
      isFallback,
      version: SW_VERSION,
      snapshotDate: SNAPSHOT_DATE,
      label: isFallback ? `Offline — cached snapshot (${SW_VERSION} · ${SNAPSHOT_DATE})` : null
    };
  }

  async function clearOfflineCopy() {
    if (typeof caches === 'undefined') return false;
    try {
      const keys = await caches.keys();
      const appKeys = keys.filter((k) => k.startsWith('cps-portal-'));
      await Promise.all(appKeys.map((k) => caches.delete(k)));
      return true;
    } catch (e) {
      console.warn('Could not clear offline copy:', e.message);
      return false;
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
      initServiceWorker();
    });
  }

  return {
    initServiceWorker,
    loadWorkbook,
    getOfflineStatus,
    clearOfflineCopy,
    isSecureOrigin,
    isFormDirty
  };
});
