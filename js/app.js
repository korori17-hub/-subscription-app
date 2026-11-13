/*
 * app.js — アプリ全体の制御（状態・画面切り替え・設定エリア・起動処理）
 */
(function (root) {
  'use strict';

  var D = root.SK.dates;
  var S = root.SK.subs;
  var store = root.SK.storage;
  var cal = root.SK.calendar;
  var notif = root.SK.notifications;
  var ui = root.SK.ui;
  var views = root.SK.views;
  var form = root.SK.form;

  var state = { subs: [], today: D.todayTokyo() };
  var cameFromHome = false;
  var homeScrollY = 0;

  /* ---------- データ ---------- */

  function persist() {
    if (!store.save(state.subs)) {
      ui.toast('保存できませんでした。ブラウザの設定（プライベートブラウズ等）を確認してください。');
      return false;
    }
    return true;
  }

  /** 今日を更新し、過ぎた更新日を静かに繰り上げる */
  function refreshToday() {
    state.today = D.todayTokyo();
    var r = S.rollForwardAll(state.subs, state.today);
    if (r.changed) {
      state.subs = r.list;
      persist();
    }
  }

  function findSub(id) {
    for (var i = 0; i < state.subs.length; i++) if (state.subs[i].id === id) return state.subs[i];
    return null;
  }

  /* ---------- 描画 ---------- */

  var cardHandlers = {
    edit: function (id) { go('#/edit/' + encodeURIComponent(id)); },
    ics: function (id) {
      var s = findSub(id);
      if (!s) return;
      ui.downloadText(cal.buildIcs([s]), cal.fileNameFor(s), 'text/calendar');
      ui.toast('カレンダー用ファイルを書き出しました。開いてカレンダーに追加してください。');
    },
    remove: function (id) {
      var s = findSub(id);
      if (!s) return;
      ui.confirmDialog({
        title: '「' + s.name + '」を削除しますか？',
        message: '削除すると元に戻せません。',
        okLabel: '削除する',
        danger: true
      }).then(function (ok) {
        if (!ok) return;
        state.subs = state.subs.filter(function (x) { return x.id !== id; });
        persist();
        renderHome();
        ui.toast('削除しました。');
      });
    }
  };

  function renderHome() {
    views.renderHome(state.subs, state.today, cardHandlers);
    renderNotifyStatus();
  }

  function renderNotifyStatus() {
    var p = notif.permission();
    var btn = ui.$('#notify-permission');
    var status = ui.$('#notify-status');
    var text = {
      granted: '通知は許可されています。アプリを開いたときに、更新が近いサブスクをお知らせします。',
      denied: '通知がブロックされています。ブラウザ（またはiPhoneの「設定」→「通知」）から許可してください。',
      'default': 'まだ通知は許可されていません。',
      unsupported: notif.isIOS() && !notif.isStandalone()
        ? 'この画面では通知を使えません。iPhoneでは「ホーム画面に追加」したアプリから開くと使えます。'
        : 'このブラウザでは通知を使えません。カレンダー書き出しをご利用ください。'
    }[p];
    status.textContent = text;
    btn.hidden = p !== 'default';
  }

  /* ---------- 画面切り替え（#/new, #/edit/ID） ---------- */

  function go(hash) {
    homeScrollY = root.scrollY;
    cameFromHome = true;
    location.hash = hash;
  }

  function backToHome() {
    if (cameFromHome) {
      cameFromHome = false;
      history.back();
    } else {
      location.replace('#/');
    }
  }

  function route() {
    var h = location.hash;
    var editMatch = /^#\/edit\/(.+)$/.exec(h);
    var isForm = h === '#/new' || !!editMatch;
    var sub = editMatch ? findSub(decodeURIComponent(editMatch[1])) : null;
    if (editMatch && !sub) { location.replace('#/'); return; }

    ui.$('#view-home').hidden = isForm;
    ui.$('#view-form').hidden = !isForm;
    ui.$('#fab').hidden = isForm;

    if (isForm) {
      form.open(sub, state.today);
      root.scrollTo(0, 0);
      ui.$('#form-title').focus();
    } else {
      refreshToday();
      renderHome();
      root.scrollTo(0, homeScrollY);
    }
  }

  /* ---------- 保存 ---------- */

  function onSave(sub, isNew) {
    // 過去の日付が入力されたら次回分まで繰り上げる
    sub.nextRenewal = S.rolledRenewal(sub, state.today);
    if (isNew) state.subs.push(sub);
    else state.subs = state.subs.map(function (x) { return x.id === sub.id ? sub : x; });
    if (persist()) ui.toast(isNew ? '追加しました。' : '保存しました。');
    backToHome();
  }

  /* ---------- 設定エリア ---------- */

  function bindSettings() {
    ui.$('#fab').addEventListener('click', function () { go('#/new'); });
    ui.$('#empty-add').addEventListener('click', function () { go('#/new'); });

    ui.$('#notify-permission').addEventListener('click', function () {
      notif.requestPermission().then(function (p) {
        renderNotifyStatus();
        if (p === 'granted') {
          ui.toast('通知を許可しました。');
          notif.notifyUpcoming(state.subs, state.today);
        }
      });
    });

    ui.$('#export-all-ics').addEventListener('click', function () {
      if (!state.subs.length) return;
      ui.downloadText(cal.buildIcs(S.sortByRenewal(state.subs)), cal.ALL_FILE_NAME, 'text/calendar');
      ui.toast(state.subs.length + '件をカレンダー用ファイルに書き出しました。');
    });

    ui.$('#export-json').addEventListener('click', function () {
      var stamp = state.today.replace(/-/g, '');
      ui.downloadText(store.exportJson(state.subs), 'サブスク管理_バックアップ_' + stamp + '.json', 'application/json');
      ui.toast('バックアップを書き出しました。');
    });

    var fileInput = ui.$('#import-file');
    ui.$('#import-json').addEventListener('click', function () {
      fileInput.value = '';
      fileInput.click();
    });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { showImportError('ファイルが大きすぎます。'); return; }
      var reader = new FileReader();
      reader.onerror = function () { showImportError('ファイルを読み込めませんでした。'); };
      reader.onload = function () {
        var imported;
        try {
          imported = store.importJson(reader.result);
        } catch (e) {
          showImportError(e.message);
          return;
        }
        ui.$('#import-error').hidden = true;
        var msg = imported.length + '件のデータが見つかりました。';
        var p = state.subs.length
          ? ui.confirmDialog({
            title: '今のデータを置き換えますか？',
            message: msg + '現在の' + state.subs.length + '件はすべて消え、読み込んだデータに置き換わります。',
            okLabel: '置き換える',
            danger: true
          })
          : ui.confirmDialog({ title: 'バックアップを読み込みますか？', message: msg, okLabel: '読み込む' });
        p.then(function (ok) {
          if (!ok) return;
          state.subs = imported;
          refreshToday();
          persist();
          renderHome();
          ui.toast(imported.length + '件を読み込みました。');
        });
      };
      reader.readAsText(file);
    });

    function insertDemo() {
      state.subs = state.subs.concat(S.demoData(state.today));
      persist();
      renderHome();
      ui.toast('デモデータを入れました。不要になったら削除してください。');
    }
    function onDemo() {
      if (!state.subs.length) { insertDemo(); return; }
      ui.confirmDialog({
        title: 'デモデータを追加しますか？',
        message: '今のデータはそのまま残り、「デモ：」で始まる架空のデータが4件追加されます。',
        okLabel: '追加する'
      }).then(function (ok) { if (ok) insertDemo(); });
    }
    ui.$('#demo-data').addEventListener('click', onDemo);
    ui.$('#empty-demo').addEventListener('click', onDemo);
  }

  function showImportError(message) {
    var box = ui.$('#import-error');
    box.textContent = '読み込めませんでした: ' + message + '（今のデータはそのままです）';
    box.hidden = false;
    box.scrollIntoView({ block: 'center' });
  }

  /* ---------- 起動 ---------- */

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
    navigator.serviceWorker.register('./sw.js').catch(function () { /* オフライン機能なしで続行 */ });
  }

  function start() {
    if (!store.isAvailable()) ui.$('#storage-warning').hidden = false;

    var loaded = store.load();
    state.subs = loaded.subscriptions;
    if (loaded.corrupted) ui.$('#corrupt-warning').hidden = false;

    form.init({ onSave: onSave, onCancel: backToHome });
    bindSettings();
    refreshToday();
    route();
    root.addEventListener('hashchange', route);

    // 画面に戻ってきたとき（日付が変わっているかもしれない）
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      refreshToday();
      if (!ui.$('#view-home').hidden) renderHome();
      notif.notifyUpcoming(state.subs, state.today);
    });

    registerServiceWorker();
    // SW の準備を少し待ってから通知（iOS では SW 経由が必要なため）
    setTimeout(function () { notif.notifyUpcoming(state.subs, state.today); }, 800);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
