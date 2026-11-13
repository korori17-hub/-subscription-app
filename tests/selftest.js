/*
 * ロジックの自己チェック（ブラウザ不要）
 *   実行: node tests/selftest.js
 */
'use strict';
var path = require('path');
var assert = require('assert');
['dates', 'subscriptions', 'storage', 'calendar'].forEach(function (f) {
  require(path.join(__dirname, '..', 'js', f + '.js'));
});
var SK = globalThis.SK, D = SK.dates, S = SK.subs, ST = SK.storage, C = SK.calendar;

var passed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('  NG  ' + name + '\n      ' + e.message); process.exitCode = 1; }
}
function sub(o) {
  var r = S.validate(Object.assign({ name: 'X', amount: 1000, cycle: 'monthly', nextRenewal: '2026-01-31', notifyDaysBefore: 3 }, o));
  assert.ok(r.ok, JSON.stringify(r.errors));
  return r.value;
}

console.log('日付');
t('東京の今日: UTC 15:00 は翌日', function () {
  assert.strictEqual(D.todayTokyo(new Date('2026-11-13T14:59:59Z')), '2026-11-13');
  assert.strictEqual(D.todayTokyo(new Date('2026-11-13T15:00:00Z')), '2026-11-14');
  assert.strictEqual(D.todayTokyo(new Date('2026-12-31T15:30:00Z')), '2027-01-01');
});
t('addMonths 月末クランプ', function () {
  assert.strictEqual(D.addMonths('2026-01-31', 1), '2026-02-28');
  assert.strictEqual(D.addMonths('2028-01-31', 1), '2028-02-29');
  assert.strictEqual(D.addMonths('2026-12-15', 1), '2027-01-15');
  assert.strictEqual(D.addMonths('2026-02-28', 1, 31), '2026-03-31');
});
t('addYears 閏日', function () {
  assert.strictEqual(D.addYears('2028-02-29', 1), '2029-02-28');
  assert.strictEqual(D.addYears('2031-02-28', 1, 29), '2032-02-29');
});
t('diffDays / addDays', function () {
  assert.strictEqual(D.diffDays('2026-11-13', '2026-11-16'), 3);
  assert.strictEqual(D.addDays('2026-12-30', 3), '2027-01-02');
  assert.strictEqual(D.diffDays('2026-03-01', '2026-03-31'), 30);
});
t('不正な日付', function () {
  assert.strictEqual(D.isValid('2026-02-29'), false);
  assert.strictEqual(D.isValid('2028-02-29'), true);
  assert.strictEqual(D.isValid('2026/01/01'), false);
});
t('formatJa は日付がずれない', function () {
  assert.ok(D.formatJa('2026-11-16').indexOf('2026年11月16日') === 0, D.formatJa('2026-11-16'));
  assert.ok(D.formatJa('2026-11-16').indexOf('月') > 0);
});

console.log('自動繰り上げ');
var today = '2026-11-13';
t('今日以降はそのまま', function () {
  assert.strictEqual(S.rolledRenewal(sub({ nextRenewal: '2026-11-13' }), today), '2026-11-13');
});
t('weekly', function () {
  assert.strictEqual(S.rolledRenewal(sub({ cycle: 'weekly', nextRenewal: '2026-11-06' }), today), '2026-11-13');
  assert.strictEqual(S.rolledRenewal(sub({ cycle: 'weekly', nextRenewal: '2026-11-05' }), today), '2026-11-19');
});
t('monthly 1/31 → 2/28 → 3/31（月末を保つ）', function () {
  var s = sub({ nextRenewal: '2026-01-31' });
  assert.strictEqual(S.rolledRenewal(s, '2026-02-01'), '2026-02-28');
  assert.strictEqual(S.rolledRenewal(s, '2026-03-01'), '2026-03-31');
  assert.strictEqual(S.rolledRenewal(s, '2026-04-01'), '2026-04-30');
  // 一度 2/28 に保存されたあとも anchorDay で 3/31 に戻る
  var s2 = Object.assign({}, s, { nextRenewal: '2026-02-28' });
  assert.strictEqual(S.rolledRenewal(s2, '2026-03-01'), '2026-03-31');
  assert.strictEqual(S.rolledRenewal(sub({ nextRenewal: '2027-12-31' }), '2028-02-01'), '2028-02-29');
});
t('yearly 2/29 → 平年 2/28 → 閏年 2/29', function () {
  var s = sub({ cycle: 'yearly', nextRenewal: '2028-02-29' });
  assert.strictEqual(S.rolledRenewal(s, '2028-03-01'), '2029-02-28');
  var s2 = Object.assign({}, s, { nextRenewal: '2031-02-28' });
  assert.strictEqual(S.rolledRenewal(s2, '2031-03-01'), '2032-02-29');
});
t('custom', function () {
  assert.strictEqual(S.rolledRenewal(sub({ cycle: 'custom', customIntervalDays: 10, nextRenewal: '2026-11-01' }), today), '2026-11-21');
  assert.strictEqual(S.rolledRenewal(sub({ cycle: 'custom', customIntervalDays: 12, nextRenewal: '2026-11-01' }), today), '2026-11-13');
});
t('rollForwardAll は変更有無を返す', function () {
  var r = S.rollForwardAll([sub({ nextRenewal: '2026-12-01' })], today);
  assert.strictEqual(r.changed, false);
  r = S.rollForwardAll([sub({ nextRenewal: '2025-11-20' })], today);
  assert.strictEqual(r.changed, true);
  assert.strictEqual(r.list[0].nextRenewal, '2026-11-20');
});

