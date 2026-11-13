/*
 * views.js — ホーム画面の描画（合計、近日更新バナー、一覧、空の状態）
 */
(function (root) {
  'use strict';

  var S = root.SK.subs;
  var D = root.SK.dates;
  var ui = root.SK.ui;
  var el = ui.el;

  function renderTotals(list) {
    var t = S.totals(list);
    ui.$('#total-monthly').textContent = S.formatYen(t.monthly);
    ui.$('#total-yearly').textContent = S.formatYen(t.yearly);
    ui.$('#total-count').textContent = t.count + '件';
  }

  function renderBanner(list, today) {
    var banner = ui.$('#banner');
    var due = S.sortByRenewal(list.filter(function (s) { return S.isInNotifyWindow(s, today); }));
    banner.hidden = due.length === 0;
    ui.$('#hero-insight').textContent = due.length
      ? due.length + '件の更新が近づいています'
      : '毎月の支出を、ひと目で。';
    if (!due.length) return;
    ui.$('#banner-title').textContent = due.length + '件の更新が近づいています';
    var ul = ui.$('#banner-list');
    ul.replaceChildren.apply(ul, due.map(function (s) {
      return el('li', null, [
        el('span', { class: 'banner-name', text: s.name }),
        el('span', { class: 'banner-days', text: S.daysLeftLabel(S.daysLeft(s, today)) })
      ]);
    }));
  }

  function monogram(name) {
    var first = Array.from(String(name).trim())[0] || '?';
    return first.toUpperCase();
  }

  function card(s, today, handlers) {
    var n = S.daysLeft(s, today);
    var soon = S.isInNotifyWindow(s, today);
    var badgeClass = 'badge' + (n === 0 ? ' badge-today' : soon ? ' badge-soon' : '');
    var monthlyNote = s.cycle !== 'monthly'
      ? el('p', { class: 'card-sub', text: '月あたり 約' + S.formatYen(S.monthlyCost(s)) })
      : null;

    var actions = [
      el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: function () { handlers.edit(s.id); },
        'aria-label': s.name + 'を編集', text: '編集' }),
      el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: function () { handlers.ics(s.id); },
        'aria-label': s.name + 'をカレンダーに書き出す', text: 'カレンダーへ' }),
      el('button', { type: 'button', class: 'btn btn-ghost-danger btn-sm', onclick: function () { handlers.remove(s.id); },
        'aria-label': s.name + 'を削除', text: '削除' })
    ];
    if (s.cancelUrl && S.isHttpUrl(s.cancelUrl)) {
      actions.unshift(el('a', {
        class: 'btn btn-secondary btn-sm btn-block-sm', href: s.cancelUrl, target: '_blank',
        rel: 'noopener noreferrer', text: '解約ページを開く ↗'
      }));
    }

    var meta = [];
    if (s.paymentMethod) meta.push(el('div', null, [el('dt', { text: '支払い' }), el('dd', { text: s.paymentMethod })]));
    meta.push(el('div', null, [el('dt', { text: '通知' }),
      el('dd', { text: s.notifyDaysBefore === 0 ? '当日' : s.notifyDaysBefore + '日前' })]));

    return el('li', { class: 'card' + (soon ? ' is-soon' : ''), 'data-id': s.id }, [
      el('div', { class: 'card-head' }, [
        el('span', { class: 'monogram', 'aria-hidden': 'true', text: monogram(s.name) }),
        el('div', { class: 'card-info' }, [
          el('h3', { class: 'card-title', text: s.name }),
          el('p', { class: 'card-renewal', text: D.formatJa(s.nextRenewal) + ' 更新' })
        ]),
        el('div', { class: 'card-right' }, [
          el('p', { class: 'card-amount' }, [
            el('span', { class: 'amount', text: S.formatYen(s.amount) }),
            el('span', { class: 'cycle', text: ' / ' + S.cycleText(s) })
          ]),
          el('span', { class: badgeClass, text: S.daysLeftLabel(n) })
        ])
      ]),
      soon ? el('p', { class: 'soon-label', text: 'まもなく更新' }) : null,
      monthlyNote,
      el('dl', { class: 'card-meta' }, meta),
      s.notes ? el('p', { class: 'card-notes', text: s.notes }) : null,
      el('div', { class: 'card-actions' }, actions)
    ]);
  }

  function renderList(list, today, handlers) {
    var ul = ui.$('#sub-list');
    var empty = ui.$('#empty-state');
    var sorted = S.sortByRenewal(list);
    empty.hidden = sorted.length > 0;
    ui.$('#list-heading').hidden = sorted.length === 0;
    ui.$('#export-all-ics').disabled = sorted.length === 0;
    ui.$('#export-json').disabled = sorted.length === 0;
    ul.replaceChildren.apply(ul, sorted.map(function (s) { return card(s, today, handlers); }));
  }

  function renderHome(list, today, handlers) {
    renderTotals(list);
    renderBanner(list, today);
    renderList(list, today, handlers);
  }

  root.SK.views = { renderHome: renderHome };
})(window);
