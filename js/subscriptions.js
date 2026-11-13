/*
 * subscriptions.js — サブスクのデータモデル・検証・自動繰り上げ・金額換算
 * DOM には触れない純粋なロジック（Node でもテスト可能）。
 */
(function (root) {
  'use strict';

  var D = root.SK.dates;

  var CYCLES = ['weekly', 'monthly', 'yearly', 'custom'];
  var CYCLE_LABELS = { weekly: '週額', monthly: '月額', yearly: '年額', custom: 'その他' };
  var DEFAULT_NOTIFY_DAYS = 3;
  var MAX_AMOUNT = 100000000; // 1億円（入力ミス防止の上限）
  var MAX_TEXT = { name: 60, paymentMethod: 40, cancelUrl: 2000, notes: 1000 };

  function newId() {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  /** 全角数字・カンマ・空白を取り除いて半角に */
  function normalizeNumberText(v) {
    if (typeof v === 'number') return String(v);
    if (v == null) return '';
    return String(v)
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[,，\s円¥￥]/g, '');
  }

  function parseNonNegInt(v) {
    var s = normalizeNumberText(v);
    if (!/^\d+$/.test(s)) return NaN;
    return parseInt(s, 10);
  }

  function isHttpUrl(str) {
    if (!str) return false;
    try {
      var u = new URL(str);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (e) { return false; }
  }

  function str(v) { return v == null ? '' : String(v).trim(); }

  /**
   * 入力（フォーム値 or インポートデータ）を検証・正規化する。
   * 戻り値: { ok: boolean, value: 正規化済みサブスク, errors: { field: 日本語メッセージ } }
   */
  function validate(input) {
    input = input || {};
    var errors = {};
    var v = {};

    v.id = str(input.id) || newId();

    v.name = str(input.name);
    if (!v.name) errors.name = 'サービス名を入力してください。';
    else if (v.name.length > MAX_TEXT.name) errors.name = 'サービス名は' + MAX_TEXT.name + '文字以内にしてください。';

    v.amount = parseNonNegInt(input.amount);
    if (str(input.amount) === '') errors.amount = '金額を入力してください。';
    else if (isNaN(v.amount)) errors.amount = '金額は0以上の整数（円）で入力してください。';
    else if (v.amount > MAX_AMOUNT) errors.amount = '金額が大きすぎます。';

    v.cycle = str(input.cycle);
    if (CYCLES.indexOf(v.cycle) < 0) errors.cycle = '支払い周期を選んでください。';

    if (v.cycle === 'custom') {
      v.customIntervalDays = parseNonNegInt(input.customIntervalDays);
      if (isNaN(v.customIntervalDays) || v.customIntervalDays < 1) {
        errors.customIntervalDays = '何日ごとに更新するかを1以上の整数で入力してください。';
      } else if (v.customIntervalDays > 3660) {
        errors.customIntervalDays = '日数が大きすぎます（3660日まで）。';
      }
    } else {
      v.customIntervalDays = null;
    }

    v.nextRenewal = str(input.nextRenewal);
    if (!v.nextRenewal) errors.nextRenewal = '次回更新日を入力してください。';
    else if (!D.isValid(v.nextRenewal)) errors.nextRenewal = '次回更新日の形式が正しくありません。';

    v.paymentMethod = str(input.paymentMethod);
    if (v.paymentMethod.length > MAX_TEXT.paymentMethod) {
      errors.paymentMethod = '支払い方法は' + MAX_TEXT.paymentMethod + '文字以内の名前だけにしてください。';
    } else if (/\d{4}[\s-]?\d{4}[\s-]?\d{4}/.test(normalizeNumberText(v.paymentMethod) + ' ' + v.paymentMethod)) {
      // カード番号らしき数字列は保存させない
      errors.paymentMethod = 'カード番号のような数字は入力しないでください。「クレカ（楽天）」のような名前だけにしてください。';
    }

    v.cancelUrl = str(input.cancelUrl);
    if (v.cancelUrl && !isHttpUrl(v.cancelUrl)) {
      errors.cancelUrl = '解約URLは http:// または https:// で始まるアドレスを入力してください。';
    } else if (v.cancelUrl.length > MAX_TEXT.cancelUrl) {
      errors.cancelUrl = 'URLが長すぎます。';
    }

    v.notes = input.notes == null ? '' : String(input.notes).trim();
    if (v.notes.length > MAX_TEXT.notes) errors.notes = 'メモは' + MAX_TEXT.notes + '文字以内にしてください。';

    var nd = input.notifyDaysBefore;
    v.notifyDaysBefore = (nd == null || str(nd) === '') ? NaN : parseNonNegInt(nd);
    if (isNaN(v.notifyDaysBefore)) errors.notifyDaysBefore = '通知日数は0以上の整数で入力してください（0は当日）。';
    else if (v.notifyDaysBefore > 365) errors.notifyDaysBefore = '通知日数は365日以内にしてください。';

    // 月末・閏日の扱いのための「本来の日」。未指定なら次回更新日の日付を使う
    var ad = parseInt(input.anchorDay, 10);
    var p = D.parse(v.nextRenewal);
    v.anchorDay = (ad >= 1 && ad <= 31) ? ad : (p ? p.d : null);

    v.createdAt = str(input.createdAt) || new Date().toISOString();
    v.updatedAt = str(input.updatedAt) || v.createdAt;

    return { ok: Object.keys(errors).length === 0, value: v, errors: errors };
  }

  /** 1周期分進める */
  function advanceOnce(sub, dateStr) {
    switch (sub.cycle) {
      case 'weekly': return D.addDays(dateStr, 7);
      case 'monthly': return D.addMonths(dateStr, 1, sub.anchorDay);
      case 'yearly': return D.addYears(dateStr, 1, sub.anchorDay);
      case 'custom': return D.addDays(dateStr, sub.customIntervalDays);
    }
    throw new Error('unknown cycle: ' + sub.cycle);
  }

  /**
   * 次回更新日が today より前なら、today 以降になるまで繰り上げた日付を返す。
   */
  function rolledRenewal(sub, today) {
    var d = sub.nextRenewal;
    if (d >= today) return d; // YYYY-MM-DD は文字列比較で大小が正しい
    if (sub.cycle === 'weekly' || sub.cycle === 'custom') {
      var step = sub.cycle === 'weekly' ? 7 : sub.customIntervalDays;
      var k = Math.ceil(D.diffDays(d, today) / step);
      return D.addDays(d, k * step);
    }
    var guard = 0;
    while (d < today && guard++ < 100000) d = advanceOnce(sub, d);
    return d;
  }

  /**
   * 全件を繰り上げる。変更があったかどうかも返す（呼び出し側で保存）。
   */
  function rollForwardAll(list, today) {
    var changed = false;
    var out = list.map(function (s) {
      var next = rolledRenewal(s, today);
      if (next === s.nextRenewal) return s;
      changed = true;
      var copy = Object.assign({}, s);
      copy.nextRenewal = next;
      return copy;
    });
    return { list: out, changed: changed };
  }

  /** 月額換算（丸めなし） */
  function monthlyCost(sub) {
    switch (sub.cycle) {
      case 'weekly': return sub.amount * 52 / 12;
      case 'monthly': return sub.amount;
      case 'yearly': return sub.amount / 12;
      case 'custom': return (sub.amount / sub.customIntervalDays) * 365.25 / 12;
    }
    return 0;
  }

  /** 年額換算（丸めなし） */
  function yearlyCost(sub) {
    switch (sub.cycle) {
      case 'weekly': return sub.amount * 52;
      case 'monthly': return sub.amount * 12;
      case 'yearly': return sub.amount;
      case 'custom': return (sub.amount / sub.customIntervalDays) * 365.25;
    }
    return 0;
  }

  /** 合計（合算してから四捨五入） */
  function totals(list) {
    var m = 0, y = 0;
    list.forEach(function (s) { m += monthlyCost(s); y += yearlyCost(s); });
    return { monthly: Math.round(m), yearly: Math.round(y), count: list.length };
  }

  function daysLeft(sub, today) { return D.diffDays(today, sub.nextRenewal); }

  /** 通知ウィンドウ内か（0 <= 残日数 <= notifyDaysBefore） */
  function isInNotifyWindow(sub, today) {
    var n = daysLeft(sub, today);
    return n >= 0 && n <= sub.notifyDaysBefore;
  }

  /** 次回更新日が近い順（同日なら名前順） */
  function sortByRenewal(list) {
    return list.slice().sort(function (a, b) {
      if (a.nextRenewal !== b.nextRenewal) return a.nextRenewal < b.nextRenewal ? -1 : 1;
      return a.name.localeCompare(b.name, 'ja');
    });
  }

  function cycleText(sub) {
    if (sub.cycle === 'custom') return sub.customIntervalDays + '日ごと';
    return CYCLE_LABELS[sub.cycle] || '';
  }

  function daysLeftLabel(n) {
    if (n < 0) return '期限切れ';
    if (n === 0) return '今日';
    if (n === 1) return '明日';
    return '残り' + n + '日';
  }

  function formatYen(n) {
    return '¥' + Math.round(n).toLocaleString('ja-JP');
  }

  /** 明らかにデモと分かるデータ（架空の金額） */
  function demoData(today) {
    var now = new Date().toISOString();
    var raw = [
      { name: 'デモ：動画配信A', amount: 990, cycle: 'monthly', nextRenewal: D.addDays(today, 2),
        paymentMethod: 'クレカ（デモ）', cancelUrl: 'https://example.com/cancel', notes: 'これはデモデータです。編集・削除できます。', notifyDaysBefore: 3 },
      { name: 'デモ：クラウドB', amount: 13000, cycle: 'yearly', nextRenewal: D.addDays(today, 45),
        paymentMethod: '口座振替', cancelUrl: '', notes: 'これはデモデータです。', notifyDaysBefore: 14 },
      { name: 'デモ：新聞C', amount: 4400, cycle: 'monthly', nextRenewal: D.addDays(today, 12),
        paymentMethod: '口座振替', cancelUrl: '', notes: 'これはデモデータです。', notifyDaysBefore: 3 },
      { name: 'デモ：学習アプリD', amount: 2980, cycle: 'custom', customIntervalDays: 90, nextRenewal: D.addDays(today, 0),
        paymentMethod: 'クレカ（デモ）', cancelUrl: '', notes: 'これはデモデータです。90日ごとの例。', notifyDaysBefore: 0 }
    ];
    return raw.map(function (r) {
      r.createdAt = now;
      return validate(r).value;
    });
  }

  root.SK.subs = {
    CYCLES: CYCLES,
    CYCLE_LABELS: CYCLE_LABELS,
    DEFAULT_NOTIFY_DAYS: DEFAULT_NOTIFY_DAYS,
    newId: newId,
    isHttpUrl: isHttpUrl,
    validate: validate,
    advanceOnce: advanceOnce,
    rolledRenewal: rolledRenewal,
    rollForwardAll: rollForwardAll,
    monthlyCost: monthlyCost,
    yearlyCost: yearlyCost,
    totals: totals,
    daysLeft: daysLeft,
    isInNotifyWindow: isInNotifyWindow,
    sortByRenewal: sortByRenewal,
    cycleText: cycleText,
    daysLeftLabel: daysLeftLabel,
    formatYen: formatYen,
    demoData: demoData
  };
})(typeof window !== 'undefined' ? window : globalThis);