console.log('金額換算');
t('月額・年額換算', function () {
  var list = [
    sub({ amount: 1000, cycle: 'monthly' }),
    sub({ amount: 300, cycle: 'weekly' }),
    sub({ amount: 12000, cycle: 'yearly' }),
    sub({ amount: 3000, cycle: 'custom', customIntervalDays: 90 })
  ];
  var m = 1000 + 300 * 52 / 12 + 1000 + (3000 / 90) * 365.25 / 12;
  var y = 12000 + 300 * 52 + 12000 + (3000 / 90) * 365.25;
  var tt = S.totals(list);
  assert.strictEqual(tt.monthly, Math.round(m)); // 4314.58.. → 4315
  assert.strictEqual(tt.monthly, 4315);
  assert.strictEqual(tt.yearly, Math.round(y));  // 51775
  assert.strictEqual(tt.yearly, 51775);
  assert.strictEqual(S.formatYen(1234), '¥1,234');
  assert.strictEqual(S.totals([]).monthly, 0);
});
t('通知ウィンドウ', function () {
  assert.strictEqual(S.isInNotifyWindow(sub({ nextRenewal: '2026-11-16', notifyDaysBefore: 3 }), today), true);
  assert.strictEqual(S.isInNotifyWindow(sub({ nextRenewal: '2026-11-17', notifyDaysBefore: 3 }), today), false);
  assert.strictEqual(S.isInNotifyWindow(sub({ nextRenewal: '2026-11-13', notifyDaysBefore: 0 }), today), true);
  assert.strictEqual(S.daysLeftLabel(0), '今日');
  assert.strictEqual(S.daysLeftLabel(3), '残り3日');
});

console.log('入力チェック');
t('必須・形式', function () {
  var r = S.validate({ name: ' ', amount: '-1', cycle: 'custom', customIntervalDays: '0', nextRenewal: '', cancelUrl: 'javascript:alert(1)', notifyDaysBefore: '-1' });
  assert.strictEqual(r.ok, false);
  ['name', 'amount', 'customIntervalDays', 'nextRenewal', 'cancelUrl', 'notifyDaysBefore'].forEach(function (k) {
    assert.ok(r.errors[k], k + ' のエラーがない');
  });
  assert.ok(S.validate({ name: 'a', amount: '1.5', cycle: 'monthly', nextRenewal: today, notifyDaysBefore: 3 }).errors.amount);
  assert.ok(S.validate({ name: 'a', amount: '１，２００', cycle: 'monthly', nextRenewal: today, notifyDaysBefore: 0 }).ok);
  assert.ok(S.validate({ name: 'a', amount: 0, cycle: 'monthly', nextRenewal: today, notifyDaysBefore: 0, cancelUrl: 'https://example.com' }).ok);
  assert.ok(S.validate({ name: 'a', amount: 1, cycle: 'monthly', nextRenewal: today, notifyDaysBefore: 3, paymentMethod: '4111 1111 1111 1111' }).errors.paymentMethod);
  assert.ok(S.validate({ name: 'a', amount: 1, cycle: 'monthly', nextRenewal: today, notifyDaysBefore: 3, paymentMethod: 'クレカ（楽天）' }).ok);
});

