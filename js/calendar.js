/*
 * calendar.js — カレンダー書き出し（iCalendar / .ics, RFC 5545）
 *
 * - 終日イベント（DTSTART;VALUE=DATE）なのでタイムゾーンずれが起きない。
 * - RRULE で周期を表現（WEEKLY / MONTHLY / YEARLY / DAILY;INTERVAL=n）。
 * - 月末（29〜31日）や 2/29 は BYMONTHDAY + BYSETPOS=-1 で「その月に存在する最後の日」にする。
 *   例: 31日 → 2月は 28/29日、4月は 30日。
 * - VALARM は notifyDaysBefore 日前の朝 9:00（終日イベントの開始 0:00 からの相対時間）。
 */
(function (root) {
  'use strict';

  var D = root.SK.dates;
  var PRODID = '-//subkanri//Subscription Manager v1//JA';

  /** TEXT 値のエスケープ（RFC 5545 3.3.11） */
  function escapeText(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\')
      .replace(/\r\n|\r|\n/g, '\\n')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,');
  }

  function utf8Len(ch) {
    var c = ch.codePointAt(0);
    return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }

  /** 75 オクテットで折り返し（マルチバイト文字の途中では切らない） */
  function foldLine(line) {
    var out = [], cur = '', len = 0, limit = 75;
    for (var _i = 0, chars = Array.from(line); _i < chars.length; _i++) {
      var ch = chars[_i], l = utf8Len(ch);
      if (len + l > limit) {
        out.push(cur);
        cur = ' ';
        len = 1;
        limit = 75;
      }
      cur += ch;
      len += l;
    }
    out.push(cur);
    return out.join('\r\n');
  }

  function compactDate(dateStr) { return dateStr.replace(/-/g, ''); }

  function utcStamp(now) {
    return (now || new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  /** 周期 → RRULE */
  function rrule(sub) {
    var p = D.parse(sub.nextRenewal);
    if (!p) return '';
    var anchor = sub.anchorDay || p.d;
    switch (sub.cycle) {
      case 'weekly':
        return 'FREQ=WEEKLY';
      case 'monthly':
        if (anchor > 28) return 'FREQ=MONTHLY;BYMONTHDAY=' + range(28, anchor) + ';BYSETPOS=-1';
        return 'FREQ=MONTHLY;BYMONTHDAY=' + anchor;
      case 'yearly':
        if (p.m === 2 && anchor === 29) return 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=28,29;BYSETPOS=-1';
        return 'FREQ=YEARLY';
      case 'custom':
        return 'FREQ=DAILY;INTERVAL=' + sub.customIntervalDays;
    }
    return '';
  }

  function range(a, b) {
    var r = [];
    for (var i = a; i <= b; i++) r.push(i);
    return r.join(',');
  }

  /**
   * 通知タイミング: 開始日（0:00）から見て「n 日前の 9:00」
   *   n=0 → PT9H（当日 9:00）, n=1 → -PT15H（前日 9:00）, n=3 → -P2DT15H（3日前 9:00）
   */
  function alarmTrigger(n) {
    if (!n) return 'PT9H';
    if (n === 1) return '-PT15H';
    return '-P' + (n - 1) + 'DT15H';
  }

  function whenText(n) {
    return n === 0 ? '今日' : n + '日後';
  }

  /** UID に入れる ID。検証済みのはずだが、念のため安全な文字以外を除去する */
  function safeUid(id) {
    var s = String(id == null ? '' : id).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80);
    return s || 'unknown';
  }

  function eventLines(sub, now) {
    var S = root.SK.subs;
    var amount = S.formatAmount(sub.amount, sub.currency) + '（' + S.cycleText(sub) + '）';
    var desc = ['金額: ' + amount];
    if (sub.paymentMethod) desc.push('支払い方法: ' + sub.paymentMethod);
    if (sub.cancelUrl) desc.push('解約ページ: ' + sub.cancelUrl);
    if (sub.notes) desc.push('メモ: ' + sub.notes);
    desc.push('（サブスク管理アプリから書き出し）');

    var lines = [
      'BEGIN:VEVENT',
      'UID:' + safeUid(sub.id) + '@subkanri',
      'DTSTAMP:' + utcStamp(now),
      'DTSTART;VALUE=DATE:' + compactDate(sub.nextRenewal),
      'DTEND;VALUE=DATE:' + compactDate(D.addDays(sub.nextRenewal, 1)),
      'RRULE:' + rrule(sub),
      'SUMMARY:' + escapeText('【更新】' + sub.name + ' ' + S.formatAmount(sub.amount, sub.currency)),
      'DESCRIPTION:' + escapeText(desc.join('\n')),
      'TRANSP:TRANSPARENT'
    ];
    // URL は TEXT ではない（エスケープしない）ので、正規化済みの http(s) URL だけを出す
    var url = S.normalizeHttpUrl(sub.cancelUrl);
    if (url) lines.push('URL:' + url);
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:' + escapeText(sub.name + 'の更新が' + whenText(sub.notifyDaysBefore) + 'です'),
      'TRIGGER;RELATED=START:' + alarmTrigger(sub.notifyDaysBefore),
      'END:VALARM',
      'END:VEVENT'
    );
    return lines;
  }

  /** サブスク配列 → .ics 文字列（CRLF 改行） */
  function buildIcs(list, now) {
    var lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:' + PRODID,
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:' + escapeText('サブスク更新日')
    ];
    list.forEach(function (s) { if (D.isValid(s.nextRenewal)) lines = lines.concat(eventLines(s, now)); });
    lines.push('END:VCALENDAR');
    return lines.map(foldLine).join('\r\n') + '\r\n';
  }

  /** ファイル名に使えない文字を除去 */
  function safeFileName(name) {
    var s = String(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, '_').replace(/^デモ：/, 'デモ_');
    s = s.replace(/[：]/g, '_');
    return Array.from(s).slice(0, 40).join('') || 'サブスク';
  }

  function fileNameFor(sub) { return 'サブスク_' + safeFileName(sub.name) + '.ics'; }

  var ALL_FILE_NAME = 'サブスク全部.ics';

  root.SK.calendar = {
    buildIcs: buildIcs,
    rrule: rrule,
    alarmTrigger: alarmTrigger,
    escapeText: escapeText,
    foldLine: foldLine,
    fileNameFor: fileNameFor,
    ALL_FILE_NAME: ALL_FILE_NAME
  };
})(typeof window !== 'undefined' ? window : globalThis);
