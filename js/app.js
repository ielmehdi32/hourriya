/* Hourriya — les écrans et les boutons.
   Ce fichier affiche ; les calculs sont dans calc.js, les textes dans lang/, l'enregistrement dans db.js. */
(function () {
  "use strict";
  var H = window.H, C = H.calc, I = H.i18n, DB = H.db, PARSE = H.parse;
  var t = I.t, tn = I.tn, money = I.money, num = C.num;
  var VERSION = "1.1";
  var state = null;
  var reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var ICON_X = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function byId(list, id) { return list.filter(function (x) { return x.id === id; })[0]; }

  /* ---------- Mise en forme ---------- */
  /* Un nombre entier et son unité : count(3, "day") → « 3 jours », « 3 أيام »… */
  function count(n, unit) { return tn("count." + unit, n, { n: I.ltr(I.n0(n)) }); }
  /* Un nombre à virgule (et son signe si demandé) : « 3,2 jours », « +3,2 jours ». */
  function dec(x, unit, signed) {
    var a = Math.abs(x), sign = signed ? (x > 0 ? "+" : "−") : "";
    if (a < 9.95) { var r = Math.round(a * 10) / 10; return tn("dec." + unit, r, { n: I.ltr(sign + I.n1(r)) }); }
    var k = Math.round(a);
    return signed ? tn("dec." + unit, k, { n: I.ltr(sign + I.n0(k)) }) : count(k, unit);
  }
  function daysPhrase(x) { return Math.abs(x) < 0.05 ? t("days.tiny") : dec(x, "day", false); }      // « 3,2 jours »
  function signedDaysLong(x) { return Math.abs(x) < 0.05 ? t("days.tiny") : dec(x, "day", true); }   // « +3,2 jours »
  function signedDays(x) {                                                                            // « +3,2 j »
    var a = Math.abs(x);
    if (a < 0.05) return t("days.zero");
    return t("days.short", { n: I.ltr((x > 0 ? "+" : "−") + (a < 9.95 ? I.n1(a) : I.n0(a))) });
  }
  function hoursPhrase(h) {
    if (h < 1) return count(Math.max(1, Math.round(h * 60)), "minute");
    return dec(h, "hour", false);
  }
  function inputVal(v) { return v ? String(v).replace(".", I.decimalSign()) : ""; }

  function debtName(d) { return d.name != null ? d.name : t(d.nameKey || "plan.debt.new"); }
  function entryLabel(x) { return x.label != null ? x.label : t(x.labelKey); }
  function catName(id) { return t("cat." + id); }
  function occName(c) { return t("occ." + c.kind); }
  function occNote(c) { return t("occ." + c.kind + ".note"); }

  /* ---------- Enregistrement ---------- */
  var saveWarned = false;
  function saveFailed() { if (!saveWarned) { saveWarned = true; toast(t("toast.saveError")); } }
  function save() {
    if (!DB.available()) return;
    for (var i = 0; i < arguments.length; i++) DB.setMeta(arguments[i], state[arguments[i]]).catch(saveFailed);
  }
  function saveEverything() { if (DB.available()) DB.replaceAll(state).catch(saveFailed); }

  /* ---------- Lyoum : le chiffre du jour ---------- */
  function renderToday(now) {
    var d = C.daily(state, now);
    var card = $("#todayCard"), el = $("#todayNum"), sub = $("#todaySub"), meta = $("#todayMeta");
    if (!(d.budget > 0)) {
      card.className = "today empty";
      el.innerHTML = '<span class="n">—</span>';
      sub.textContent = t("today.noBudget"); meta.textContent = "";
      return;
    }
    var v = Math.round(d.left), over = v < 0;
    card.className = "today" + (over ? " over" : "");
    el.innerHTML = '<span class="n">' + esc(I.ltr((over ? "−" : "") + I.n0(Math.abs(v)))) + "</span><small>" + esc(t("currency")) + "</small>";
    var extra = "";
    if (over) {
      if (d.monthLeft < -0.5) extra = t("today.over.month", { amount: money(-d.monthLeft) });
      else if (d.tomorrow != null) extra = t("today.over.tomorrow", { amount: money(d.tomorrow) });
    }
    sub.innerHTML = esc(t(over ? "today.sub.over" : d.spentToday > 0 ? "today.sub.left" : "today.sub.fresh")) +
      (extra ? '<span class="today-extra">' + esc(extra) + "</span>" : "");
    meta.textContent = t("today.meta", {
      spent: money(d.spentToday), left: money(Math.max(0, d.monthLeft)), days: count(d.daysLeft, "day")
    });
  }

  /* ---------- La date de liberté ---------- */
  var lastHero = null;
  function todayEntries(now) {
    var a = C.dayStart(now);
    return state.entries.filter(function (x) { return x.ts >= a && x.ts < a + C.DAY; });
  }
  function renderHero(now) {
    var el = $("#heroDate"), sub = $("#heroSub"), s;
    var total = C.totalDebt(state), cap = C.capacity(state, now), hasDebts = state.debts.length > 0;
    var r = C.project(state, now);
    if (!hasDebts) { s = t("hero.empty"); sub.textContent = t("hero.empty.sub"); }
    else if (!r.ok) { s = t("hero.none"); sub.textContent = t("hero.none.sub"); }
    else if (r.months <= 0.001) { s = t("hero.free"); sub.textContent = t("hero.free.sub"); }
    else {
      var free = C.freedomDate(now, r.months);
      s = I.fmtDate(free);
      sub.textContent = t("hero.in", { days: count(Math.max(1, Math.ceil((free.getTime() - now.getTime()) / C.DAY)), "day") });
    }
    if (lastHero !== null && lastHero !== s && !reduceMotion) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
    lastHero = s; el.textContent = s;

    var te = todayEntries(now), pill = $("#todayPill");
    if (!te.length) { pill.className = "hpill"; pill.textContent = t("hero.todayNone"); }
    else {
      var sum = te.reduce(function (a, x) { return a + (x.impact || 0); }, 0);
      pill.className = "hpill " + (sum > 0.049 ? "loss" : sum < -0.049 ? "gain" : "");
      pill.textContent = t("hero.today", { impact: signedDays(sum) });
    }
    $("#heroRest").textContent = hasDebts ? t("hero.rest", { amount: money(total) }) : "";
    var init = Math.max(num(state.initialTotal), total, 1);
    var pct = Math.round((1 - total / init) * 100);
    $("#hbarWrap").hidden = !hasDebts;
    $("#hbar").style.width = pct + "%";
    $("#hbarWrap").setAttribute("aria-label", t("hero.paid", { pct: I.percent(pct) }));
    $("#heroFoot").textContent = !hasDebts ? "" :
      t(cap > 0 ? "hero.foot.pay" : "hero.foot.none", { pct: I.percent(pct), amount: money(cap) });
  }

  /* ---------- Rythme du mois ---------- */
  function renderPace(now) {
    var card = $("#paceCard"), pc = C.pace(state, now);
    if (!(pc.B > 0)) { card.hidden = true; return; }
    card.hidden = false;
    var diff = pc.exp - pc.S, env = Math.max(pc.env, 1);
    var fill = Math.min(100, pc.S / env * 100), mark = Math.min(100, pc.exp / env * 100), ahead = diff >= 0;
    var txt = ahead ? t("pace.txt.ahead", { amount: money(diff) }) : t("pace.txt.behind", { amount: money(-diff) });
    if (pc.R > 0) txt += " " + t("pace.txt.renounced", { amount: money(pc.R) });
    card.innerHTML =
      '<div class="card-head"><h2 class="h2">' + esc(t("pace.title", { month: I.monthLong(now) })) + '</h2><span class="status ' + (ahead ? "gain" : "loss") + '">' + esc(t(ahead ? "pace.ahead" : "pace.behind")) + "</span></div>" +
      '<div class="pbar" role="img" aria-label="' + esc(t("pace.aria", { spent: money(pc.S), expected: money(pc.exp) })) + '"><i class="' + (ahead ? "" : "over") + '" style="width:' + fill + '%"></i><b style="inset-inline-start:' + mark + '%"></b></div>' +
      '<div class="legend"><div><span>' + esc(t("pace.spent")) + "</span><strong>" + esc(money(pc.S)) + "</strong></div><div><span>" + esc(t("pace.expected")) + "</span><strong>" + esc(money(pc.exp)) + "</strong></div><div><span>" + esc(t("pace.budget")) + "</span><strong>" + esc(money(pc.env)) + "</strong></div></div>" +
      '<p class="pace-txt">' + esc(txt) + "</p>";
  }

  /* ---------- Activité récente ---------- */
  function dayLabel(ts, now) {
    var d = new Date(ts), diff = Math.round((C.dayStart(now) - C.dayStart(d)) / C.DAY);
    if (diff === 0) return t("when.today", { time: I.time(d) });
    if (diff === 1) return t("when.yesterday", { time: I.time(d) });
    return I.dayShort(d);
  }
  function renderFeed(now) {
    var list = state.entries.slice().sort(function (a, b) { return b.ts - a.ts; }).slice(0, 30);
    if (!list.length) { $("#feed").innerHTML = '<li class="empty">' + esc(t("feed.empty")) + "</li>"; return; }
    $("#feed").innerHTML = list.map(function (x) {
      var ren = x.type === "renounce", imp = x.impact, label = entryLabel(x);
      var cls = imp == null ? "" : (imp > 0.049 ? "loss-t" : imp < -0.049 ? "gain-t" : "");
      return '<li><div class="f-main"><div class="f-label">' + (ren ? '<span class="tag-ren">' + esc(t("feed.renounced")) + "</span>" : "") + esc(label) + '</div><div class="f-meta">' + esc(catName(x.cat)) + " · " + esc(dayLabel(x.ts, now)) + "</div></div>" +
        '<div class="f-right"><div class="f-amt">' + esc(ren ? t("feed.kept", { amount: I.moneyExact(x.amount) }) : I.moneyExact(-x.amount)) + '</div><div class="f-imp ' + cls + '">' + (imp == null ? "" : esc(signedDays(imp))) + "</div></div>" +
        '<button class="f-del" type="button" data-del="' + esc(x.id) + '" aria-label="' + esc(t("feed.remove", { label: label })) + '">' + ICON_X + "</button></li>";
    }).join("");
  }

  /* ---------- Bandeau « données d'exemple » ---------- */
  function renderSample() {
    $("#samplePill").hidden = !state.sample;
    var card = $("#sampleCard");
    card.hidden = !state.sample;
    if (!state.sample || card.querySelector("[data-ask-yes]")) return; // on ne touche pas à une confirmation en cours
    card.innerHTML = '<div class="sample-row"><p>' + esc(t("sample.text")) + "</p>" +
      '<button type="button" class="mini-btn accent" data-ask="wipe">' + esc(t("sample.start")) + "</button></div>";
  }

  /* ---------- Changement de mois ---------- */
  /* À la première ouverture d'un nouveau mois, l'app met à jour les dettes et les grandes dépenses
     (les règles sont dans calc.js, « closeMonth »). Rend true si quelque chose a changé. */
  function rollover() {
    var r = C.catchUp(state, new Date());
    if (!r) return false;
    state.debts = r.debts; state.caisses = r.caisses; state.closed = r.closed; state.notice = r.summary;
    // Tout est écrit d'un seul coup, pour ne jamais compter un mois deux fois.
    if (DB.available()) DB.setMetas(["debts", "caisses", "closed", "notice"], state).catch(saveFailed);
    return true;
  }
  function tick() {
    if (rollover()) { lastHero = null; buildPlan(); }
    renderAll();
  }
  function monthOf(key) { var p = String(key).split("-"); return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, 15); }
  function signedMoney(x) {
    var r = Math.round(x);
    return t("fmt.money", { n: I.ltr((r > 0 ? "+" : r < 0 ? "−" : "") + I.n0(Math.abs(r))) });
  }
  /* Le message affiché sur Lyoum après un changement de mois, jusqu'à ce qu'on le ferme. */
  function renderNotice() {
    var card = $("#noticeCard"), n = state.notice;
    card.hidden = !n;
    if (!n) { card.innerHTML = ""; return; }
    // Montants arrondis au dirham, et « remboursé » déduit des trois autres pour que l'addition tombe juste.
    var before = Math.round(num(n.before)), interest = Math.round(num(n.interest)), after = Math.round(num(n.after));
    var paid = before + interest - after;
    var intro = n.months > 1
      ? t("close.intro.many", { months: count(n.months, "month"), from: I.monthLong(monthOf(n.first)), to: I.monthLong(monthOf(n.last)) })
      : t("close.intro.one", { month: I.monthLong(monthOf(n.last)) });
    var row = function (label, value, cls) {
      return "<div" + (cls ? ' class="' + cls + '"' : "") + "><span>" + esc(label) + "</span><span>" + esc(value) + "</span></div>";
    };
    var notes = [];
    if (Math.round(num(n.setAside)) > 0) notes.push(t("close.seasons", { amount: money(n.setAside) }));
    if (n.unlogged > 0) notes.push(t("close.unlogged"));
    notes.push(t("close.check"));
    card.innerHTML =
      '<div class="card-head"><h2 class="h2">' + esc(t("close.title")) + "</h2></div>" +
      '<p class="card-text">' + esc(intro) + "</p>" +
      '<div class="calc">' + row(t("close.before"), money(before)) + row(t("close.interest"), signedMoney(interest)) +
        (paid >= 0 ? row(t("close.paid"), money(-paid)) : row(t("close.over"), signedMoney(-paid))) +
        row(t("close.after"), money(after), "res") + "</div>" +
      notes.map(function (x) { return '<p class="note">' + esc(x) + "</p>"; }).join("") +
      '<div class="row2"><button type="button" class="btn btn-ghost" data-go="plan">' + esc(t("close.plan")) + "</button>" +
        '<button type="button" class="btn btn-primary" data-notice-ok>' + esc(t("close.ok")) + "</button></div>";
  }

  /* ---------- Dettes ---------- */
  function renderDebts(now) {
    var cap = C.capacity(state, now), total = C.totalDebt(state);
    var both = C.compare(state, now);
    var altKey = state.strategy === "avalanche" ? "snowball" : "avalanche";
    var cur = both[state.strategy], alt = both[altKey];
    var rows = "", cmp = "";
    if (!state.debts.length) rows = '<p class="muted">' + esc(t("debts.none")) + "</p>";
    else if (!cur.ok) rows = '<p class="muted">' + esc(t("debts.noCapacity")) + "</p>";
    else {
      var max = Math.max(cur.months, 0.01);
      rows = '<ol class="tl">' + cur.perDebt.slice().sort(function (a, b) { return a.months - b.months; }).map(function (p, i) {
        var d = byId(state.debts, p.id); if (!d) return "";
        var w = Math.max(3, p.months / max * 100);
        var when = p.months <= 0.001 ? t("debts.paid") : t("debts.paidIn", { month: I.monthYear(C.freedomDate(now, p.months)) });
        var meta = t(num(d.min) > 0 ? "debts.meta" : "debts.meta.noMin",
          { balance: money(num(d.balance)), rate: I.rate(num(d.rate)), min: money(num(d.min)) });
        return '<li class="tl-row"><span class="tl-n">' + esc(I.n0(i + 1)) + '</span><div><div class="tl-name">' + esc(debtName(d)) + '</div><div class="tl-meta">' + esc(meta) + '</div><div class="tl-bar"><i style="width:' + w + '%"></i></div><div class="tl-when">' + esc(when) + "</div></div></li>";
      }).join("") + "</ol>";

      var line = function (key) {
        var res = both[key], mine = key === state.strategy;
        return '<tr class="' + (mine ? "cur" : "") + '"><td>' + esc(t("debts." + key)) + (mine ? '<br><span class="mine">' + esc(t("compare.chosen")) + "</span>" : "") + "</td><td>" +
          esc(res.ok ? I.fmtDate(C.freedomDate(now, res.months)) : "—") + "</td><td>" + esc(res.ok ? money(res.interest) : "—") + "</td></tr>";
      };
      var note = "";
      if (alt.ok) {
        var dd = (alt.months - cur.months) * C.MD, di = alt.interest - cur.interest, parts = [];
        if (Math.abs(dd) >= 1) parts.push(t(dd > 0 ? "compare.later" : "compare.sooner", { days: count(Math.round(Math.abs(dd)), "day") }));
        if (Math.abs(di) >= 20) parts.push(t(di > 0 ? "compare.moreInterest" : "compare.lessInterest", { amount: money(Math.abs(di)) }));
        note = parts.length
          ? t("compare.with", { method: t("debts." + altKey), parts: parts.length === 2 ? t("compare.and", { a: parts[0], b: parts[1] }) : parts[0] })
          : t("compare.same");
      }
      cmp = '<div class="card"><div class="card-head"><h2 class="h2">' + esc(t("compare.title")) + "</h2></div>" +
        '<table class="cmp"><thead><tr><th>' + esc(t("compare.col.method")) + "</th><th>" + esc(t("compare.col.date")) + "</th><th>" + esc(t("compare.col.interest")) + "</th></tr></thead><tbody>" +
        line("avalanche") + line("snowball") + "</tbody></table>" + (note ? '<p class="cmp-note">' + esc(note) + "</p>" : "") + "</div>";
    }
    $("#debtsView").innerHTML =
      '<header><h1 class="h1">' + esc(t("debts.title")) + '</h1><p class="lede">' + esc(t("debts.lede")) + "</p></header>" +
      '<div class="card"><div class="stat-row"><div><div class="k">' + esc(t("debts.total")) + '</div><div class="v">' + esc(money(total)) + '</div></div><div><div class="k">' + esc(t("debts.monthly")) + '</div><div class="v">' + esc(money(Math.max(0, cap))) + "</div></div></div></div>" +
      '<div class="seg" role="group" aria-label="' + esc(t("debts.methodAria")) + '"><button type="button" data-strategy="avalanche" aria-pressed="' + (state.strategy === "avalanche") + '">' + esc(t("debts.avalanche")) + '</button><button type="button" data-strategy="snowball" aria-pressed="' + (state.strategy === "snowball") + '">' + esc(t("debts.snowball")) + "</button></div>" +
      '<p class="method-note">' + esc(t("debts.note." + state.strategy)) + "</p>" +
      '<div class="card"><div class="card-head"><h2 class="h2">' + esc(t("debts.order")) + "</h2></div>" + rows + "</div>" +
      cmp +
      '<button type="button" class="btn btn-ghost" data-go="plan">' + esc(t("debts.edit")) + "</button>";
  }

  /* ---------- Grandes dépenses de l'année ---------- */
  function renderSeasons(now) {
    var items = state.caisses.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var monthly = C.caisseMonthly(state, now);
    var list = items.map(function (c) {
      var i = C.caisseInfo(c, now), d = i.d, target = num(c.target), saved = num(c.saved);
      var pct = Math.min(100, Math.round(saved / Math.max(1, target) * 100));
      var right = !(target > 0) ? t("seasons.undefined") : i.past ? "" : i.need > 0 ? t("seasons.weekly", { amount: money(i.weekly) }) : t("seasons.ready");
      var when = i.past ? t("seasons.past") : t("seasons.in", { weeks: count(Math.max(1, Math.round(i.weeks)), "week") });
      return '<li class="season"><div class="leaf" aria-hidden="true"><span class="leaf-m">' + esc(I.monthShort(d)) + '</span><span class="leaf-d">' + (c.approx ? "<i>≈</i>" : "") + esc(I.n0(d.getDate())) + "</span></div>" +
        '<div><div class="s-top"><span class="s-name">' + esc(occName(c)) + '</span><span class="s-when">' + esc(when) + "</span></div>" +
        '<div class="s-note">' + esc(occNote(c)) + " · " + esc(t(c.approx ? "seasons.around" : "seasons.on", { date: I.fmtDate(d) })) + "</div>" +
        '<div class="s-bar" role="img" aria-label="' + esc(t("seasons.savedAria", { pct: I.percent(pct) })) + '"><i style="width:' + pct + '%"></i></div>' +
        '<div class="s-nums"><span>' + esc(t("seasons.saved", { saved: money(saved), target: money(target) })) + '</span><span class="s-weekly">' + esc(right) + "</span></div>" +
        '<div class="s-actions"><button type="button" class="mini-btn" data-edit-season="' + esc(c.id) + '">' + esc(t("seasons.edit")) + "</button>" +
        (i.past ? '<button type="button" class="mini-btn accent" data-next-season="' + esc(c.id) + '">' + esc(t("seasons.next")) + "</button>" : "") + "</div></div></li>";
    }).join("");
    $("#seasonsView").innerHTML =
      '<header><h1 class="h1">' + esc(t("seasons.title")) + '</h1><p class="lede">' + esc(t("seasons.lede")) + "</p></header>" +
      '<div class="card"><ul class="seasons">' + list + "</ul></div>" +
      '<div class="card total-card"><div class="big-num">' + esc(money(monthly)) + "<small> " + esc(t("seasons.totalUnit")) + "</small></div><p>" + esc(t("seasons.total")) + "</p></div>" +
      '<p class="note">' + esc(t("seasons.note")) + "</p>";
  }

  /* ---------- Plan ---------- */
  function moneyField(id, label, value, hint, attrs, unit) {
    return '<div class="field"><label for="' + id + '">' + esc(label) + "</label>" + (hint ? '<div class="hint">' + esc(hint) + "</div>" : "") +
      '<div class="input-dh"><input id="' + id + '" type="text" inputmode="decimal" autocomplete="off" placeholder="0" ' + (attrs || "") + ' value="' + esc(inputVal(value)) + '"><span>' + esc(unit || t("currency")) + "</span></div></div>";
  }
  function buildPlan() {
    var how = "";
    for (var i = 1; i <= 7; i++) how += "<li>" + esc(t("plan.how." + i)) + "</li>";
    $("#planForm").innerHTML =
      '<div class="card"><div class="card-head"><h2 class="h2">' + esc(t("plan.monthly")) + '</h2></div><div class="fields">' +
        moneyField("plan-revenu", t("plan.revenu"), state.plan.revenu, t("plan.revenu.hint"), 'data-plan="revenu"') +
        moneyField("plan-fixes", t("plan.fixes"), state.plan.fixes, t("plan.fixes.hint"), 'data-plan="fixes"') +
        moneyField("plan-vie", t("plan.vie"), state.plan.vie, t("plan.vie.hint"), 'data-plan="vie"') +
      '</div><div class="calc" id="planCalc"></div></div>' +
      '<div class="card"><div class="card-head"><h2 class="h2">' + esc(t("plan.debts")) + '</h2></div><div class="debt-edit" id="debtEdit"></div>' +
        '<button type="button" class="btn btn-ghost" id="addDebt">' + esc(t("plan.debt.add")) + "</button>" +
        '<div class="fields mt">' + moneyField("plan-initial", t("plan.initial"), state.initialTotal, t("plan.initial.hint"), "data-initial") + "</div></div>" +
      '<div class="card"><h2 class="h2">' + esc(t("plan.how")) + '</h2><ul class="explain-list">' + how + "</ul></div>";
    buildDebtRows();
  }
  function debtField(d, k, label, unit) {
    return moneyField("debt-" + d.id + "-" + k, label, d[k], null, 'data-debt="' + esc(d.id) + '" data-field="' + k + '"', unit);
  }
  function buildDebtRows() {
    $("#debtEdit").innerHTML = state.debts.length ? state.debts.map(function (d) {
      return '<div class="drow"><div class="drow-top"><input class="dname" id="debt-' + esc(d.id) + '-name" type="text" autocomplete="off" data-debt="' + esc(d.id) + '" data-field="name" value="' + esc(debtName(d)) + '" aria-label="' + esc(t("plan.debt.name")) + '"><button type="button" class="link-btn" data-remove-debt="' + esc(d.id) + '">' + esc(t("plan.debt.remove")) + "</button></div>" +
        '<div class="drow-grid">' + debtField(d, "balance", t("plan.debt.balance")) + debtField(d, "rate", t("plan.debt.rate"), "%") + debtField(d, "min", t("plan.debt.min")) + "</div></div>";
    }).join("") : '<p class="muted">' + esc(t("plan.debt.none")) + "</p>";
  }
  function renderPlanCalc(now) {
    var el = $("#planCalc"); if (!el) return;
    var p = state.plan, cm = C.caisseMonthly(state, now), cap = C.capacity(state, now);
    var row = function (label, value) { return "<div><span>" + esc(label) + "</span><span>" + esc(value) + "</span></div>"; };
    el.innerHTML = row(t("plan.revenu"), money(num(p.revenu))) + row(t("plan.fixes"), money(-num(p.fixes))) +
      row(t("plan.vie"), money(-num(p.vie))) + row(t("plan.calc.seasons"), money(-cm)) +
      '<div class="res' + (cap > 0 ? "" : " neg") + '"><span>' + esc(t("plan.calc.debts")) + "</span><span>" + esc(t("plan.calc.perMonth", { amount: money(cap) })) + "</span></div>";
  }

  /* ---------- Réglages ---------- */
  function buildSettings() {
    var theme = state.settings.theme || "auto";
    $("#settingsForm").innerHTML =
      '<div class="card"><div class="card-head"><h2 class="h2">' + esc(t("settings.lang")) + '</h2></div><div class="seg langs" role="group" aria-label="' + esc(t("settings.lang")) + '">' +
        I.LANGS.map(function (l) { return '<button type="button" data-lang="' + l + '" aria-pressed="' + (l === I.lang()) + '">' + esc(t("lang." + l)) + "</button>"; }).join("") + "</div></div>" +
      '<div class="card"><div class="card-head"><h2 class="h2">' + esc(t("settings.theme")) + '</h2></div><div class="seg three" role="group" aria-label="' + esc(t("settings.theme")) + '">' +
        ["auto", "light", "dark"].map(function (k) { return '<button type="button" data-theme-set="' + k + '" aria-pressed="' + (k === theme) + '">' + esc(t("theme." + k)) + "</button>"; }).join("") + "</div></div>" +
      '<div class="card"><h2 class="h2">' + esc(t("settings.data")) + '</h2><p class="card-text">' + esc(t("settings.data.text")) + "</p>" +
        '<div class="stack" data-zone><button type="button" class="btn btn-ghost" data-ask="wipe">' + esc(t("settings.wipe")) + "</button></div>" +
        '<div class="stack" data-zone><button type="button" class="btn btn-ghost" data-ask="sample">' + esc(t("settings.sample")) + "</button></div></div>" +
      '<p class="note">' + esc(t("settings.about", { v: VERSION })) + "</p>";
  }
  function applyTheme() {
    var th = state.settings.theme, r = document.documentElement;
    if (th === "light" || th === "dark") r.setAttribute("data-theme", th); else r.removeAttribute("data-theme");
    var dark = th === "dark" || (th !== "light" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    $("#themeColor").setAttribute("content", dark ? "#0E1026" : "#F2F3F9");
  }
  function setLang(code) {
    I.load(code).then(function () {
      state.settings.lang = code; save("settings");
      applyTexts();
    }).catch(function () { toast(t("toast.langError")); });
  }
  /* Réécrit tous les textes de l'app (au démarrage et à chaque changement de langue). */
  function applyTexts() {
    I.applyStatic(document);
    $("#sampleCard").innerHTML = "";
    $("#sayExamples").innerHTML = [1, 2, 3].map(function (n) {
      var ex = t("say.ex" + n);
      return '<button type="button" data-example="' + esc(ex) + '">' + esc(ex) + "</button>";
    }).join("");
    renderChips(); setMode(sheetMode);
    buildPlan(); buildSettings(); renderAll(); updateSayPreview();
  }
  function wipeAll() {
    state = H.seed.empty(new Date(), state.settings);
    saveEverything(); lastHero = null; $("#sampleCard").innerHTML = "";
    buildPlan(); buildSettings(); renderAll(); updateSayPreview();
    go("plan"); toast(t("toast.wiped"));
  }
  function restoreSample() {
    var s = H.seed.sample(new Date()); s.settings = state.settings; state = s;
    saveEverything(); lastHero = null; $("#sampleCard").innerHTML = "";
    buildPlan(); buildSettings(); renderAll(); updateSayPreview();
    go("lyoum"); toast(t("toast.sampled"));
  }

  function renderAll() {
    var now = new Date();
    renderSample(); renderNotice(); renderToday(now); renderHero(now); renderPace(now); renderFeed(now);
    renderDebts(now); renderSeasons(now); renderPlanCalc(now);
  }

  /* ---------- Fiches qui montent du bas ---------- */
  var openEl = null, lastFocus = null;
  function showSheet(sel) {
    lastFocus = document.activeElement; openEl = $(sel);
    $("#scrim").hidden = false; openEl.hidden = false; openEl.scrollTop = 0;
    document.body.style.overflow = "hidden"; fitSheets();
  }
  function closeSheet() {
    if (!openEl) return;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    $("#scrim").hidden = true; openEl.hidden = true; openEl = null;
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
  }
  /* Quand le clavier de l'iPhone s'ouvre, la fiche se pose juste au-dessus de lui. */
  function fitSheets() {
    var vv = window.visualViewport, r = document.documentElement;
    if (!vv) return;
    var kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    r.style.setProperty("--kb", kb + "px");
    r.style.setProperty("--vvh", Math.round(vv.height) + "px");
    r.classList.toggle("kb-open", kb > 80);
  }

  /* ---------- Fiche de saisie ---------- */
  var sheetMode = "expense", sheetCat = "autre", manualCat = false;
  function renderChips() {
    $("#chips").innerHTML = PARSE.CATS.map(function (id) {
      return '<button type="button" class="chip" data-cat="' + id + '" aria-pressed="' + (id === sheetCat) + '">' + esc(catName(id)) + "</button>";
    }).join("");
    var on = $('#chips [aria-pressed="true"]');
    if (on && on.scrollIntoView && openEl) { try { on.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e) {} }
  }
  function setMode(m) {
    sheetMode = m;
    $$("[data-mode]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-mode") === m)); });
    $("#sheetTitle").textContent = t("sheet.title." + m);
    $("#labelInput").setAttribute("placeholder", t("sheet.ph." + m));
    var a = $("#actions");
    if (m === "expense") { a.className = "actions"; a.innerHTML = '<button type="button" class="btn btn-primary" data-act="expense">' + esc(t("sheet.act.expense")) + "</button>"; }
    else if (m === "renounce") { a.className = "actions"; a.innerHTML = '<button type="button" class="btn btn-gain" data-act="renounce">' + esc(t("sheet.act.renounce")) + "</button>"; }
    else { a.className = "actions two"; a.innerHTML = '<button type="button" class="btn btn-ghost" data-act="expense">' + esc(t("sheet.act.buy")) + '</button><button type="button" class="btn btn-gain" data-act="renounce">' + esc(t("sheet.act.skip")) + "</button>"; }
    updatePreview();
  }
  function openSheet(mode) {
    sheetCat = "autre"; manualCat = false;
    $("#amountInput").value = ""; $("#labelInput").value = "";
    renderChips(); setMode(mode); showSheet("#sheet");
    // Tout de suite, dans le même geste : c'est ce qui fait apparaître le clavier sur iPhone.
    try { $("#amountInput").focus({ preventScroll: true }); } catch (e) {}
  }
  function updatePreview(msg) {
    var pv = $("#preview"), a = num($("#amountInput").value);
    var set = function (cls, big, bigCls, text) {
      pv.className = "preview" + (cls ? " " + cls : "");
      pv.innerHTML = (big ? '<div class="big' + (bigCls ? " " + bigCls : "") + '">' + esc(big) + "</div>" : "") + "<p>" + esc(text) + "</p>";
    };
    if (!(a > 0)) { set("", t("preview.empty.big"), "dim", msg || t("preview.empty")); return; }
    var now = new Date(), base = C.project(state, now), after = C.project(state, now, sheetMode === "renounce" ? a : -a);
    var extra = "";
    if (sheetMode === "check") {
      var h = C.workHours(state.plan.revenu, a);
      if (h != null) extra += " " + t("preview.check.hours", { hours: hoursPhrase(h) });
    }
    if (sheetMode === "expense") {
      var d = C.daily(state, now);
      if (d.budget > 0) {
        var left = d.left - a;
        extra += " " + (left >= 0 ? t("preview.today.left", { amount: money(left) }) : t("preview.today.over", { amount: money(-left) }));
      }
    }
    if (!state.debts.length || (base.ok && after.ok && base.months <= 0.001 && after.months <= 0.001)) {
      set("", null, "", (t("preview.noDebt") + extra).trim()); return;
    }
    if (!base.ok || !after.ok) { set("", null, "", (t("preview.noPlan") + extra).trim()); return; }
    var days = (after.months - base.months) * C.MD, date = I.fmtDate(C.freedomDate(now, after.months));
    if (sheetMode === "expense") set("loss", signedDaysLong(days), "loss-t", t("preview.expense", { date: date }) + extra);
    else if (sheetMode === "renounce") set("gain", signedDaysLong(days), "gain-t", t("preview.renounce", { date: date }));
    else set("", t("preview.check.big", { days: daysPhrase(days) }), "", t("preview.check", { date: date }) + extra);
  }

  var toastTimer = null;
  function toast(text) {
    var el = $("#toast"); el.textContent = text; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.hidden = true; }, 3400);
  }
  function addEntry(type, amount, label, cat) {
    var now = new Date(), imp = C.impactDays(state, now, type, amount);
    var entry = { id: uid(), type: type, amount: Math.round(amount * 100) / 100, label: label, labelKey: null, cat: cat, ts: now.getTime(), impact: imp };
    state.entries.push(entry);
    if (DB.available()) DB.putEntry(entry).catch(saveFailed);
    renderAll();
    if (imp == null || Math.abs(imp) < 0.05) toast(t(type === "expense" ? "toast.expense" : "toast.renounce"));
    else toast(t(type === "expense" ? "toast.expense.days" : "toast.renounce.days", { days: daysPhrase(imp) }));
  }
  function submitSheet(type) {
    var a = num($("#amountInput").value);
    if (!(a > 0)) { updatePreview(t("preview.needAmount")); try { $("#amountInput").focus(); } catch (e) {} return; }
    var label = $("#labelInput").value.trim() || (type === "renounce" ? t("entry.avoided") : catName(sheetCat));
    label = label.charAt(0).toUpperCase() + label.slice(1);
    closeSheet(); addEntry(type, a, label, sheetCat);
  }

  /* ---------- Texte libre ---------- */
  function updateSayPreview() {
    var el = $("#sayPreview"), v = $("#sayInput").value;
    el.className = "say-preview";
    if (!v.trim()) { el.textContent = t("say.hint"); return; }
    var p = PARSE.parse(v);
    if (!p || !(p.amount > 0)) { el.textContent = t("say.missing"); return; }
    var imp = C.impactDays(state, new Date(), p.type, p.amount);
    el.innerHTML = esc(t("say.type." + p.type)) + " · " + esc(catName(p.cat)) + " · " + esc(I.moneyExact(p.amount)) +
      (imp == null ? "" : ' · <strong class="' + (imp > 0 ? "loss-t" : "gain-t") + '">' + esc(signedDays(imp)) + "</strong>");
  }
  function submitSay() {
    var p = PARSE.parse($("#sayInput").value);
    if (!p || !(p.amount > 0)) { var el = $("#sayPreview"); el.className = "say-preview loss-t"; el.textContent = t("say.missing"); return; }
    var label = p.label || (p.type === "renounce" ? t("entry.avoided") : catName(p.cat));
    addEntry(p.type, p.amount, label, p.cat);
    $("#sayInput").value = ""; updateSayPreview();
  }

  /* ---------- Fiche d'une grande dépense ---------- */
  var editId = null;
  function openEdit(id) {
    var c = byId(state.caisses, id); if (!c) return;
    editId = id;
    $("#editTitle").textContent = t("seasons.edit.title", { name: occName(c) });
    $("#editBody").innerHTML =
      moneyField("edit-target", t("seasons.f.target"), c.target) +
      moneyField("edit-saved", t("seasons.f.saved"), c.saved) +
      '<div class="field"><label for="edit-date">' + esc(t(c.approx ? "seasons.f.date.approx" : "seasons.f.date")) + '</label><input class="date-input" id="edit-date" type="date" value="' + esc(c.date) + '"></div>' +
      '<button type="button" class="btn btn-primary" id="editSave">' + esc(t("common.save")) + "</button>";
    showSheet("#editSheet");
  }
  function saveEdit() {
    var c = byId(state.caisses, editId); if (!c) { closeSheet(); return; }
    c.target = Math.max(0, num($("#edit-target").value));
    c.saved = Math.max(0, num($("#edit-saved").value));
    var d = $("#edit-date").value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) c.date = d;
    save("caisses"); closeSheet(); renderAll(); toast(t("toast.saved"));
  }
  function nextSeason(id) {
    var c = byId(state.caisses, id); if (!c) return;
    c.date = C.nextOccasion(c.kind, new Date()); c.saved = 0;
    save("caisses"); renderAll(); toast(t("toast.saved"));
  }

  /* ---------- Changer d'écran ---------- */
  var VIEWS = ["lyoum", "dettes", "saisons", "plan", "reglages"];
  function route() {
    var v = (location.hash || "").slice(1);
    if (VIEWS.indexOf(v) < 0) v = "lyoum";
    $$("section[data-view]").forEach(function (s) { s.hidden = s.getAttribute("data-view") !== v; });
    $$("[data-go]").forEach(function (b) {
      if (b.classList.contains("tab") || b.classList.contains("icon-btn")) b.setAttribute("aria-current", b.getAttribute("data-go") === v ? "page" : "false");
    });
  }
  function go(v) {
    if (location.hash !== "#" + v) location.hash = v; else route();
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", function () { route(); window.scrollTo(0, 0); });

  /* ---------- Les gestes ---------- */
  var armTimer = null;
  document.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button") : null;
    if (!b) return;
    var v;
    if ((v = b.getAttribute("data-go"))) { go(v); return; }
    if ((v = b.getAttribute("data-open"))) { openSheet(v); return; }
    if ((v = b.getAttribute("data-mode"))) { setMode(v); return; }
    if ((v = b.getAttribute("data-cat"))) { sheetCat = v; manualCat = true; renderChips(); return; }
    if ((v = b.getAttribute("data-act"))) { submitSheet(v); return; }
    if (b.hasAttribute("data-close-sheet")) { closeSheet(); return; }
    if (b.hasAttribute("data-notice-ok")) { state.notice = null; save("notice"); renderNotice(); return; }
    if ((v = b.getAttribute("data-del"))) {
      state.entries = state.entries.filter(function (x) { return x.id !== v; });
      if (DB.available()) DB.deleteEntry(v).catch(saveFailed);
      renderAll(); updateSayPreview(); toast(t("feed.removed")); return;
    }
    if ((v = b.getAttribute("data-strategy"))) { state.strategy = v; save("strategy"); renderAll(); return; }
    if ((v = b.getAttribute("data-example"))) { $("#sayInput").value = v; updateSayPreview(); $("#sayInput").focus(); return; }
    if ((v = b.getAttribute("data-edit-season"))) { openEdit(v); return; }
    if ((v = b.getAttribute("data-next-season"))) { nextSeason(v); return; }
    if (b.id === "editSave") { saveEdit(); return; }
    if ((v = b.getAttribute("data-remove-debt"))) {
      // Deux touches pour supprimer : la première demande confirmation.
      if (!b.hasAttribute("data-armed")) {
        b.setAttribute("data-armed", ""); b.textContent = t("plan.debt.confirm");
        clearTimeout(armTimer);
        armTimer = setTimeout(function () { if (b.isConnected) { b.removeAttribute("data-armed"); b.textContent = t("plan.debt.remove"); } }, 3500);
        return;
      }
      clearTimeout(armTimer);
      state.debts = state.debts.filter(function (d) { return d.id !== v; });
      save("debts"); buildDebtRows(); renderAll(); return;
    }
    if (b.id === "addDebt") {
      var id = "d" + uid();
      state.debts.push({ id: id, name: null, nameKey: "plan.debt.new", balance: 0, rate: 0, min: 0 });
      save("debts"); buildDebtRows(); renderAll();
      var inp = document.getElementById("debt-" + id + "-name");
      if (inp) { inp.focus(); try { inp.select(); } catch (err) {} }
      return;
    }
    if ((v = b.getAttribute("data-lang"))) { setLang(v); return; }
    if ((v = b.getAttribute("data-theme-set"))) { state.settings.theme = v; save("settings"); applyTheme(); buildSettings(); return; }
    if ((v = b.getAttribute("data-ask"))) {
      // Effacer ou remettre l'exemple : on demande toujours avant.
      var zone = b.closest("[data-zone]"); if (!zone) return;
      var prefix = v === "wipe" ? "settings.wipe" : "settings.sample";
      zone.innerHTML = "<p>" + esc(t(prefix + ".confirm")) + '</p><div class="row2"><button type="button" class="btn btn-ghost" data-ask-cancel>' + esc(t("common.cancel")) + '</button><button type="button" class="btn btn-danger" data-ask-yes="' + v + '">' + esc(t(prefix + ".yes")) + "</button></div>";
      return;
    }
    if (b.hasAttribute("data-ask-cancel")) { $("#sampleCard").innerHTML = ""; buildSettings(); renderSample(); return; }
    if ((v = b.getAttribute("data-ask-yes"))) { if (v === "wipe") wipeAll(); else restoreSample(); return; }
  });
  $("#scrim").addEventListener("click", closeSheet);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && openEl) { closeSheet(); return; }
    if (e.key === "Enter" && e.target && e.target.id === "labelInput") {
      e.preventDefault();
      if (sheetMode === "check") e.target.blur(); else submitSheet(sheetMode);
    }
  });
  document.addEventListener("input", function (e) {
    var el = e.target, k;
    if ((k = el.getAttribute("data-plan"))) { state.plan[k] = Math.max(0, num(el.value)); save("plan"); renderAll(); return; }
    if ((k = el.getAttribute("data-debt"))) {
      var f = el.getAttribute("data-field"), d = byId(state.debts, k); if (!d) return;
      if (f === "name") d.name = el.value; else d[f] = Math.max(0, num(el.value));
      save("debts"); renderAll(); return;
    }
    if (el.hasAttribute("data-initial")) { state.initialTotal = Math.max(0, num(el.value)); save("initialTotal"); renderAll(); return; }
    if (el.id === "amountInput") { updatePreview(); return; }
    if (el.id === "labelInput") { if (!manualCat) { sheetCat = PARSE.detectCat(el.value) || "autre"; renderChips(); } return; }
    if (el.id === "sayInput") { updateSayPreview(); return; }
  });
  /* Quand on a fini de taper un reste dû : si le total dépasse le « total au départ », on le relève. */
  document.addEventListener("change", function (e) {
    var el = e.target;
    if (el.getAttribute("data-debt") && el.getAttribute("data-field") === "balance") {
      var total = C.totalDebt(state);
      if (total > num(state.initialTotal)) {
        state.initialTotal = total; save("initialTotal");
        var inp = $("#plan-initial"); if (inp) inp.value = inputVal(total);
        renderAll();
      }
    }
  });
  $("#sayForm").addEventListener("submit", function (e) { e.preventDefault(); submitSay(); });

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", fitSheets);
    window.visualViewport.addEventListener("scroll", fitSheets);
  }
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var onScheme = function () { if (state) applyTheme(); };
    if (mq.addEventListener) mq.addEventListener("change", onScheme); else if (mq.addListener) mq.addListener(onScheme);
  }

  /* ---------- Démarrage ---------- */
  function normalize(s) {
    var base = H.seed.empty(new Date());
    s.plan = s.plan || base.plan;
    s.strategy = s.strategy === "snowball" ? "snowball" : "avalanche";
    s.initialTotal = num(s.initialTotal);
    s.sample = !!s.sample;
    s.settings = s.settings || base.settings;
    s.debts = Array.isArray(s.debts) ? s.debts : [];
    s.caisses = Array.isArray(s.caisses) && s.caisses.length ? s.caisses : base.caisses;
    s.entries = Array.isArray(s.entries) ? s.entries : [];
    s.since = s.since ? num(s.since) : null;
    // Des données enregistrées avant la version 1.1 n'ont pas de repère : on part du mois en cours.
    s.closed = /^\d{4}-\d{2}$/.test(s.closed || "") ? s.closed : C.monthKey(new Date());
    s.notice = (s.notice && typeof s.notice === "object") ? s.notice : null;
    return s;
  }
  function start() {
    var stored = false;
    return DB.open().then(function (ok) {
      stored = ok;
      return ok ? DB.loadAll() : null;
    }).then(function (s) {
      var fresh = !s, marked = !!(s && s.closed);
      state = normalize(s || H.seed.sample(new Date()));
      if (!state.settings.lang) state.settings.lang = I.detect();
      if (fresh) saveEverything(); else if (!marked) save("since", "closed", "notice");
      return I.load(state.settings.lang).catch(function () { return I.load("fr"); });
    }).then(function () {
      rollover();
      applyTheme(); applyTexts(); route();
      document.documentElement.classList.remove("loading");
      if (!stored) toast(t("toast.noStorage"));
      setInterval(tick, 60000);
      document.addEventListener("visibilitychange", function () { if (!document.hidden) tick(); });
      if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist().catch(function () {}); } catch (e) {} }
      if ("serviceWorker" in navigator) { navigator.serviceWorker.register("sw.js").catch(function () {}); }
    }).catch(function () {
      document.documentElement.classList.remove("loading");
    });
  }
  start();
})();
