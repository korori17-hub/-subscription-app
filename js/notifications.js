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

  var SW_READY_TIMEOUT_MS = 4000;

  /** Service Worker の登録完了を待つ（登録されない環境では ready が永遠に解決しないのでタイムアウト付き） */
  function swRegistration() {
    var sw = root.navigator && root.navigator.serviceWorker;
    if (!sw || !sw.ready) return Promise.resolve(null);
    return new Promise(function (resolve) {
      var timer = setTimeout(function () { resolve(null); }, SW_READY_TIMEOUT_MS);
      sw.ready.then(function (reg) { clearTimeout(timer); resolve(reg || null); },
        function () { clearTimeout(timer); resolve(null); });
    });
  }

  function showWithConstructor(title, opts) {
    // Android Chrome などでは new Notification が例外を投げる → reject して既送扱いにしない
    new root.Notification(title, opts);
  }

  /**
   * 通知を表示する。表示できたら resolve、失敗したら reject する。
   * iOS / Android では Service Worker 経由でないと表示できないため、SW が使えるなら ready を待って
   * registration.showNotification を使う。SW が無い・準備できない場合は new Notification にフォールバック。
   */
  function show(title, body, tag) {
    var opts = { body: body, tag: tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', lang: 'ja' };
    return swRegistration().then(function (reg) {
      if (reg && typeof reg.showNotification === 'function') {
        return reg.showNotification(title, opts).catch(function () { showWithConstructor(title, opts); });
      }
      showWithConstructor(title, opts);
    });
  }

  // 表示処理中のキー（visibilitychange・タイマー・起動時の呼び出しが重なっても二重に出さない）
  var inFlight = {};

  /**
   * 通知ウィンドウ内のサブスクについて、未送信のものだけ通知する。
   * 表示に成功したものだけを「送信済み」に記録する（失敗したものは次回の呼び出しで再送される）。
   * 戻り値: Promise<通知に成功した件数>（呼び出し側は無視してもよい）
   */
  function notifyUpcoming(list, today) {
    if (permission() !== 'granted') return Promise.resolve(0);
    if (root.document && root.document.visibilityState === 'hidden') return Promise.resolve(0);
    var sent = store.getNotified(today);
    var due = list.filter(function (s) {
      var key = s.id + '|' + s.nextRenewal;
      return S.isInNotifyWindow(s, today) && sent.indexOf(key) < 0 && !inFlight[today + '|' + key];
    });
    if (!due.length) return Promise.resolve(0);

    var jobs = due.map(function (s) {
      var key = s.id + '|' + s.nextRenewal;
      var flightKey = today + '|' + key;
      inFlight[flightKey] = true;
      var n = S.daysLeft(s, today);
      var when = n === 0 ? '今日' : n === 1 ? '明日' : n + '日後';
      var p;
      try {
        p = show('まもなく更新: ' + s.name,
          when + '（' + root.SK.dates.formatJa(s.nextRenewal, { short: true }) + '）に ' +
          S.formatYen(s.amount) + ' が更新されます。',
          'subkanri-' + s.id + '-' + s.nextRenewal);
      } catch (e) {
        p = Promise.reject(e);
      }
      return p.then(function () { return key; }, function () { return null; })
        .then(function (k) { delete inFlight[flightKey]; return k; });
    });

    return Promise.all(jobs).then(function (keys) {
      var ok = keys.filter(Boolean);
      if (ok.length) {
        // 待っている間に他の呼び出しが記録したかもしれないので、読み直してから追記する
        var latest = store.getNotified(today);
        ok.forEach(function (k) { if (latest.indexOf(k) < 0) latest.push(k); });
        store.setNotified(today, latest);
      }
      return ok.length;
    });
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
