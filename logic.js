/* Money Flow - 計算ロジック（UIに依存しない純粋関数）。金額はすべて円の整数。 */
(function (root) {
  'use strict';

  var CATS = [
    { key: 'main', label: 'メインカード', color: '#7BA6D4' },
    { key: 'sub', label: 'サブスク', color: '#B6A6DE' },
    { key: 'paypay', label: 'PayPay', color: '#E8A598' },
    { key: 'othercard', label: 'その他のクレジットカード', color: '#8FB59A' },
    { key: 'other', label: 'その他の支払い', color: '#CBBF9F' }
  ];
  var CAT_BY_KEY = {};
  CATS.forEach(function (c) { CAT_BY_KEY[c.key] = c; });

  var DEFAULT_INCOME_TYPES = ['舞台・出演料', 'アルバイト', 'コールセンター', '副業', 'その他'];
  var STORAGE_KEY = 'moneyflow.v1';

  function emptyData() {
    return {
      version: 1,
      incomeTypes: DEFAULT_INCOME_TYPES.slice(),
      incomes: [],       // 単発の収入明細
      expenses: [],      // 単発の支出明細
      subs: [],          // サブスク登録内容（マスタ）
      subMonths: {},     // "ym|subId" -> {amount}  月ごとの確定/修正金額
      recurring: [],     // 定期収入（マスタ）
      recMonths: {},     // "ym|recId" -> {amount}
      monthStatus: {},   // ym -> 'confirmed'
      accounts: []       // 現在の口座残高 [{id,name,amount}]
    };
  }

  /* ---------- 年月ユーティリティ（"YYYY-MM"） ---------- */
  function ymNow() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function ymAdd(ym, n) {
    var p = ym.split('-'), y = +p[0], m = +p[1] - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + '-' + pad2(m + 1);
  }
  function ymLabel(ym) { var p = ym.split('-'); return p[0] + '年' + (+p[1]) + '月'; }
  function ymShort(ym) { return (+ym.split('-')[1]) + '月'; }

  /* ---------- 表示 ---------- */
  function fmtNum(n) { return String(Math.abs(Math.trunc(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function fmtYen(n) { return (n < 0 ? '−' : '') + fmtNum(n) + '円'; }
  function fmtDelta(d) {
    if (d > 0) return '＋' + fmtNum(d) + '円';
    if (d < 0) return '−' + fmtNum(d) + '円';
    return '±0円';
  }
  function fmtPct(p) {
    var r = Math.round(Math.abs(p) * 10) / 10;
    var s = (r % 1 === 0) ? r.toFixed(1) : String(r);
    return (p > 0 ? '＋' : p < 0 ? '−' : '±') + s + '%';
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function toInt(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Math.round(Number(v));
    return isFinite(n) && n >= 0 ? n : null;
  }

  /* ---------- 価格履歴（過去月は変えず、適用月以降だけ変更） ---------- */
  function amountAt(changes, ym) {
    var amt = null, best = null;
    (changes || []).forEach(function (c) {
      if (c.fromYm <= ym && (best === null || c.fromYm >= best)) { best = c.fromYm; amt = c.amount; }
    });
    return amt;
  }
  function activeIn(master, ym) {
    return ym >= master.startYm && (!master.stopYm || ym < master.stopYm);
  }
  function setChange(master, applyYm, amount) {
    var ch = (master.changes || []).filter(function (c) { return c.fromYm < applyYm; });
    ch.push({ fromYm: applyYm, amount: amount });
    master.changes = ch;
  }

  /* ---------- 月ごとの明細（サブスク・定期収入は対象年月×IDで1件だけ導出＝重複しない） ---------- */
  function subItems(data, ym) {
    var seen = {}, out = [];
    data.subs.forEach(function (s) {
      if (!activeIn(s, ym)) return;
      var key = ym + '|' + s.id;
      if (seen[key]) return;
      seen[key] = true;
      var planned = amountAt(s.changes, ym);
      var ov = data.subMonths[key];
      var amount = ov && ov.amount != null ? ov.amount : planned;
      out.push({
        kind: 'sub', key: key, id: s.id, name: s.name, category: 'sub', method: s.method,
        amount: amount, planned: planned, overridden: !!(ov && ov.amount != null && ov.amount !== planned),
        day: s.day, ym: ym, included: !!s.included, note: ''
      });
    });
    return out;
  }
  function recItems(data, ym) {
    var seen = {}, out = [];
    data.recurring.forEach(function (r) {
      if (!activeIn(r, ym)) return;
      var key = ym + '|' + r.id;
      if (seen[key]) return;
      seen[key] = true;
      var planned = amountAt(r.changes, ym);
      var ov = data.recMonths[key];
      var amount = ov && ov.amount != null ? ov.amount : planned;
      out.push({
        kind: 'rec', key: key, id: r.id, name: r.name, type: r.type, amount: amount, planned: planned,
        overridden: !!(ov && ov.amount != null && ov.amount !== planned),
        day: r.day, ym: ym, scheduled: true, note: ''
      });
    });
    return out;
  }
  function monthItems(data, ym) {
    var incomes = data.incomes.filter(function (i) { return i.ym === ym; })
      .map(function (i) { return Object.assign({ kind: 'manual' }, i); })
      .concat(recItems(data, ym));
    var payments = data.expenses.filter(function (e) { return e.ym === ym; })
      .map(function (e) { return Object.assign({ kind: 'manual' }, e); })
      .concat(subItems(data, ym));
    return { incomes: incomes, payments: payments };
  }

  /* ---------- 集計：内訳(表示)と合計(計算)を分離 ---------- */
  function summarize(data, ym) {
    var mi = monthItems(data, ym);
    var byCat = {};
    CATS.forEach(function (c) { byCat[c.key] = { counted: 0, included: 0, items: [] }; });
    mi.payments.forEach(function (p) {
      var b = byCat[p.category] || byCat.other;
      b.items.push(p);
      if (p.included) b.included += p.amount; else b.counted += p.amount; // 含まれる分は合計に入れない
    });
    var payout = 0;
    CATS.forEach(function (c) { payout += byCat[c.key].counted; });
    var income = 0, byType = {};
    mi.incomes.forEach(function (i) {
      income += i.amount;
      byType[i.type] = (byType[i.type] || 0) + i.amount;
    });
    var subAll = byCat.sub.counted + byCat.sub.included;
    return {
      ym: ym, income: income, payout: payout, balance: income - payout,
      byCat: byCat, incomeByType: byType, incomes: mi.incomes, payments: mi.payments,
      hasData: mi.incomes.length + mi.payments.length > 0,
      subTotal: subAll, confirmed: data.monthStatus[ym] === 'confirmed'
    };
  }

  /* ---------- 日付順のお金の流れ（カード請求に含まれる分は除く） ----------
     fromYm の fromDay 日以降〜toYm の月末まで。日付未設定は月末扱い(99)。 */
  function timeline(data, fromYm, fromDay, toYm) {
    var ev = [];
    for (var ym = fromYm; ym <= toYm; ym = ymAdd(ym, 1)) {
      var mi = monthItems(data, ym);
      mi.incomes.forEach(function (i) { ev.push({ ym: ym, day: i.day || 99, kind: 'in', name: i.name, amount: i.amount, scheduled: !!i.scheduled }); });
      mi.payments.forEach(function (p) { if (!p.included) ev.push({ ym: ym, day: p.day || 99, kind: 'out', name: p.name, amount: p.amount, category: p.category }); });
    }
    ev = ev.filter(function (e) { return e.ym > fromYm || e.day >= fromDay; });
    ev.sort(function (a, b) { return a.ym < b.ym ? -1 : a.ym > b.ym ? 1 : a.day - b.day || (a.kind === 'in' ? -1 : 1); });
    return ev;
  }

  /* ---------- 前月比 ---------- */
  function compare(cur, prev, hasPrev) {
    if (!hasPrev) return { available: false, reason: 'nodata' };
    var d = cur - prev;
    if (prev === 0) return { available: true, delta: d, pct: null };
    return { available: true, delta: d, pct: d / prev * 100 };
  }
  function compareCat(data, ym, catKey) {
    var cur = summarize(data, ym), prev = summarize(data, ymAdd(ym, -1));
    return compare(cur.byCat[catKey].counted, prev.byCat[catKey].counted, prev.hasData);
  }
  function comparePayout(data, ym) {
    var cur = summarize(data, ym), prev = summarize(data, ymAdd(ym, -1));
    return compare(cur.payout, prev.payout, prev.hasData);
  }

  /* ---------- 月別推移 ---------- */
  function series(data, endYm, n) {
    var out = [];
    for (var i = n - 1; i >= 0; i--) {
      var ym = ymAdd(endYm, -i), s = summarize(data, ym);
      out.push({ ym: ym, hasData: s.hasData, income: s.income, payout: s.payout, balance: s.balance });
    }
    return out;
  }

  /* ---------- 保存 / 書き出し / 復元 ---------- */
  function validate(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('JSONの形式が正しくありません');
    var base = emptyData();
    ['incomes', 'expenses', 'subs', 'recurring', 'incomeTypes', 'accounts'].forEach(function (k) {
      if (obj[k] !== undefined && !Array.isArray(obj[k])) throw new Error(k + ' が配列ではありません');
    });
    ['subMonths', 'recMonths', 'monthStatus'].forEach(function (k) {
      if (obj[k] !== undefined && (typeof obj[k] !== 'object' || Array.isArray(obj[k]))) throw new Error(k + ' の形式が正しくありません');
    });
    var d = Object.assign(base, obj);
    d.version = 1;
    if (!d.incomeTypes.length) d.incomeTypes = DEFAULT_INCOME_TYPES.slice();
    return d;
  }
  function exportJSON(data) {
    return JSON.stringify({ app: 'MoneyFlow', exportedAt: new Date().toISOString(), data: data }, null, 2);
  }
  function parseImport(text) {
    var o = JSON.parse(text);
    return validate(o && o.data && o.app === 'MoneyFlow' ? o.data : o);
  }

  root.MF = {
    CATS: CATS, CAT_BY_KEY: CAT_BY_KEY, STORAGE_KEY: STORAGE_KEY, DEFAULT_INCOME_TYPES: DEFAULT_INCOME_TYPES,
    emptyData: emptyData, ymNow: ymNow, ymAdd: ymAdd, ymLabel: ymLabel, ymShort: ymShort,
    fmtNum: fmtNum, fmtYen: fmtYen, fmtDelta: fmtDelta, fmtPct: fmtPct, uid: uid, toInt: toInt,
    amountAt: amountAt, activeIn: activeIn, setChange: setChange,
    subItems: subItems, recItems: recItems, monthItems: monthItems, summarize: summarize,
    compare: compare, timeline: timeline, compareCat: compareCat, comparePayout: comparePayout, series: series,
    validate: validate, exportJSON: exportJSON, parseImport: parseImport
  };
})(typeof window !== 'undefined' ? window : globalThis);