console.log('バックアップ');
t('書き出し→読み込みで同じ', function () {
  var list = [sub({ name: 'A' }), sub({ name: 'B', cycle: 'custom', customIntervalDays: 30 })];
  var json = ST.exportJson(list);
  var o = JSON.parse(json);
  assert.strictEqual(o.version, 1);
  assert.ok(!isNaN(Date.parse(o.exportedAt)));
  assert.deepStrictEqual(ST.importJson(json), list);
});
t('壊れたファイルは日本語エラー', function () {
  assert.throws(function () { ST.importJson('{oops'); }, /JSON/);
  assert.throws(function () { ST.importJson('[]'); }, /形式/);
  assert.throws(function () { ST.importJson('{"version":1}'); }, /subscriptions/);
  assert.throws(function () { ST.importJson('{"version":99,"subscriptions":[]}'); }, /新しいバージョン/);
  assert.throws(function () { ST.importJson('{"version":1,"subscriptions":[{"name":"A","amount":-5}]}'); }, /「A」/);
});
t('デモデータは明らかにデモ名', function () {
  S.demoData(today).forEach(function (d) { assert.ok(/^デモ：/.test(d.name)); });
});

console.log('カレンダー（.ics）');
var NOW = new Date('2026-11-13T00:00:00Z');
t('基本構造', function () {
  var ics = C.buildIcs([sub({ name: 'デモ：動画配信A, 家族;用', nextRenewal: '2026-11-20', notifyDaysBefore: 3, cancelUrl: 'https://example.com/c' })], NOW);
  assert.ok(/\r\n$/.test(ics));
  assert.ok(!/[^\r]\n/.test(ics), 'LF だけの改行がある');
  var lines = ics.split('\r\n');
  assert.strictEqual(lines[0], 'BEGIN:VCALENDAR');
  assert.ok(lines.indexOf('VERSION:2.0') > 0);
  assert.ok(lines.some(function (l) { return /^PRODID:/.test(l); }));
  assert.strictEqual(lines[lines.length - 2], 'END:VCALENDAR');
  assert.ok(lines.indexOf('DTSTART;VALUE=DATE:20261120') > 0);
  assert.ok(lines.indexOf('DTEND;VALUE=DATE:20261121') > 0);
  assert.ok(lines.indexOf('RRULE:FREQ=MONTHLY;BYMONTHDAY=20') > 0);
  assert.ok(lines.indexOf('TRIGGER;RELATED=START:-P2DT15H') > 0);
  assert.ok(lines.indexOf('ACTION:DISPLAY') > 0);
  assert.ok(lines.indexOf('DTSTAMP:20261113T000000Z') > 0);
  assert.ok(ics.indexOf('動画配信A\\, 家族\\;用') > 0);
  // BEGIN/END の対応
  ['VCALENDAR', 'VEVENT', 'VALARM'].forEach(function (k) {
    assert.strictEqual(ics.split('BEGIN:' + k).length, ics.split('END:' + k).length, k);
  });
  // 各行 75 オクテット以内
  lines.forEach(function (l) { assert.ok(Buffer.byteLength(l, 'utf8') <= 75, l); });
});
t('RRULE と TRIGGER', function () {
  assert.strictEqual(C.rrule(sub({ cycle: 'weekly' })), 'FREQ=WEEKLY');
  assert.strictEqual(C.rrule(sub({ cycle: 'yearly', nextRenewal: '2026-05-10' })), 'FREQ=YEARLY');
  assert.strictEqual(C.rrule(sub({ cycle: 'yearly', nextRenewal: '2028-02-29' })), 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=28,29;BYSETPOS=-1');
  assert.strictEqual(C.rrule(sub({ cycle: 'custom', customIntervalDays: 90 })), 'FREQ=DAILY;INTERVAL=90');
  assert.strictEqual(C.rrule(sub({ nextRenewal: '2026-01-31' })), 'FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1');
  assert.strictEqual(C.alarmTrigger(0), 'PT9H');
  assert.strictEqual(C.alarmTrigger(1), '-PT15H');
  assert.strictEqual(C.alarmTrigger(7), '-P6DT15H');
});
t('長い行の折り返し（UTF-8）', function () {
  var long = 'DESCRIPTION:' + 'あ'.repeat(100);
  var folded = C.foldLine(long);
  folded.split('\r\n').forEach(function (l, i) {
    assert.ok(Buffer.byteLength(l) <= 75);
    if (i > 0) assert.strictEqual(l[0], ' ');
  });
  assert.strictEqual(folded.replace(/\r\n /g, ''), long);
});
t('ファイル名', function () {
  assert.strictEqual(C.fileNameFor({ name: 'デモ：動画配信A' }), 'サブスク_デモ_動画配信A.ics');
  assert.strictEqual(C.fileNameFor({ name: 'a/b:c' }), 'サブスク_abc.ics');
  assert.strictEqual(C.ALL_FILE_NAME, 'サブスク全部.ics');
});

console.log('\n' + passed + ' 件のチェックが通りました' + (process.exitCode ? '（失敗あり）' : ''));
