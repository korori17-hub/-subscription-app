/*
 * storage.js — localStorage への保存・読み込み、バックアップ（JSON）の書き出し・読み込み
 *
 * 保存形式（キー: subkanri.v1）:
 *   { "version": 1, "subscriptions": [ ... ], "settings": { "usdJpyRate": 159 } }
 */
(function (root) {
  'use strict';

  var S = root.SK.subs;

  var STORAGE_KEY = 'subkanri.v1';
  var NOTIFIED_KEY = 'subkanri.v1.notified';
  var CORRUPT_PREFIX = 'subkanri.v1.corrupt.';
  var SCHEMA_VERSION = 1;
  var APP_ID = 'subkanri';

  function ls() {
    try { return root.localStorage; } catch (e) { return null; }
  }

  function isAvailable() {
    var s = ls();
    if (!s) return false;
    try {
      s.setItem('subkanri.__test', '1');
      s.removeItem('subkanri.__test');
      return true;
    } catch (e) { return false; }
  }

  /**
   * 生データを検証してサブスク配列にする。不正なら Error（日本語メッセージ）を投げる。
   * 1件でも不正なら全体を拒否する（中途半端な取り込みで既存データを壊さないため）。
   */
  function normalizeSettings(settings) {
    return { usdJpyRate: settings && S.validRate(settings.usdJpyRate) ? settings.usdJpyRate : S.DEFAULT_USD_JPY_RATE };
  }

  // withSettings=true は配列と設定をまとめて返す。省略時は従来の配列 API。
  function parseSchema(obj, withSettings) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      throw new Error('ファイルの形式が正しくありません（サブスク管理のバックアップではないようです）。');
    }
    if (typeof obj.version !== 'number') {
      throw new Error('バックアップの形式が正しくありません（version がありません）。');
    }
    if (obj.version > SCHEMA_VERSION) {
      throw new Error('このバックアップは新しいバージョンのアプリで作られたため読み込めません。');
    }
    if (!Array.isArray(obj.subscriptions)) {
      throw new Error('バックアップの形式が正しくありません（subscriptions がありません）。');
    }
    var seen = {};
    var subscriptions = obj.subscriptions.map(function (raw, i) {
      if (!raw || typeof raw !== 'object') {
        throw new Error((i + 1) + '件目のデータが壊れています。');
      }
      var r = S.validate(raw);
      if (!r.ok) {
        var firstKey = Object.keys(r.errors)[0];
        var label = raw && raw.name ? '「' + String(raw.name).slice(0, 30) + '」' : (i + 1) + '件目';
        throw new Error(label + 'のデータに問題があります: ' + r.errors[firstKey]);
      }
      if (seen[r.value.id]) r.value.id = S.newId(); // ID 重複は振り直す
      seen[r.value.id] = true;
      return r.value;
    });
    return withSettings ? { subscriptions: subscriptions, settings: normalizeSettings(obj.settings) } : subscriptions;
  }

  /**
   * 読み込み。戻り値: { subscriptions, settings, corrupted: boolean }
   * 壊れていた場合は元データを退避キーに残し、空から始める（上書きで失わないように）。
   */
  function load() {
    var s = ls();
    if (!s) return { subscriptions: [], settings: normalizeSettings(), corrupted: false };
    var raw = s.getItem(STORAGE_KEY);
    if (raw == null) return { subscriptions: [], settings: normalizeSettings(), corrupted: false };
    try {
      return Object.assign(parseSchema(JSON.parse(raw), true), { corrupted: false });
    } catch (e) {
      try { s.setItem(CORRUPT_PREFIX + Date.now(), raw); } catch (e2) { /* 容量不足など */ }
      return { subscriptions: [], settings: normalizeSettings(), corrupted: true };
    }
  }

  /** 保存。失敗時は false */
  function save(list, settings) {
    var s = ls();
    if (!s) return false;
    try {
      s.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, subscriptions: list, settings: normalizeSettings(settings) }));
      return true;
    } catch (e) {
      return false;
    }
  }

  /** バックアップ用 JSON 文字列 */
  function exportJson(list, now, settings) {
    return JSON.stringify({
      app: APP_ID,
      version: SCHEMA_VERSION,
      exportedAt: (now || new Date()).toISOString(),
      subscriptions: list,
      settings: normalizeSettings(settings)
    }, null, 2);
  }

  /** バックアップ JSON 文字列を検証してサブスク配列を返す。不正なら日本語の Error */
  function importJson(text, withSettings) {
    var obj;
    try {
      obj = JSON.parse(String(text).replace(/^﻿/, ''));
    } catch (e) {
      throw new Error('ファイルを読み取れませんでした。JSON の形式が壊れているようです。');
    }
    return parseSchema(obj, withSettings);
  }

  /* ---- ブラウザ通知の既送管理（同日・同じサブスクは一度だけ） ---- */

  function getNotified(today) {
    var s = ls();
    if (!s) return [];
    try {
      var o = JSON.parse(s.getItem(NOTIFIED_KEY) || 'null');
      if (o && o.date === today && Array.isArray(o.keys)) return o.keys;
    } catch (e) { /* 無視 */ }
    return [];
  }

  function setNotified(today, keys) {
    var s = ls();
    if (!s) return;
    try { s.setItem(NOTIFIED_KEY, JSON.stringify({ date: today, keys: keys })); } catch (e) { /* 無視 */ }
  }

  root.SK.storage = {
    STORAGE_KEY: STORAGE_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    isAvailable: isAvailable,
    load: load,
    save: save,
    parseSchema: parseSchema,
    exportJson: exportJson,
    importJson: importJson,
    getNotified: getNotified,
    setNotified: setNotified
  };
})(typeof window !== 'undefined' ? window : globalThis);
