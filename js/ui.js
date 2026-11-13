/*
 * ui.js — DOM の小さなヘルパー（要素生成・トースト・確認ダイアログ・ファイル保存）
 * ユーザー入力は必ず textContent で入れ、innerHTML には入れない。
 */
(function (root) {
  'use strict';

  var doc = root.document;

  /** el('div', {class: 'x', onclick: fn}, [child, 'text']) */
  function el(tag, attrs, children) {
    var node = doc.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (v === true) node.setAttribute(k, '');
        else node.setAttribute(k, String(v));
      });
    }
    (children || []).forEach(function (c) {
      if (c == null || c === false) return;
      node.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c);
    });
    return node;
  }

  function $(sel) { return doc.querySelector(sel); }

  var toastTimer = null;
  function toast(message) {
    var t = $('#toast');
    t.textContent = message;
    t.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-visible'); }, 3000);
  }

  /**
   * 確認ダイアログ（<dialog> 非対応ブラウザでは window.confirm）
   * 戻り値: Promise<boolean>
   */
  function confirmDialog(opts) {
    var dlg = $('#confirm-dialog');
    if (!dlg || typeof dlg.showModal !== 'function') {
      return Promise.resolve(root.confirm(opts.title + '\n\n' + (opts.message || '')));
    }
    $('#confirm-title').textContent = opts.title;
    $('#confirm-message').textContent = opts.message || '';
    var ok = $('#confirm-ok');
    ok.textContent = opts.okLabel || 'OK';
    ok.className = 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary');
    return new Promise(function (resolve) {
      function onClose() {
        dlg.removeEventListener('close', onClose);
        resolve(dlg.returnValue === 'ok');
      }
      dlg.returnValue = '';
      dlg.addEventListener('close', onClose);
      dlg.showModal();
      $('#confirm-cancel').focus();
    });
  }

  /** テキストをファイルとして保存（ダウンロード） */
  function downloadText(text, fileName, mime) {
    var blob = new Blob([text], { type: mime + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: fileName, style: 'display:none' });
    doc.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1000);
  }

  root.SK.ui = { el: el, $: $, toast: toast, confirmDialog: confirmDialog, downloadText: downloadText };
})(window);
