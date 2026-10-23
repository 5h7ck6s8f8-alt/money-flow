/* Money Flow - UI */
(function () {
  'use strict';
  var M = MF, CATS = M.CATS, CATK = M.CAT_BY_KEY;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };

  /* ---------- 保存（端末内 localStorage） ---------- */
  var memoryOnly = false;
  function load() {
    try {
      var raw = localStorage.getItem(M.STORAGE_KEY);
      if (raw) return M.validate(JSON.parse(raw));
    } catch (e) { memoryOnly = true; }
    return M.emptyData();
  }
  function save() {
    try { localStorage.setItem(M.STORAGE_KEY, JSON.stringify(data)); memoryOnly = false; }
    catch (e) { memoryOnly = true; toast('保存できませんでした。設定から書き出しでバックアップしてください'); }
  }
  var data = load();
  var st = { tab: 'home', ym: M.ymNow(), cat: 'all', n: 6, form: null, pad: null };

  /* ---------- 小物 ---------- */
  var toastT;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2200); }
  function lock() { document.body.classList.toggle('lock', !!(st.form || st.pad || dlgOpen)); }
  function yen(n) { return M.fmtYen(n); }
  function deltaChip(c, suffixPct) {
    if (!c.available) return '<span class="delta none">比較データなし</span>';
    var cls = c.delta > 0 ? 'up' : c.delta < 0 ? 'down' : 'flat';
    var t = M.fmtDelta(c.delta);
    if (c.pct !== null) t += '（' + M.fmtPct(c.pct) + '）';
    else if (suffixPct !== false) t += '（先月0円のため率なし）';
    return '<span class="delta ' + cls + '">' + t + '</span>';
  }
  var BILL = ['main', 'paypay', 'othercard']; // 月の引き落とし額だけを入力するカテゴリ
  function billAmount(cat, ym) {
    var list = data.expenses.filter(function (e) { return e.ym === ym && e.category === cat && !e.included; });
    return list.length ? list.reduce(function (a, e) { return a + e.amount; }, 0) : null;
  }
  function setBill(cat, ym, amount) {
    data.expenses = data.expenses.filter(function (e) { return !(e.ym === ym && e.category === cat && !e.included); });
    if (amount != null) data.expenses.push({ id: M.uid(), name: CATK[cat].label, category: cat, amount: amount, ym: ym, day: null, note: '', included: false, bill: true });
    save();
  }
  function openBill(cat) {
    var ym = st.ym;
    openPad(M.ymLabel(ym) + 'の' + CATK[cat].label + 'の引き落とし額', billAmount(cat, ym), function (v) {
      setBill(cat, ym, v); if (st.form) { st.form = null; renderModal(); } render(); toast(v == null ? '入力を消しました' : '保存しました');
    });
  }
  function disp(sum, key) { var b = sum.byCat[key]; return b.counted + b.included; } // 内訳表示用（合計用とは別）
  function catDelta(key) {
    var cur = M.summarize(data, st.ym), prev = M.summarize(data, M.ymAdd(st.ym, -1));
    return M.compare(disp(cur, key), disp(prev, key), prev.hasData);
  }
  var ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/></svg>',
    exp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18M7 15h3"/></svg>',
    subs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v4h-4"/></svg>',
    inc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M7 11l5 5 5-5M5 20h14"/></svg>',
    set: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/></svg>'
  };

  /* ---------- グラフ ---------- */
  function donut(items, centerText) {
    var total = items.reduce(function (a, b) { return a + b.value; }, 0), cum = 0, segs = '';
    items.forEach(function (it) {
      if (it.value <= 0) return;
      var p = it.value / total * 100;
      segs += '<circle cx="21" cy="21" r="15.9155" fill="none" stroke="' + it.color + '" stroke-width="6" stroke-dasharray="' + p.toFixed(3) + ' ' + (100 - p).toFixed(3) + '" stroke-dashoffset="' + (25 - cum).toFixed(3) + '"/>';
      cum += p;
    });
    var svg = '<svg class="donut" viewBox="0 0 42 42" role="img" aria-label="円グラフ"><circle cx="21" cy="21" r="15.9155" fill="none" stroke="#F3F0E8" stroke-width="6"/>' + segs +
      '<text x="21" y="20" text-anchor="middle" font-size="2.9" fill="#7A808A">合計</text><text x="21" y="25" text-anchor="middle" font-size="4" font-weight="700" fill="#3B4048">' + esc(centerText) + '</text></svg>';
    var legend = items.filter(function (i) { return i.value > 0; }).map(function (it) {
      return '<div class="li"><span class="dot" style="background:' + it.color + '"></span><span>' + esc(it.label) + '</span><b>' + yen(it.value) + '<span class="muted small"> ' + (Math.round(it.value / total * 1000) / 10) + '%</span></b></div>';
    }).join('');
    return '<div class="donutwrap">' + svg + '<div class="legend">' + legend + '</div></div>';
  }
  var INC_COLORS = ['#7BA6D4', '#8FB59A', '#B6A6DE', '#E8A598', '#CBBF9F', '#9CC9CF', '#D9B3C9'];

  function barChart(sr) {
    var W = 320, H = 168, base = 138, top = 14, ph = base - top, n = sr.length, gw = (W - 12) / n;
    var mx = 1; sr.forEach(function (r) { if (r.hasData) mx = Math.max(mx, r.income, r.payout, Math.abs(r.balance)); });
    var y = function (v) { return base - Math.max(0, v) / mx * ph; };
    var bw = Math.min(14, gw * 0.3), g = '', pts = [], dots = '';
    sr.forEach(function (r, i) {
      var cx = 6 + gw * i + gw / 2;
      if (r.hasData) {
        g += '<rect x="' + (cx - bw - 1) + '" y="' + y(r.income) + '" width="' + bw + '" height="' + (base - y(r.income)) + '" rx="3" fill="#8DB4DC"/>';
        g += '<rect x="' + (cx + 1) + '" y="' + y(r.payout) + '" width="' + bw + '" height="' + (base - y(r.payout)) + '" rx="3" fill="#E2A296"/>';
        pts.push(cx.toFixed(1) + ',' + y(r.balance).toFixed(1));
        dots += '<circle cx="' + cx + '" cy="' + y(r.balance) + '" r="3" fill="#fff" stroke="#6F9577" stroke-width="2"/>';
      } else {
        g += '<rect x="' + (cx - gw * 0.35) + '" y="' + (top + 30) + '" width="' + (gw * 0.7) + '" height="' + (base - top - 30) + '" rx="4" fill="none" stroke="#D9D3C3" stroke-dasharray="3 3"/><text x="' + cx + '" y="' + (base - 8) + '" text-anchor="middle" font-size="' + (n > 6 ? 6 : 8) + '" fill="#9A9686">未入力</text>';
      }
      g += '<text x="' + cx + '" y="' + (base + 15) + '" text-anchor="middle" font-size="9" fill="#7A808A">' + M.ymShort(r.ym) + '</text>';
    });
    var line = pts.length > 1 ? '<polyline points="' + pts.join(' ') + '" fill="none" stroke="#6F9577" stroke-width="2" stroke-linejoin="round"/>' : '';
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="月別の収入・引き落とし・残額"><line x1="4" x2="' + (W - 4) + '" y1="' + base + '" y2="' + base + '" stroke="#ECE7DB"/>' + g + line + dots + '</svg>' +
      '<div class="small muted" style="display:flex;gap:14px;flex-wrap:wrap"><span><span class="dot" style="display:inline-block;background:#8DB4DC"></span> 収入</span><span><span class="dot" style="display:inline-block;background:#E2A296"></span> 引き落とし</span><span><span class="dot" style="display:inline-block;background:#6F9577"></span> 差し引き残額</span></div>';
  }

  /* ---------- 画面 ---------- */
  function header() {
    var s = M.summarize(data, st.ym);
    return '<div class="top"><div class="brand"><span>Money Flow</span>' + (s.confirmed ? '<span class="badge ok">この月は確定済み</span>' : '<span class="badge">予定</span>') + '</div>' +
      '<div class="mswitch"><button class="iconbtn" data-act="prevM" aria-label="前の月">‹</button><button class="lbl" data-act="thisM" title="今月へ">' + M.ymLabel(st.ym) + '</button><button class="iconbtn" data-act="nextM" aria-label="次の月">›</button></div></div>';
  }

  function viewHome() {
    var s = M.summarize(data, st.ym), prevS = M.summarize(data, M.ymAdd(st.ym, -1));
    var h = '';
    var cmp = M.compare(s.payout, prevS.payout, prevS.hasData);
    h += '<section class="card hero"><div class="cap">' + M.ymLabel(st.ym) + 'の差し引き残額（予定）</div><div class="big">' + (s.balance < 0 ? '−' : '') + M.fmtNum(s.balance) + '<small>円</small></div>' +
      (s.balance < 0 ? '<div class="gentle">この月は支払いが収入を少し上回りそうです。支払いの時期や金額を見直すきっかけにしてみてください。</div>' : '') +
      '<div class="pair"><div class="box"><div class="cap">入ってくるお金</div><div class="num">' + yen(s.income) + '</div></div><div class="box"><div class="cap">引き落とし合計</div><div class="num">' + yen(s.payout) + '</div><div>' + deltaChip(cmp) + '<span class="small muted"> 先月比</span></div></div></div>' +
      '<div class="note">※ 登録した収入と支出だけで計算した予定額です。実際の銀行残高とは異なります。</div></section>';
    var accTotal = data.accounts.reduce(function (a, x) { return a + x.amount; }, 0);
    h += '<section class="card"><h2>いま口座にあるお金</h2>' + (data.accounts.length ? data.accounts.map(function (a) {
      return '<button class="row" data-act="editAccount" data-id="' + esc(a.id) + '"><span class="grow"><div class="name">' + esc(a.name) + '</div></span><span class="amt">' + yen(a.amount) + '</span><span class="chev">›</span></button>';
    }).join('') + '<div class="row" style="border-top:2px solid var(--line)"><span class="grow"><b>口座の合計</b></span><span class="amt">' + yen(accTotal) + '</span></div>' +
      '<div class="pair" style="grid-template-columns:1fr"><div class="box" style="background:var(--sage-bg)"><div class="cap">総合計（口座の合計 ＋ ' + M.ymLabel(st.ym) + 'の差し引き残額）</div><div class="num" style="font-size:26px">' + yen(accTotal + s.balance) + '</div><div class="small muted">この月の予定が終わったあとに手元に残る見込みです</div></div></div>'
      : '<div class="empty">口座のお金を入れると、総合計がわかります<br><button class="btn sage sm" data-act="addAccount">口座のお金を入力する</button></div>') +
      (data.accounts.length ? '<button class="btn ghost sm" style="margin-top:10px" data-act="addAccount">＋ 口座を追加</button><div class="note">金額は自分で入力した値です。入金済みの収入を重ねて数えないよう、残高を更新するときは収入の入金状況も見直してください。</div>' : '') + '</section>';
    h += '<div class="actions"><button class="btn blue" data-act="addIncome">＋ 収入を追加</button><button class="btn" data-act="addExpense">＋ 支出を追加</button></div>';
    if (!s.hasData) {
      h += '<section class="card empty"><div style="font-size:28px">🌿</div><p>この月はまだ何も入力されていません。<br>まずは収入と、毎月のサブスクを入れてみましょう。</p><button class="btn sage" data-act="addSub">サブスクを登録する</button></section>';
    }
    // 引き落とし内訳
    h += '<section class="card"><h2>今月の引き落とし内訳</h2>' + CATS.map(function (c) {
      var b = s.byCat[c.key], amt = disp(s, c.key), isBill = BILL.indexOf(c.key) >= 0;
      var act = isBill ? 'openBill' : c.key === 'sub' ? 'goSubs' : 'none';
      var empty = isBill && b.items.length === 0;
      var inner = '<span class="dot" style="background:' + c.color + '"></span><span class="grow"><div class="name">' + c.label + '</div>' + (empty ? '<div class="small muted">タップして引き落とし額を入力</div>' : deltaChip(catDelta(c.key))) +
        (b.included > 0 ? '<div class="small muted">うち' + yen(b.included) + 'はカード請求に含まれるため合計には足していません</div>' : '') +
        '</span><span class="amt' + (empty ? ' muted" style="font-weight:400' : '') + '">' + (empty ? '未入力' : yen(amt)) + '</span>' + (act !== 'none' ? '<span class="chev">›</span>' : '');
      var out = act === 'none' ? '<div class="row">' + inner + '</div>' : '<button class="row" data-act="' + act + '" data-cat="' + c.key + '">' + inner + '</button>';
      if (c.key === 'other') {
        out += b.items.map(function (p) { return '<button class="row" style="padding-left:24px" data-act="editItem" data-kind="manual" data-id="' + esc(p.id) + '" data-income="0"><span class="grow"><div class="name">' + esc(p.name) + '</div></span><span class="amt" style="font-size:15px">' + yen(p.amount) + '</span><span class="chev">›</span></button>'; }).join('') +
          '<button class="btn ghost sm" style="margin:2px 0 8px 24px" data-act="addOther">＋ 名前をつけて追加</button>';
      }
      return out;
    }).join('') + '<div class="row" style="border-top:2px solid var(--line)"><span class="grow"><b>引き落とし合計</b><div class="small muted">重複を除いた金額</div></span><span class="amt">' + yen(s.payout) + '</span></div></section>';
    // 円グラフ
    var pi = CATS.map(function (c) { return { label: c.label, value: s.byCat[c.key].counted, color: c.color }; });
    h += '<section class="card"><h2>支出の内訳</h2>' + (s.payout > 0 ? donut(pi, M.fmtNum(s.payout) + '円') : '<div class="empty">支出がまだありません<br><button class="btn sm" data-act="addExpense">支出を追加</button></div>') + '</section>';
    var types = Object.keys(s.incomeByType).filter(function (k) { return s.incomeByType[k] > 0; });
    var ii = types.map(function (k, i) { return { label: k, value: s.incomeByType[k], color: INC_COLORS[i % INC_COLORS.length] }; });
    h += '<section class="card"><h2>収入の内訳</h2>' + (ii.length ? donut(ii, M.fmtNum(s.income) + '円') : '<div class="empty">収入がまだありません<br><button class="btn sm" data-act="addIncome">収入を追加</button></div>') + '</section>';
    // 月別推移
    var sr = M.series(data, st.ym, st.n);
    h += '<section class="card"><div class="gh"><h2 style="margin:0">月別の動き</h2><div class="seg">' + [3, 6, 12].map(function (n) { return '<button data-act="chartN" data-n="' + n + '" class="' + (st.n === n ? 'on' : '') + '">' + n + 'か月</button>'; }).join('') + '</div></div>' + barChart(sr) +
      '<table class="mtable"><thead><tr><th>月</th><th>収入</th><th>引き落とし</th><th>残額</th></tr></thead><tbody>' + sr.slice().reverse().map(function (r) {
        return r.hasData ? '<tr><td>' + M.ymLabel(r.ym) + '</td><td>' + M.fmtNum(r.income) + '</td><td>' + M.fmtNum(r.payout) + '</td><td>' + (r.balance < 0 ? '−' : '') + M.fmtNum(r.balance) + '</td></tr>' : '<tr><td>' + M.ymLabel(r.ym) + '</td><td colspan="3" class="muted">未入力</td></tr>';
      }).join('') + '</tbody></table></section>';
    h += '<div class="actions" style="grid-template-columns:1fr"><button class="btn ghost" data-act="toggleConfirm">' + (s.confirmed ? '確定を解除する' : 'この月を「確定」にする') + '</button></div>';
    return h;
  }

  function itemRow(p, isIncome) {
    var tags = '';
    if (p.kind === 'sub') tags += '<span class="tag">サブスク自動</span>';
    if (p.kind === 'rec') tags += '<span class="tag inc">定期・予定</span>';
    if (p.included) tags += '<span class="tag">請求に含む</span>';
    if (p.overridden) tags += '<span class="tag">金額を修正済み</span>';
    return '<button class="row" data-act="editItem" data-kind="' + p.kind + '" data-id="' + esc(p.id) + '" data-income="' + (isIncome ? 1 : 0) + '"><span class="grow"><div class="name">' + esc(p.name) + tags + '</div><div class="small muted">' + (p.day ? p.day + '日' : '') + (isIncome && p.type ? '・' + esc(p.type) : '') + (p.note ? '・' + esc(p.note) : '') + '</div></span><span class="amt">' + yen(p.amount) + '</span><span class="chev">›</span></button>';
  }

  function viewExpenses() {
    var s = M.summarize(data, st.ym);
    var h = '<section class="card"><h2>' + M.ymLabel(st.ym) + 'の引き落とし合計</h2><div class="big" style="font-size:32px;font-weight:700">' + yen(s.payout) + '</div></section>';
    h += '<div class="chips" style="margin:0 0 6px"><button class="chip ' + (st.cat === 'all' ? 'on' : '') + '" data-act="filterCat" data-cat="all">すべて</button>' + CATS.map(function (c) { return '<button class="chip ' + (st.cat === c.key ? 'on' : '') + '" data-act="filterCat" data-cat="' + c.key + '">' + c.label + '</button>'; }).join('') + '</div>';
    CATS.forEach(function (c) {
      if (st.cat !== 'all' && st.cat !== c.key) return;
      var b = s.byCat[c.key], items = b.items.slice().sort(function (a, z) { return (a.day || 99) - (z.day || 99); });
      h += '<section class="card"><div class="gh"><b><span class="dot" style="display:inline-block;background:' + c.color + ';margin-right:6px"></span>' + c.label + '</b><b>' + yen(b.counted + b.included) + '</b></div>';
      h += items.length ? items.map(function (p) { return itemRow(p, false); }).join('') : '<div class="small muted" style="padding:8px 0">まだ登録がありません</div>';
      h += '</section>';
    });
    return h + '<button class="btn block" data-act="addExpense">＋ 支出を追加</button>';
  }

  function subStatus(sub) {
    if (st.ym < sub.startYm) return ['開始前', 'off'];
    if (sub.stopYm && st.ym >= sub.stopYm) return ['停止中', 'off'];
    return ['利用中', 'inc'];
  }
  function nextPay(sub) {
    var now = M.ymNow(), day = new Date().getDate();
    var cand = (M.activeIn(sub, now) && sub.day >= day) ? now : M.ymAdd(now, 1);
    if (cand < sub.startYm) cand = sub.startYm;
    return M.activeIn(sub, cand) ? M.ymLabel(cand) + sub.day + '日' : 'なし';
  }
  function viewSubs() {
    var items = M.subItems(data, st.ym), total = items.reduce(function (a, b) { return a + b.amount; }, 0);
    var h = '<section class="card hero"><div class="cap">' + M.ymLabel(st.ym) + 'のサブスク月額合計</div><div class="big">' + M.fmtNum(total) + '<small>円</small></div><div class="note">利用中のサブスクは、翌月以降も自動で支払い予定に入ります。</div></section>';
    var subs = data.subs.slice().sort(function (a, b) { return a.day - b.day; });
    h += '<section class="card"><h2>登録済みのサブスク</h2>';
    if (!subs.length) h += '<div class="empty">まだ登録がありません<br>動画・音楽・AIなど、毎月かかるものを入れておくと自動で毎月反映されます</div>';
    subs.forEach(function (s) {
      var stt = subStatus(s), amt = M.amountAt(s.changes, st.ym) != null ? M.amountAt(s.changes, st.ym) : M.amountAt(s.changes, s.startYm);
      h += '<button class="row" data-act="editSub" data-id="' + esc(s.id) + '"><span class="grow"><div class="name">' + esc(s.name) + '<span class="tag ' + stt[1] + '">' + stt[0] + '</span>' + (s.included ? '<span class="tag">請求に含む</span>' : '') + '</div><div class="small muted">毎月' + s.day + '日・' + CATK[s.method].label + '・次回 ' + nextPay(s) + '</div></span><span class="amt">' + yen(amt) + '</span><span class="chev">›</span></button>';
    });
    return h + '</section><button class="btn block" data-act="addSub">＋ サブスクを追加</button>';
  }

  function viewIncomes() {
    var s = M.summarize(data, st.ym);
    var h = '<section class="card hero"><div class="cap">' + M.ymLabel(st.ym) + 'の収入合計（予定）</div><div class="big">' + M.fmtNum(s.income) + '<small>円</small></div>' +
      Object.keys(s.incomeByType).map(function (k) { return '<div class="row" style="padding:8px 0"><span class="grow">' + esc(k) + '</span><b>' + yen(s.incomeByType[k]) + '</b></div>'; }).join('') +
      '<div class="note">定期収入は「予定額」です。入金が確定したことにはなりません。</div></section>';
    h += '<section class="card"><h2>収入の明細</h2>' + (s.incomes.length ? s.incomes.slice().sort(function (a, b) { return (a.day || 99) - (b.day || 99); }).map(function (i) { return itemRow(i, true); }).join('') : '<div class="empty">まだ登録がありません</div>') + '</section>';
    h += '<button class="btn block" data-act="addIncome">＋ 収入を追加</button><div style="height:10px"></div><button class="btn ghost block" data-act="addType">収入の種類を追加する</button>';
    return h;
  }

  function viewSettings() {
    return '<section class="card"><h2>データの保存について</h2><p style="margin:0">データは<b>この端末のブラウザ内だけ</b>に保存されます。サーバーには送信されません。端末間の自動同期はまだありません。ブラウザのデータを消去すると登録内容も消えるため、定期的に書き出し（バックアップ）をおすすめします。</p>' +
      (memoryOnly ? '<div class="gentle">現在、ブラウザへの保存が使えない状態です。必ず書き出しでバックアップしてください。</div>' : '') +
      '<p class="note">カード番号や金融機関のID・パスワードは入力・保存しません。</p></section>' +
      '<section class="card"><h2>バックアップ</h2><button class="btn blue block" data-act="export">データを書き出す（JSON）</button><div style="height:10px"></div><button class="btn ghost block" data-act="importPick">書き出したデータから復元する</button><input type="file" id="file" accept="application/json,.json" hidden></section>' +
      '<section class="card"><h2>データの初期化</h2><p class="small muted" style="margin-top:0">すべての収入・支出・サブスクを削除します。元に戻せません。</p><button class="btn danger block" data-act="reset">すべてのデータを削除する</button></section>';
  }

  function render() {
    var body = ({ home: viewHome, exp: viewExpenses, subs: viewSubs, inc: viewIncomes, set: viewSettings })[st.tab]();
    var tabs = [['home', 'ホーム'], ['exp', '支出'], ['subs', 'サブスク'], ['inc', '収入'], ['set', '設定']];
    var scroll = window.scrollY;
    $('app').innerHTML = '<div class="shell">' + (st.tab === 'set' ? '<div class="top"><div class="brand"><span>Money Flow</span></div></div>' : header()) + body + '</div>' +
      '<nav class="nav"><div class="in">' + tabs.map(function (t) { return '<button data-act="tab" data-tab="' + t[0] + '" class="' + (st.tab === t[0] ? 'on' : '') + '">' + ICON[t[0]] + t[1] + '</button>'; }).join('') + '</div></nav>';
    window.scrollTo(0, scroll);
  }

  /* ---------- フォーム ---------- */
  function stepper(field, ym, label) {
    return '<div class="field"><div class="lab">' + label + '</div><div class="stepper"><button class="iconbtn" data-act="ymStep" data-f="' + field + '" data-d="-1" aria-label="前の月">‹</button><div class="v">' + M.ymLabel(ym) + '</div><button class="iconbtn" data-act="ymStep" data-f="' + field + '" data-d="1" aria-label="次の月">›</button></div></div>';
  }
  function daySel(d) {
    var o = ''; for (var i = 1; i <= 31; i++) o += '<option value="' + i + '"' + (+d.day === i ? ' selected' : '') + '>' + i + '日</option>';
    return '<div class="field"><label for="f-day">支払い日・入金日</label><select id="f-day" class="input" data-f="day">' + o + '</select></div>';
  }
  function amountField(d, label) {
    return '<div class="field"><div class="lab">' + label + '</div><button type="button" class="amount-btn ' + (d.amount == null ? 'ph' : '') + '" data-act="openPad" data-f="amount">' + (d.amount == null ? 'タップして金額を入力' : yen(d.amount)) + '</button></div>';
  }
  function checkBtn(on, act, text) { return '<button type="button" class="check ' + (on ? 'on' : '') + '" data-act="' + act + '"><span class="box">' + (on ? '✓' : '') + '</span><span>' + text + '</span></button>'; }
  function textField(id, f, label, val, ph) { return '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" class="input" data-f="' + f + '" value="' + esc(val) + '" placeholder="' + esc(ph || '') + '" autocomplete="off" enterkeyhint="done"></div>'; }

  function renderModal() {
    var f = st.form, el = $('modal');
    if (!f) { el.classList.remove('show'); el.innerHTML = ''; lock(); return; }
    var d = f.d, h = '';
    if (f.type === 'expense') {
      var isB = BILL.indexOf(d.category) >= 0;
      h += '<h3>' + (d.id ? '支払いを編集' : '支出を追加') + '</h3>';
      if (!d.id) h += '<div class="field"><div class="lab">どこの引き落とし？</div><div class="chips">' + CATS.filter(function (c) { return c.key !== 'sub'; }).map(function (c) { return '<button type="button" class="chip ' + (d.category === c.key ? 'on' : '') + '" data-act="pickCat" data-v="' + c.key + '">' + c.label + '</button>'; }).join('') + '</div></div>';
      if (isB) h += '<p class="small muted" style="margin:0">' + M.ymLabel(st.ym) + 'の引き落とし額だけ入力します。入力済みの場合は上書きされます。</p>';
      else h += textField('f-name', 'name', '支払い名', d.name, '例：家賃');
      h += amountField(d, isB ? M.ymLabel(st.ym) + 'の引き落とし額' : '金額');
    } else if (f.type === 'income') {
      h += '<h3>' + (d.recId ? '定期収入を編集' : d.id ? '収入を編集' : '収入を追加') + '</h3>';
      h += '<div class="field"><div class="lab">収入の種類</div><div class="chips">' + data.incomeTypes.map(function (t) { return '<button type="button" class="chip ' + (d.type === t ? 'on' : '') + '" data-act="pickType" data-v="' + esc(t) + '">' + esc(t) + '</button>'; }).join('') + '<button type="button" class="chip" data-act="addType">＋ 追加</button></div></div>';
      h += textField('f-name', 'name', '収入名', d.name, '例：○月公演の出演料') + amountField(d, '金額') + daySel(d);
      if (!d.recId) h += stepper('ym', d.ym, '対象年月');
      if (!d.id && !d.recId) h += '<div class="field">' + checkBtn(d.recurring, 'toggleRecurring', '毎月くり返す定期収入にする<br><span class="small muted">翌月以降も「予定額」として自動で入ります（入金確定ではありません）</span>') + '</div>';
      if (d.recId && d.amount !== d.origAmount) h += stepper('applyYm', d.applyYm, '金額の変更を適用する月（過去月は変わりません）');
      if (!d.recId) h += textField('f-note', 'note', 'メモ（任意）', d.note);
    } else if (f.type === 'sub') {
      h += '<h3>' + (d.id ? 'サブスクを編集' : 'サブスクを追加') + '</h3>';
      h += textField('f-name', 'name', 'サービス名', d.name, '例：動画サービス') + amountField(d, '月額料金') + daySel(d);
      h += '<div class="field"><div class="lab">支払い方法</div><div class="chips">' + CATS.filter(function (c) { return c.key !== 'sub'; }).map(function (c) { return '<button type="button" class="chip ' + (d.method === c.key ? 'on' : '') + '" data-act="pickMethod" data-v="' + c.key + '">' + c.label + '</button>'; }).join('') + '</div></div>';
      h += '<div class="field">' + checkBtn(d.included, 'toggleIncluded', 'この金額はカード請求額に含まれている<br><span class="small muted">オンにすると、請求額との二重計上を防ぎます</span>') + '</div>';
      h += stepper('startYm', d.startYm, d.id ? '適用開始月' : '適用開始月（この月から毎月反映）');
      if (d.id && d.amount !== d.origAmount) h += stepper('applyYm', d.applyYm, '金額の変更を適用する月（過去月は変わりません）');
      if (d.id) h += '<div class="small muted">状態：' + (d.stopYm ? M.ymLabel(d.stopYm) + 'から停止中' : '利用中') + '</div>';
    } else if (f.type === 'account') {
      h += '<h3>' + (d.id ? '口座を編集' : '口座を追加') + '</h3>' + textField('f-name', 'name', '口座の名前', d.name, '例：給料の口座・現金') + amountField(d, '今あるお金');
    } else if (f.type === 'override') {
      h += '<h3>' + esc(d.name) + '：' + M.ymLabel(d.ym) + 'の金額</h3><p class="small muted">この月の予定金額だけを修正します。サブスク本体の設定や他の月は変わりません。</p>' + amountField(d, M.ymLabel(d.ym) + 'の金額') + '<div class="small muted">登録されている通常の金額：' + yen(d.planned) + '</div>';
    }
    h += '<div class="err" id="err">' + esc(f.err || '') + '</div><div class="btnrow"><button class="btn ghost" data-act="closeForm">キャンセル</button><button class="btn blue" data-act="saveForm">保存</button></div>';
    if (f.type === 'sub' && d.id) h += '<div class="btnrow">' + (d.stopYm ? '<button class="btn ghost" data-act="resumeSub">この月から再開</button>' : '<button class="btn ghost" data-act="stopSub">この月から停止・解約</button>') + '<button class="btn danger" data-act="deleteForm">削除</button></div>';
    else if (f.type === 'income' && d.recId) h += '<div class="btnrow"><button class="btn ghost" data-act="overrideRec">この月だけ金額を修正</button></div><div class="btnrow"><button class="btn ghost" data-act="stopRec">この月から停止</button><button class="btn danger" data-act="deleteForm">削除</button></div>';
    else if (f.type === 'override') h += '<div class="btnrow"><button class="btn ghost" data-act="resetOverride">予定額に戻す</button>' + '<button class="btn ghost" data-act="openMaster">本体の設定を開く</button></div>';
    else if (d.id) h += '<div class="btnrow"><button class="btn danger" data-act="deleteForm">削除</button></div>';
    var inputFocus = document.activeElement && document.activeElement.id;
    el.innerHTML = '<div class="scrim" data-act="closeForm"></div><div class="sheet" role="dialog" aria-modal="true">' + h + '</div>';
    el.classList.add('show'); lock();
    if (inputFocus && $(inputFocus) && $(inputFocus).tagName !== 'BUTTON') $(inputFocus).focus();
  }

  function openForm(type, d) { st.form = { type: type, d: d, err: '' }; renderModal(); }
  function closeForm() { st.form = null; st.pad = null; renderModal(); renderPad(); }

  function newExpense(cat) { cat = cat && cat !== 'sub' ? cat : 'main'; return { name: '', category: cat, amount: BILL.indexOf(cat) >= 0 ? billAmount(cat, st.ym) : null, day: null, ym: st.ym, note: '', included: false }; }
  function newIncome() { return { name: '', type: data.incomeTypes[0], amount: null, day: 25, ym: st.ym, note: '', recurring: false }; }
  function newSub() { return { name: '', amount: null, day: 1, method: 'main', included: false, startYm: st.ym }; }

  function editItem(kind, id, isIncome) {
    if (kind === 'manual') {
      var arr = isIncome ? data.incomes : data.expenses, it = arr.filter(function (x) { return x.id === id; })[0];
      if (it && !isIncome && BILL.indexOf(it.category) >= 0) return openBill(it.category);
      if (it) openForm(isIncome ? 'income' : 'expense', Object.assign({}, it, { recurring: false }));
    } else if (kind === 'sub') {
      var s = M.subItems(data, st.ym).filter(function (x) { return x.id === id; })[0];
      if (s) openForm('override', { kind: 'sub', id: id, name: s.name, ym: st.ym, amount: s.amount, planned: s.planned });
    } else if (kind === 'rec') {
      editRec(id);
    }
  }
  function editRec(id) {
    var r = data.recurring.filter(function (x) { return x.id === id; })[0]; if (!r) return;
    var a = M.amountAt(r.changes, st.ym); if (a == null) a = M.amountAt(r.changes, r.startYm);
    openForm('income', { recId: id, name: r.name, type: r.type, amount: a, origAmount: a, day: r.day, applyYm: st.ym, note: '' });
  }
  function editSub(id) {
    var s = data.subs.filter(function (x) { return x.id === id; })[0]; if (!s) return;
    var a = M.amountAt(s.changes, st.ym); if (a == null) a = M.amountAt(s.changes, s.startYm);
    openForm('sub', { id: id, name: s.name, amount: a, origAmount: a, day: s.day, method: s.method, included: s.included, startYm: s.startYm, stopYm: s.stopYm, applyYm: st.ym });
  }

  function readDraftInputs() { /* 入力欄は input イベントで d に反映済み */ }

  function saveForm() {
    var f = st.form; if (!f) return; var d = f.d, err = '';
    var name = (d.name || '').trim();
    var needName = f.type !== 'override' && !(f.type === 'expense' && BILL.indexOf(d.category) >= 0);
    if (needName && !name) err = '名前を入力してください';
    else if (d.amount == null) err = '金額を入力してください';
    if (err) { f.err = err; $('err').textContent = err; return; }
    if (f.type === 'expense') {
      if (BILL.indexOf(d.category) >= 0) setBill(d.category, st.ym, d.amount);
      else upsert(data.expenses, { id: d.id || M.uid(), name: name, category: d.category, amount: d.amount, ym: d.ym, day: d.day ? +d.day : null, note: (d.note || '').trim(), included: !!d.included });
    } else if (f.type === 'income') {
      if (d.recId) {
        var r = data.recurring.filter(function (x) { return x.id === d.recId; })[0];
        r.name = name; r.type = d.type; r.day = +d.day;
        if (d.amount !== d.origAmount) { if (d.applyYm <= r.startYm) r.changes = [{ fromYm: r.startYm, amount: d.amount }]; else M.setChange(r, d.applyYm, d.amount); }
      } else if (d.recurring) {
        data.recurring.push({ id: M.uid(), name: name, type: d.type, day: +d.day, startYm: d.ym, stopYm: null, changes: [{ fromYm: d.ym, amount: d.amount }] });
        st.ym = d.ym;
      } else {
        upsert(data.incomes, { id: d.id || M.uid(), name: name, type: d.type, amount: d.amount, ym: d.ym, day: +d.day, note: (d.note || '').trim() });
        st.ym = d.ym;
      }
    } else if (f.type === 'sub') {
      if (d.id) {
        var s = data.subs.filter(function (x) { return x.id === d.id; })[0];
        s.name = name; s.day = +d.day; s.method = d.method; s.included = !!d.included; s.startYm = d.startYm;
        if (d.amount !== d.origAmount) { if (d.applyYm <= s.startYm) s.changes = [{ fromYm: s.startYm, amount: d.amount }]; else M.setChange(s, d.applyYm, d.amount); }
        else if (!s.changes.length) s.changes = [{ fromYm: s.startYm, amount: d.amount }];
      } else {
        data.subs.push({ id: M.uid(), name: name, day: +d.day, method: d.method, included: !!d.included, startYm: d.startYm, stopYm: null, changes: [{ fromYm: d.startYm, amount: d.amount }] });
      }
    } else if (f.type === 'account') {
      upsert(data.accounts, { id: d.id || M.uid(), name: name, amount: d.amount });
    } else if (f.type === 'override') {
      (d.kind === 'sub' ? data.subMonths : data.recMonths)[d.ym + '|' + d.id] = { amount: d.amount };
    }
    save(); st.form = null; renderModal(); render(); toast('保存しました');
  }
  function upsert(arr, o) { var i = arr.findIndex(function (x) { return x.id === o.id; }); if (i >= 0) arr[i] = o; else arr.push(o); }

  async function deleteForm() {
    var f = st.form, d = f.d;
    var label = f.type === 'sub' ? 'サブスク「' + d.name + '」を削除します。過去月も含めてこのサブスクの計上がすべて消えます。' : '「' + d.name + '」を削除します。';
    if (!await confirmDlg(label + 'よろしいですか？', '削除する', true)) return;
    if (f.type === 'expense') data.expenses = data.expenses.filter(function (x) { return x.id !== d.id; });
    else if (f.type === 'income' && d.recId) data.recurring = data.recurring.filter(function (x) { return x.id !== d.recId; });
    else if (f.type === 'account') data.accounts = data.accounts.filter(function (x) { return x.id !== d.id; });
    else if (f.type === 'income') data.incomes = data.incomes.filter(function (x) { return x.id !== d.id; });
    else if (f.type === 'sub') { data.subs = data.subs.filter(function (x) { return x.id !== d.id; }); Object.keys(data.subMonths).forEach(function (k) { if (k.split('|')[1] === d.id) delete data.subMonths[k]; }); }
    save(); st.form = null; renderModal(); render(); toast('削除しました');
  }

  /* ---------- 数字キーパッド ---------- */
  function openPad(title, initial, cb) {
    st.pad = { val: initial == null ? '' : String(initial), title: title, cb: cb }; renderPad();
  }
  function renderPad() {
    var el = $('keypad'), p = st.pad;
    if (!p) { el.classList.remove('show'); el.innerHTML = ''; lock(); return; }
    var keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'C', '0', '⌫'];
    el.innerHTML = '<div class="scrim" data-act="padCancel"></div><div class="kp" role="dialog" aria-label="金額入力"><div class="ttl">' + esc(p.title) + '</div><div class="disp ' + (p.val === '' ? 'ph' : '') + '" id="pdisp">' + padText() + '</div><div class="grid">' +
      keys.map(function (k) { return '<button data-act="pad" data-k="' + k + '" class="' + (k === 'C' || k === '⌫' ? 'fn' : '') + '" aria-label="' + (k === 'C' ? '全消去' : k === '⌫' ? '1文字削除' : k) + '">' + k + '</button>'; }).join('') +
      '</div><div class="bar"><button class="btn ghost" data-act="padCancel">キャンセル</button><button class="btn blue" data-act="padOk">確定</button></div></div>';
    el.classList.add('show'); lock();
  }
  function padText() { var p = st.pad; return p.val === '' ? '金額を入力' : M.fmtNum(+p.val) + '円'; }
  function padKey(k) {
    var p = st.pad; if (!p) return;
    if (k === 'C') p.val = '';
    else if (k === '⌫') p.val = p.val.slice(0, -1);
    else if (/^\d$/.test(k)) { if (p.val === '0') p.val = k; else if (p.val.length < 9) p.val += k; }
    var d = $('pdisp'); d.textContent = padText(); d.classList.toggle('ph', p.val === '');
  }
  function padOk() { var p = st.pad; st.pad = null; renderPad(); p.cb(p.val === '' ? null : parseInt(p.val, 10)); }
  function padCancel() { st.pad = null; renderPad(); }

  /* ---------- 確認ダイアログ ---------- */
  var dlgOpen = false;
  function dialog(html, bind) {
    return new Promise(function (resolve) {
      dlgOpen = true; var el = $('dialog');
      el.innerHTML = '<div class="scrim"></div><div class="sheet" role="alertdialog">' + html + '</div>'; el.classList.add('show'); lock();
      var done = function (v) { dlgOpen = false; el.classList.remove('show'); el.innerHTML = ''; lock(); resolve(v); };
      el.querySelector('[data-no]').onclick = function () { done(null); };
      el.querySelector('.scrim').onclick = function () { done(null); };
      el.querySelector('[data-yes]').onclick = function () { done(bind ? bind(el) : true); };
    });
  }
  function confirmDlg(msg, ok, danger) {
    return dialog('<h3>確認</h3><p>' + esc(msg) + '</p><div class="btnrow"><button class="btn ghost" data-no>やめる</button><button class="btn ' + (danger ? 'danger' : 'blue') + '" data-yes>' + esc(ok || 'OK') + '</button></div>').then(function (v) { return v === true; });
  }
  function promptDlg(title, ph) {
    return dialog('<h3>' + esc(title) + '</h3><input class="input" id="pd" placeholder="' + esc(ph || '') + '" autocomplete="off"><div class="btnrow"><button class="btn ghost" data-no>キャンセル</button><button class="btn blue" data-yes>追加</button></div>', function (el) { return el.querySelector('#pd').value.trim(); });
  }

  /* ---------- イベント ---------- */
  var A = {
    tab: function (t) { st.tab = t.dataset.tab; window.scrollTo(0, 0); render(); },
    prevM: function () { st.ym = M.ymAdd(st.ym, -1); render(); },
    nextM: function () { st.ym = M.ymAdd(st.ym, 1); render(); },
    thisM: function () { st.ym = M.ymNow(); render(); },
    chartN: function (t) { st.n = +t.dataset.n; render(); },
    goCat: function (t) { st.cat = t.dataset.cat; st.tab = 'exp'; window.scrollTo(0, 0); render(); },
    filterCat: function (t) { st.cat = t.dataset.cat; render(); },
    addAccount: function () { openForm('account', { name: data.accounts.length ? '' : '銀行口座', amount: null }); },
    editAccount: function (t) { var a = data.accounts.filter(function (x) { return x.id === t.dataset.id; })[0]; if (a) openForm('account', { id: a.id, name: a.name, amount: a.amount }); },
    openBill: function (t) { openBill(t.dataset.cat); },
    goSubs: function () { st.tab = 'subs'; window.scrollTo(0, 0); render(); },
    addOther: function () { openForm('expense', newExpense('other')); },
    addExpense: function () { openForm('expense', newExpense(st.cat !== 'all' && st.tab === 'exp' ? st.cat : 'main')); },
    addIncome: function () { openForm('income', newIncome()); },
    addSub: function () { openForm('sub', newSub()); },
    editItem: function (t) { editItem(t.dataset.kind, t.dataset.id, t.dataset.income === '1'); },
    editSub: function (t) { editSub(t.dataset.id); },
    closeForm: closeForm,
    saveForm: saveForm,
    deleteForm: deleteForm,
    pickCat: function (t) { var d = st.form.d; d.category = t.dataset.v; d.amount = BILL.indexOf(d.category) >= 0 ? billAmount(d.category, st.ym) : null; renderModal(); },
    pickType: function (t) { st.form.d.type = t.dataset.v; renderModal(); },
    pickMethod: function (t) { st.form.d.method = t.dataset.v; renderModal(); },
    toggleIncluded: function () { st.form.d.included = !st.form.d.included; renderModal(); },
    toggleRecurring: function () { st.form.d.recurring = !st.form.d.recurring; renderModal(); },
    ymStep: function (t) { st.form.d[t.dataset.f] = M.ymAdd(st.form.d[t.dataset.f], +t.dataset.d); renderModal(); },
    openPad: function () {
      var d = st.form.d; openPad(d.name ? d.name + 'の金額' : '金額', d.amount, function (v) { d.amount = v; renderModal(); });
    },
    pad: function (t) { padKey(t.dataset.k); },
    padOk: padOk, padCancel: padCancel,
    stopSub: async function () {
      var d = st.form.d;
      if (!await confirmDlg(M.ymLabel(st.ym) + '以降の計上を停止します。過去月はそのまま残ります。', '停止する')) return;
      data.subs.filter(function (x) { return x.id === d.id; })[0].stopYm = st.ym; save(); st.form = null; renderModal(); render(); toast('停止しました');
    },
    resumeSub: function () {
      var d = st.form.d, s = data.subs.filter(function (x) { return x.id === d.id; })[0];
      var a = M.amountAt(s.changes, M.ymAdd(s.stopYm, -1));
      data.subs.push({ id: M.uid(), name: s.name, day: s.day, method: s.method, included: s.included, startYm: st.ym, stopYm: null, changes: [{ fromYm: st.ym, amount: a }] });
      save(); st.form = null; renderModal(); render(); toast(M.ymLabel(st.ym) + 'から再開しました');
    },
    stopRec: async function () {
      var d = st.form.d;
      if (!await confirmDlg(M.ymLabel(st.ym) + '以降の定期収入を停止します。過去月はそのまま残ります。', '停止する')) return;
      data.recurring.filter(function (x) { return x.id === d.recId; })[0].stopYm = st.ym; save(); st.form = null; renderModal(); render(); toast('停止しました');
    },
    overrideRec: function () {
      var d = st.form.d; var planned = M.amountAt(data.recurring.filter(function (x) { return x.id === d.recId; })[0].changes, st.ym);
      var cur = M.recItems(data, st.ym).filter(function (x) { return x.id === d.recId; })[0];
      openForm('override', { kind: 'rec', id: d.recId, name: d.name, ym: st.ym, amount: cur ? cur.amount : planned, planned: planned });
    },
    resetOverride: function () {
      var d = st.form.d; delete (d.kind === 'sub' ? data.subMonths : data.recMonths)[d.ym + '|' + d.id]; save(); st.form = null; renderModal(); render(); toast('予定額に戻しました');
    },
    openMaster: function () { var d = st.form.d; if (d.kind === 'sub') editSub(d.id); else editRec(d.id); },
    toggleConfirm: function () { if (data.monthStatus[st.ym] === 'confirmed') delete data.monthStatus[st.ym]; else data.monthStatus[st.ym] = 'confirmed'; save(); render(); },
    addType: async function () {
      var v = await promptDlg('収入の種類を追加', '例：お小遣い');
      if (!v) return; if (data.incomeTypes.indexOf(v) < 0) data.incomeTypes.push(v);
      save(); if (st.form && st.form.type === 'income') { st.form.d.type = v; renderModal(); } render(); toast('「' + v + '」を追加しました');
    },
    export: function () {
      var blob = new Blob([M.exportJSON(data)], { type: 'application/json' }), a = document.createElement('a'), n = new Date();
      a.href = URL.createObjectURL(blob); a.download = 'moneyflow-' + n.getFullYear() + String(n.getMonth() + 1).padStart(2, '0') + String(n.getDate()).padStart(2, '0') + '.json';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000); toast('書き出しました');
    },
    importPick: function () { $('file').click(); },
    reset: async function () {
      if (!await confirmDlg('すべての収入・支出・サブスクを削除します。この操作は元に戻せません。', '次へ', true)) return;
      if (!await confirmDlg('本当に削除してよいですか？ 先に「書き出し」でバックアップできます。', 'すべて削除する', true)) return;
      data = M.emptyData(); save(); render(); toast('初期化しました');
    }
  };

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]'); if (!t) return;
    var fn = A[t.dataset.act]; if (fn) fn(t);
  });
  document.addEventListener('input', function (e) {
    var f = e.target.dataset && e.target.dataset.f;
    if (f && st.form && f !== 'amount') st.form.d[f] = e.target.value;
  });
  document.addEventListener('change', function (e) {
    if (e.target.id !== 'file') return;
    var file = e.target.files[0]; if (!file) return;
    var rd = new FileReader();
    rd.onload = async function () {
      var parsed;
      try { parsed = M.parseImport(String(rd.result)); } catch (err) { toast('読み込めませんでした：' + err.message); e.target.value = ''; return; }
      if (await confirmDlg('いまのデータは上書きされます（支出' + parsed.expenses.length + '件・収入' + parsed.incomes.length + '件・サブスク' + parsed.subs.length + '件を復元）。よろしいですか？', '復元する', true)) {
        data = parsed; save(); render(); toast('復元しました');
      }
      e.target.value = '';
    };
    rd.readAsText(file);
  });
  document.addEventListener('keydown', function (e) {
    if (st.pad) {
      if (/^\d$/.test(e.key)) padKey(e.key); else if (e.key === 'Backspace') padKey('⌫'); else if (e.key === 'Delete') padKey('C');
      else if (e.key === 'Enter') padOk(); else if (e.key === 'Escape') padCancel(); else return;
      e.preventDefault();
    } else if (e.key === 'Escape' && st.form && !dlgOpen) closeForm();
  });

  /* ---------- 新しい版の確認（公開サイトが更新されたらボタンで更新） ---------- */
  var APP_VERSION = '4';
  function checkUpdate() {
    if (location.protocol === 'file:') return;
    fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.v && j.v !== APP_VERSION) {
        $('update').innerHTML = '<div class="in"><span>新しい版があります</span><button data-act="doUpdate">更新する</button></div>';
        $('update').classList.add('show');
      }
    }).catch(function () {});
  }
  A.doUpdate = function () {
    var done = function () { location.replace(location.pathname + '?r=' + Date.now()); };
    var jobs = [];
    if (window.caches) jobs.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }));
    if (navigator.serviceWorker) jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); }));
    Promise.all(jobs).then(done, done);
  };
  document.addEventListener('visibilitychange', function () { if (!document.hidden) checkUpdate(); });
  checkUpdate();

  render();
})();
