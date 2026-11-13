/*
 * form.js — 追加・編集フォーム
 */
(function (root) {
  'use strict';

  var S = root.SK.subs;
  var ui = root.SK.ui;

  var FIELDS = ['name', 'currency', 'amount', 'cycle', 'customIntervalDays', 'nextRenewal',
    'paymentMethod', 'cancelUrl', 'notes', 'notifyDaysBefore'];

  var form, editing = null;

  function field(name) { return form.elements[name]; }

  function setCycle(value) {
    var radios = form.querySelectorAll('input[name="cycle"]');
    Array.prototype.forEach.call(radios, function (r) { r.checked = r.value === value; });
    updateCustomVisibility();
  }

  function updateCurrency() {
    var usd = field('currency').value === 'USD';
    ui.$('#amount-label').textContent = usd ? '金額（米ドル）' : '金額（円）';
    ui.$('#amount-prefix').textContent = usd ? '$' : '¥';
    field('amount').inputMode = usd ? 'decimal' : 'numeric';
    field('amount').placeholder = usd ? '例：22.00' : '例：990';
  }

  function currentCycle() {
    var r = form.querySelector('input[name="cycle"]:checked');
    return r ? r.value : '';
  }

  function updateCustomVisibility() {
    var show = currentCycle() === 'custom';
    ui.$('#custom-interval-group').hidden = !show;
    field('customIntervalDays').required = show;
  }

  function clearErrors() {
    FIELDS.forEach(function (f) {
      var msg = ui.$('#err-' + f);
      if (msg) { msg.textContent = ''; msg.hidden = true; }
      var group = ui.$('[data-field="' + f + '"]');
      if (group) group.classList.remove('has-error');
      var input = form.querySelector('[name="' + f + '"]');
      if (input) input.removeAttribute('aria-invalid');
    });
    ui.$('#form-error-summary').hidden = true;
  }

  function showErrors(errors) {
    clearErrors();
    var first = null;
    Object.keys(errors).forEach(function (f) {
      var msg = ui.$('#err-' + f);
      if (msg) { msg.textContent = errors[f]; msg.hidden = false; }
      var group = ui.$('[data-field="' + f + '"]');
      if (group) group.classList.add('has-error');
      var inputs = form.querySelectorAll('[name="' + f + '"]');
      Array.prototype.forEach.call(inputs, function (i) { i.setAttribute('aria-invalid', 'true'); });
      if (!first && FIELDS.indexOf(f) >= 0) first = f;
    });
    var summary = ui.$('#form-error-summary');
    summary.textContent = '入力内容を確認してください（' + Object.keys(errors).length + '件）。';
    summary.hidden = false;
    // 最初のエラー欄へフォーカス
    var order = FIELDS.filter(function (f) { return errors[f]; });
    var target = order.length ? form.querySelector('[name="' + order[0] + '"]') : null;
    if (target) target.focus();
  }

  /** sub が null なら新規 */
  function open(sub, today) {
    editing = sub || null;
    form.reset();
    clearErrors();
    ui.$('#form-title').textContent = sub ? 'サブスクを編集' : 'サブスクを追加';
    ui.$('#form-submit').textContent = sub ? '変更を保存' : '追加する';
    field('name').value = sub ? sub.name : '';
    field('currency').value = sub ? sub.currency : 'JPY';
    updateCurrency();
    field('amount').value = sub ? (sub.currency === 'USD' ? sub.amount.toFixed(2) : String(sub.amount)) : '';
    setCycle(sub ? sub.cycle : 'monthly');
    field('customIntervalDays').value = sub && sub.customIntervalDays ? String(sub.customIntervalDays) : '';
    field('nextRenewal').value = sub ? sub.nextRenewal : '';
    field('paymentMethod').value = sub ? sub.paymentMethod : '';
    field('cancelUrl').value = sub ? sub.cancelUrl : '';
    field('notes').value = sub ? sub.notes : '';
    field('notifyDaysBefore').value = String(sub ? sub.notifyDaysBefore : S.DEFAULT_NOTIFY_DAYS);
  }

  function readValues() {
    var v = {
      name: field('name').value,
      amount: field('amount').value,
      currency: field('currency').value,
      cycle: currentCycle(),
      customIntervalDays: field('customIntervalDays').value,
      nextRenewal: field('nextRenewal').value,
      paymentMethod: field('paymentMethod').value,
      cancelUrl: field('cancelUrl').value,
      notes: field('notes').value,
      notifyDaysBefore: field('notifyDaysBefore').value
    };
    if (editing) {
      v.id = editing.id;
      v.createdAt = editing.createdAt;
      // 日付を変えていなければ「本来の日」（月末など）を引き継ぐ
      if (v.nextRenewal === editing.nextRenewal) v.anchorDay = editing.anchorDay;
    }
    v.updatedAt = new Date().toISOString();
    return v;
  }

  /**
   * 初期化。onSave(sub) は保存処理、onCancel() はホームへ戻る処理。
   */
  function init(handlers) {
    form = ui.$('#sub-form');
    Array.prototype.forEach.call(form.querySelectorAll('input[name="cycle"]'), function (r) {
      r.addEventListener('change', updateCustomVisibility);
    });
    Array.prototype.forEach.call(form.querySelectorAll('input[name="currency"]'), function (r) {
      r.addEventListener('change', updateCurrency);
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var result = S.validate(readValues());
      if (!result.ok) { showErrors(result.errors); return; }
      handlers.onSave(result.value, !editing);
    });
    ui.$('#form-cancel').addEventListener('click', handlers.onCancel);
    ui.$('#form-back').addEventListener('click', handlers.onCancel);
  }

  root.SK.form = { init: init, open: open };
})(window);
