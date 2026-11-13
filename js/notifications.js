/*
 * notifications.js — ブラウザ通知（Notification API）
 *
 * - アプリが開いていて画面に表示されているときだけ、通知ウィンドウ内の更新をローカル通知する。
 * - 同じ日・同じサブスクは一度だけ（localStorage で既送管理）。
 * - サーバーからのプッシュ通知は使わない（データを外部に送らないため）。
 */
(function (root) {
  'use strict';

  var S = root.SK.subs;
  var store = root.SK.storage;

  function isSupported() { return typeof root.Notification !== 'undefined'; }

  /** 'granted' | 'denied' | 'default' | 'unsupported' */
  function permission() { return isSupported() ? root.Notification.permission : 'unsupported'; }

  function isIOS() {
    var ua = root.navigator ? root.navigator.userAgent : '';
    return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && root.navigator.maxTouchPoints > 1);
  }

  function isStandalone() {
    return (root.matchMedia && root.matchMedia('(display-mode: standalone)').matches) ||
      (root.navigator && root.navigator.standalone === true);
  }

  function requestPermission() {
    if (!isSupported()) return Promise.resolve('unsupported');
    try {
      var r = root.Notification.requestPermission();
      if (r && typeof r.then === 'function') return r;
      return Promise.resolve(root.Notification.permission);
    } catch (e) {
      // 古い Safari はコールバック形式
      return new Promise(function (resolve) { root.Notification.requestPermission(resolve); });
    }
  }

  function show(title, body, tag) {
    var opts = { body: body, tag: tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', lang: 'ja' };
    // iOS / Android では Service Worker 経由でないと表示できない
    if (root.navigator && root.navigator.serviceWorker && root.navigator.serviceWorker.controller) {
      return root.navigator.serviceWorker.ready.then(function (reg) { return reg.showNotification(title, opts); })
        .catch(function () { try { new root.Notification(title, opts); } catch (e) { /* 無視 */ } });
    }
    try { new root.Notification(title, opts); } catch (e) { /* 無視 */ }
    return Promise.resolve();
  }

  /**
   * 通知ウィンドウ内のサブスクについて、未送信のものだけ通知する。
   * 戻り値: 通知した件数
   */
  function notifyUpcoming(list, today) {
    if (permission() !== 'granted') return 0;
    if (root.document && root.document.visibilityState === 'hidden') return 0;
    var sent = store.getNotified(today);
    var due = list.filter(function (s) {
      return S.isInNotifyWindow(s, today) && sent.indexOf(s.id + '|' + s.nextRenewal) < 0;
    });
    if (!due.length) return 0;

    due.forEach(function (s) {
      var n = S.daysLeft(s, today);
      var when = n === 0 ? '今日' : n === 1 ? '明日' : n + '日後';
      show('まもなく更新: ' + s.name,
        when + '（' + root.SK.dates.formatJa(s.nextRenewal, { short: true }) + '）に ' +
        S.formatYen(s.amount) + ' が更新されます。',
        'subkanri-' + s.id + '-' + s.nextRenewal);
      sent.push(s.id + '|' + s.nextRenewal);
    });
    store.setNotified(today, sent);
    return due.length;
  }

  root.SK.notifications = {
    isSupported: isSupported,
    permission: permission,
    requestPermission: requestPermission,
    notifyUpcoming: notifyUpcoming,
    isIOS: isIOS,
    isStandalone: isStandalone
  };
})(typeof window !== 'undefined' ? window : globalThis);
