/*
 * dates.js — ローカル日付（YYYY-MM-DD）ユーティリティ
 *
 * 日付は常に「YYYY-MM-DD の文字列」として扱い、Date オブジェクトの
 * タイムゾーン変換による「前日にずれる」問題を避ける。
 * 計算が必要な場合は Date.UTC で通し日数に変換してから行う（DST の影響なし）。
 */
(function (root) {
  'use strict';

  var TIME_ZONE = 'Asia/Tokyo';
  var DAY_MS = 86400000;
  var DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function isLeapYear(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

  /** m は 1〜12 */
  function daysInMonth(y, m) {
    return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  }

  /** 'YYYY-MM-DD' → {y, m, d}。不正なら null */
  function parse(str) {
    if (typeof str !== 'string') return null;
    var mt = DATE_RE.exec(str);
    if (!mt) return null;
    var y = +mt[1], m = +mt[2], d = +mt[3];
    if (y < 1900 || y > 9999 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
    return { y: y, m: m, d: d };
  }

  function isValid(str) { return parse(str) !== null; }

  function format(y, m, d) { return y + '-' + pad2(m) + '-' + pad2(d); }

  /** 1970-01-01 からの通し日数 */
  function toDayNumber(str) {
    var p = parse(str);
    return Date.UTC(p.y, p.m - 1, p.d) / DAY_MS;
  }

  function fromDayNumber(n) {
    var dt = new Date(n * DAY_MS);
    return format(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }

  /** Asia/Tokyo における「今日」('YYYY-MM-DD')。now はテスト用に注入可能 */
  function todayTokyo(now) {
    now = now || new Date();
    try {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(now);
      var o = {};
      parts.forEach(function (p) { o[p.type] = p.value; });
      var s = o.year + '-' + o.month + '-' + o.day;
      if (isValid(s)) return s;
    } catch (e) { /* フォールバックへ */ }
    // 日本は夏時間がないため UTC+9 固定で計算できる
    var t = new Date(now.getTime() + 9 * 3600000);
    return format(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }

  function addDays(str, n) { return fromDayNumber(toDayNumber(str) + n); }

  /** b - a の日数 */
  function diffDays(a, b) { return toDayNumber(b) - toDayNumber(a); }

  /**
   * 月を加算。日は anchorDay（省略時は元の日）をその月の末日でクランプ。
   * 例: 1/31 + 1ヶ月 → 2/28（閏年は 2/29）
   */
  function addMonths(str, n, anchorDay) {
    var p = parse(str);
    var total = p.y * 12 + (p.m - 1) + n;
    var y = Math.floor(total / 12), m = (total % 12) + 1;
    var day = Math.min(anchorDay || p.d, daysInMonth(y, m));
    return format(y, m, day);
  }

  function addYears(str, n, anchorDay) { return addMonths(str, 12 * n, anchorDay); }

  var displayFormatter = null;
  var shortFormatter = null;
  function getFormatter(kind) {
    if (kind === 'short') {
      return shortFormatter || (shortFormatter = new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'short'
      }));
    }
    return displayFormatter || (displayFormatter = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
    }));
  }

  /** 表示用: 2026年11月16日(月)。UTC として整形するのでずれない */
  function formatJa(str, opts) {
    var p = parse(str);
    if (!p) return '';
    var dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
    return getFormatter(opts && opts.short ? 'short' : 'long').format(dt);
  }

  root.SK = root.SK || {};
  root.SK.dates = {
    TIME_ZONE: TIME_ZONE,
    parse: parse,
    isValid: isValid,
    format: format,
    daysInMonth: daysInMonth,
    isLeapYear: isLeapYear,
    todayTokyo: todayTokyo,
    addDays: addDays,
    addMonths: addMonths,
    addYears: addYears,
    diffDays: diffDays,
    formatJa: formatJa
  };
})(typeof window !== 'undefined' ? window : globalThis);
