/*
 * sw.js — Service Worker（オフライン対応）
 * アプリ本体のファイルを端末にキャッシュし、電波がなくても起動できるようにする。
 * データ（localStorage）はもともと端末内にあるため、オフラインでも閲覧・編集できる。
 *
 * ファイルを更新したら CACHE_VERSION を上げること。
 */
'use strict';

var CACHE_VERSION = 'subkanri-v1.2.0';
var ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/dates.js',
  './js/subscriptions.js',
  './js/storage.js',
  './js/calendar.js',
  './js/notifications.js',
  './js/ui.js',
  './js/views.js',
  './js/form.js',
  './js/app.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) { return cache.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return k.indexOf('subkanri-') === 0 && k !== CACHE_VERSION;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 外部リンクには関与しない

  // 画面遷移: ネットワーク優先（最新版を取得）、失敗したらキャッシュの index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        if (res.ok) caches.open(CACHE_VERSION).then(function (c) { c.put('./index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match('./index.html', { ignoreSearch: true });
      })
    );
    return;
  }

  // その他: キャッシュ優先、なければネットワーク
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res.ok && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});

// 通知をタップしたらアプリを前面に
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ('focus' in list[i]) return list[i].focus();
      }
      return self.clients.openWindow('./');
    })
  );
});
