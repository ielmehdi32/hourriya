/* Hourriya — les calculs.
   Ce fichier ne touche jamais à l'écran : il reçoit des chiffres et rend des chiffres.
   C'est lui que les tests vérifient (dossier tests/).
   Les formules viennent du prototype hourriya.html, avec quatre ajouts :
   - le « chiffre du jour » ;
   - le changement de mois : l'app met les dettes et les grandes dépenses à jour toute seule ;
   - tout est compté à partir du 1er du mois (date de liberté, montants à mettre de côté),
     parce que c'est le jour où les dettes sont à jour ;
   - le mois où l'on commence, le budget de vie compte à partir du premier jour d'utilisation. */
(function (root) {
  "use strict";
  var H = (root.H = root.H || {});

  var DAY = 86400000;      // un jour, en millisecondes
  var MD = 30.4375;        // nombre moyen de jours dans un mois
  var WORK_HOURS = 173.3;  // heures de travail dans un mois (40 heures par semaine)
  var MAX_MONTHS = 600;    // au-delà de 50 ans, on considère qu'il n'y a pas de date

  /* Transforme ce qui a été tapé (« 1 500 », « 12,5 », « ٤٠ ») en nombre. */
  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    var s = String(v == null ? "" : v)
      .replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 0x0660); })
      .replace(/[۰-۹]/g, function (c) { return String(c.charCodeAt(0) - 0x06F0); })
      .replace(/[\s  ⁦-⁩]/g, "")
      .replace(/٫/g, ".")
      .replace(",", ".");
    var x = parseFloat(s);
    return isFinite(x) ? x : 0;
  }

  function monthBounds(now) {
    return {
      s: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
      e: new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime()
    };
  }
  function dayStart(now) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }
  function isoDate(d) {
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  /* Le nom d'un mois, sous la forme « 2026-11 ». */
  function monthKey(d) {
    var m = d.getMonth() + 1;
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m;
  }
  function round2(x) { return Math.round(x * 100) / 100; }
  function copy(o) { var c = {}, k; for (k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) c[k] = o[k]; } return c; }

  /* Le mois où l'on commence à utiliser l'app : part du mois déjà passée avant le premier jour.
     Exemple : début le 20 novembre → 19 jours sur 30 sont passés. Les autres mois : 0.
     state.since : le moment où l'on a commencé avec ses propres chiffres (vide pour l'exemple). */
  function startShare(state, now) {
    var mb = monthBounds(now), t0 = num(state.since);
    if (!(t0 >= mb.s && t0 < mb.e)) return 0;
    return (new Date(t0).getDate() - 1) / Math.round((mb.e - mb.s) / DAY);
  }

  /* ---------- Grandes dépenses de l'année ---------- */

  /* Pour une grande dépense : combien il manque, dans combien de temps, et combien mettre de côté.
     Le montant à mettre de côté est fixé le 1er du mois : on compte les jours du 1er jusqu'à la date.
     S'il reste moins d'un mois, tout ce qui manque est à mettre de côté ce mois-ci. */
  function caisseInfo(c, now) {
    var d = new Date(c.date + "T12:00:00");
    var ms = d.getTime() - now.getTime();
    var need = Math.max(0, num(c.target) - num(c.saved));
    var days = Math.round((dayStart(d) - monthBounds(now).s) / DAY);
    var monthly = (days > 0 && need > 0) ? need / Math.max(days / MD, 1) : 0;
    return {
      d: d, need: need,
      months: ms / DAY / MD, weeks: ms / DAY / 7, past: ms <= 0,   // le temps qu'il reste vraiment (affichage)
      monthly: monthly,                                            // à mettre de côté ce mois-ci
      weekly: monthly * 7 / MD                                     // le même montant, par semaine
    };
  }
  function caisseMonthly(state, now) {
    return state.caisses.reduce(function (s, c) { return s + caisseInfo(c, now).monthly; }, 0);
  }

  /* Dates approximatives (calendrier lunaire) : début de Ramadan et Aïd el-Kébir. */
  var LUNAR = {
    ramadan: ["2026-02-18", "2027-02-08", "2028-01-28", "2029-01-16", "2030-01-05", "2030-12-26",
              "2031-12-15", "2032-12-04", "2033-11-23", "2034-11-12", "2035-11-01", "2036-10-20"],
    aid: ["2026-05-27", "2027-05-17", "2028-05-05", "2029-04-24", "2030-04-13", "2031-04-02",
          "2032-03-22", "2033-03-12", "2034-03-01", "2035-02-18", "2036-02-07"]
  };
  var FIXED = { ete: [7, 15], rentree: [9, 6] }; // [mois, jour]

  function isApprox(kind) { return !!LUNAR[kind]; }

  /* Prochaine date d'une grande dépense après le jour donné (date ou « AAAA-MM-JJ »). */
  function nextOccasion(kind, after) {
    var ref = typeof after === "string" ? after : isoDate(after);
    var list = LUNAR[kind], i;
    if (list) {
      for (i = 0; i < list.length; i++) { if (list[i] > ref) return list[i]; }
      // Au-delà de la liste : une année lunaire dure environ 354 jours.
      var d = new Date(list[list.length - 1] + "T12:00:00");
      while (isoDate(d) <= ref) d = new Date(d.getTime() + 354 * DAY);
      return isoDate(d);
    }
    var md = FIXED[kind] || [1, 1];
    var y = parseInt(ref.slice(0, 4), 10);
    var cand = isoDate(new Date(y, md[0] - 1, md[1]));
    if (cand <= ref) cand = isoDate(new Date(y + 1, md[0] - 1, md[1]));
    return cand;
  }

  /* ---------- Plan ---------- */

  /* Ce qui part chaque mois sur les dettes. */
  function capacity(state, now) {
    var p = state.plan;
    return num(p.revenu) - num(p.fixes) - num(p.vie) - caisseMonthly(state, now);
  }

  function totalDebt(state) {
    return state.debts.reduce(function (a, d) { return a + num(d.balance); }, 0);
  }

  /* ---------- Rythme du mois ---------- */

  /* Où j'en suis ce mois-ci par rapport à un budget dépensé régulièrement.
     S : dépensé · R : renoncé · env : budget du mois après renoncements
     exp : ce qui était prévu à ce jour · P : avance (ou retard) qui part sur la dette.
     Le mois où l'on commence, le budget ne compte qu'à partir du premier jour d'utilisation. */
  function pace(state, now) {
    var mb = monthBounds(now), s = mb.s, e = mb.e, len = e - s, t = now.getTime();
    function f(x) { return Math.min(1, Math.max(0, (x - s) / len)); }
    var B = Math.max(0, num(state.plan.vie));
    var inMonth = state.entries.filter(function (x) { return x.ts >= s && x.ts < e && x.ts <= t; });
    var S = inMonth.filter(function (x) { return x.type === "expense"; })
      .reduce(function (a, x) { return a + x.amount; }, 0);
    var ren = inMonth.filter(function (x) { return x.type === "renounce"; })
      .sort(function (a, b) { return a.ts - b.ts; });
    var f0 = startShare(state, now);
    var env = B * (1 - f0), exp = 0, fPrev = f0, rate = B, R = 0;
    ren.forEach(function (r) {
      var fi = f(r.ts);
      exp += rate * (fi - fPrev); fPrev = fi; env -= r.amount; R += r.amount;
      rate = fi < 1 ? Math.max(0, (env - exp) / (1 - fi)) : 0;
    });
    exp += rate * Math.max(0, f(t) - fPrev);
    return { S: S, R: R, env: env, exp: exp, P: exp - S + R, B: B };
  }

  /* ---------- Lyoum : le chiffre du jour ----------
     Reste du mois = budget de vie − renoncements du mois − dépenses des jours précédents.
     Chiffre du jour = reste du mois ÷ jours restants (aujourd'hui compris) − dépenses d'aujourd'hui.
     Le mois où l'on commence, le budget de vie est ramené aux jours qui restent :
     début le 20 novembre avec 2 500 DH → 2 500 × 11 ÷ 30 pour finir le mois, soit 83 DH par jour. */
  function daily(state, now) {
    var mb = monthBounds(now), t = now.getTime(), d0 = dayStart(now);
    var B = Math.max(0, num(state.plan.vie));
    var Bm = B * (1 - startShare(state, now));   // le budget de ce mois-ci
    var before = 0, today = 0, R = 0;
    state.entries.forEach(function (x) {
      if (x.ts < mb.s || x.ts >= mb.e || x.ts > t) return;
      if (x.type === "renounce") R += x.amount;
      else if (x.ts < d0) before += x.amount;
      else today += x.amount;
    });
    var daysInMonth = Math.round((mb.e - mb.s) / DAY);
    var daysLeft = daysInMonth - now.getDate() + 1;
    var base = (Bm - R - before) / daysLeft;
    var monthLeft = Bm - R - before - today;
    return {
      budget: B, monthBudget: Bm, renounced: R, spentBefore: before, spentToday: today,
      daysLeft: daysLeft,
      base: base,                 // le chiffre du jour ce matin
      left: base - today,         // ce qu'il reste à dépenser aujourd'hui
      monthLeft: monthLeft,       // ce qu'il reste pour finir le mois
      tomorrow: daysLeft > 1 ? monthLeft / (daysLeft - 1) : null
    };
  }

  /* ---------- Dettes ---------- */

  /* Range les dettes dans l'ordre de remboursement.
     « avalanche » : la plus chère (taux le plus haut) d'abord.
     « snowball »  : la plus petite d'abord. */
  function orderDebts(debts, strategy) {
    var arr = debts.map(function (d) {
      return { id: d.id, b: num(d.balance), r: num(d.rate) / 1200, min: num(d.min), done: null };
    }).filter(function (d) { return d.b > 0.005; });
    if (strategy === "snowball") arr.sort(function (a, b) { return a.b - b.b || b.r - a.r; });
    else arr.sort(function (a, b) { return b.r - a.r || a.b - b.b; });
    return arr;
  }

  /* Le coup de pouce (ou le retard) immédiat : P dirhams en moins (ou en plus) sur les dettes,
     en commençant par la première de la liste « ds » (déjà rangée). */
  function boost(ds, P) {
    if (!ds.length) return;
    if (P > 0) {
      var x = P;
      for (var i = 0; i < ds.length && x > 0; i++) {
        var y = Math.min(ds[i].b, x);
        ds[i].b -= y; x -= y;
        if (ds[i].b <= 0.005) { ds[i].b = 0; ds[i].done = 0; }
      }
    } else if (P < 0) {
      ds[0].b += -P;
    }
  }

  /* Un mois de remboursement avec C dirhams (m : numéro du mois ; acc.interest : total des intérêts). */
  function oneMonth(ds, C, m, acc) {
    // 1. Les intérêts du mois s'ajoutent à chaque dette.
    ds.forEach(function (d) { if (d.b > 0) { var it = d.b * d.r; d.b += it; acc.interest += it; } });
    var pay = C, used = 0;
    var take = function (d, amt) {
      var z = Math.min(amt, d.b, pay);
      if (z <= 0) return;
      d.b -= z; pay -= z; used += z;
      if (d.b <= 0.005) { d.b = 0; if (d.done === null) d.done = m - 1 + used / C; }
    };
    // 2. D'abord la mensualité minimale de chaque dette.
    ds.forEach(function (d) { if (d.b > 0 && d.min > 0) take(d, d.min); });
    // 3. Puis tout le reste sur la première dette de la liste, et ainsi de suite.
    for (var k = 0; k < ds.length && pay > 0; k++) { if (ds[k].b > 0) take(ds[k], Infinity); }
  }

  /* Simule le remboursement mois par mois.
     C : argent mis chaque mois sur les dettes · P : coup de pouce (ou retard) immédiat.
     Rend le nombre de mois jusqu'à la liberté et le total des intérêts payés. */
  function simulate(debts, C, P, strategy) {
    var ds = orderDebts(debts, strategy), acc = { interest: 0 }, m;
    function allDone() { return ds.every(function (d) { return d.b <= 0.005; }); }
    function result() {
      var mx = 0;
      ds.forEach(function (d) { if ((d.done || 0) > mx) mx = d.done || 0; });
      return {
        ok: true, months: mx, interest: acc.interest,
        perDebt: ds.map(function (d) { return { id: d.id, months: d.done || 0 }; })
      };
    }
    boost(ds, P);
    if (allDone()) return result();
    if (!(C > 0)) return { ok: false };
    for (m = 1; m <= MAX_MONTHS; m++) {
      oneMonth(ds, C, m, acc);
      if (allDone()) return result();
    }
    return { ok: false };
  }

  /* La projection pour l'état actuel, avec un éventuel achat (deltaP négatif) ou renoncement (positif). */
  function project(state, now, deltaP, strategy) {
    return simulate(state.debts, capacity(state, now), pace(state, now).P + (deltaP || 0),
      strategy || state.strategy);
  }

  /* Effet d'une dépense ou d'un renoncement sur la date de liberté, en jours.
     Positif : la date recule. Négatif : elle se rapproche. null : pas de date calculable. */
  function impactDays(state, now, type, amount) {
    var a = project(state, now, 0);
    var b = project(state, now, type === "expense" ? -amount : amount);
    if (!a.ok || !b.ok) return null;
    return (b.months - a.months) * MD;
  }

  /* La date atteinte après « months » mois de remboursement.
     On compte à partir du 1er du mois en cours, parce que c'est le jour où les dettes sont à jour :
     le paiement de ce mois-ci arrive à la fin du mois, pas dans un mois à partir d'aujourd'hui.
     Les mois entiers suivent le calendrier ; le reste est une part du dernier mois.
     La date n'est jamais dans le passé. */
  function freedomDate(now, months) {
    var y = now.getFullYear(), mo = now.getMonth();
    var k = Math.floor(months), frac = months - k;
    var a = new Date(y, mo + k, 1).getTime(), b = new Date(y, mo + k + 1, 1).getTime();
    return new Date(Math.max(a + frac * (b - a), now.getTime()));
  }

  /* Les deux méthodes côte à côte. */
  function compare(state, now) {
    var C = capacity(state, now), P = pace(state, now).P;
    return {
      avalanche: simulate(state.debts, C, P, "avalanche"),
      snowball: simulate(state.debts, C, P, "snowball")
    };
  }

  /* ---------- Changement de mois ---------- */

  /* Fait les comptes d'un mois terminé (« when » : n'importe quel moment de ce mois).
     Ne modifie rien : rend les nouveaux restes dus et les nouvelles mises de côté.
     1. L'avance ou le retard du mois sur le budget de vie part sur les dettes.
        Un mois sans aucune dépense notée compte comme un mois normal : ni avance, ni retard.
     2. Un mois d'intérêts s'ajoute à chaque dette.
     3. Le paiement prévu par le plan est retiré : mensualités minimales, puis la dette prioritaire.
     4. L'argent prévu pour les grandes dépenses s'ajoute à ce qui est déjà de côté.
     Ce sont les règles de la projection, appliquées une fois : la date de liberté ne bouge donc pas
     quand on passe du dernier jour d'un mois au premier jour du suivant. */
  function closeMonth(state, when) {
    var mb = monthBounds(when), end = new Date(mb.e - 1);
    var logged = state.entries.some(function (x) { return x.ts >= mb.s && x.ts < mb.e; });
    var P = logged ? pace(state, end).P : 0;
    var cap = capacity(state, end);
    var before = totalDebt(state);

    var ds = orderDebts(state.debts, state.strategy), acc = { interest: 0 };
    boost(ds, P);
    oneMonth(ds, Math.max(0, cap), 1, acc);
    var left = {};
    ds.forEach(function (d) { left[d.id] = round2(d.b); });
    var debts = state.debts.map(function (d) {
      var c = copy(d);
      if (Object.prototype.hasOwnProperty.call(left, d.id)) c.balance = left[d.id];
      return c;
    });

    var setAside = 0;
    var caisses = state.caisses.map(function (c) {
      var k = copy(c), add = caisseInfo(c, end).monthly;
      if (add > 0) { k.saved = round2(num(c.saved) + add); setAside += add; }
      return k;
    });

    return {
      debts: debts, caisses: caisses,
      before: before, after: debts.reduce(function (a, d) { return a + num(d.balance); }, 0),
      interest: acc.interest, extra: P, planned: cap, setAside: setAside, logged: logged
    };
  }

  /* Rattrape tous les mois terminés depuis la dernière mise à jour.
     state.closed : « AAAA-MM », le mois pour lequel les dettes sont à jour.
     Rend null s'il n'y a rien à faire, sinon les nouveaux chiffres et un résumé à montrer. */
  function catchUp(state, now) {
    var m = /^(\d{4})-(\d{2})$/.exec(state.closed || "");
    if (!m) return null;
    var y = parseInt(m[1], 10), mo = parseInt(m[2], 10) - 1;
    var n = Math.min(MAX_MONTHS, (now.getFullYear() - y) * 12 + (now.getMonth() - mo));
    if (n <= 0) return null;
    var work = {
      plan: state.plan, strategy: state.strategy, since: state.since, entries: state.entries,
      debts: state.debts, caisses: state.caisses
    };
    var sum = { months: n, first: state.closed, last: state.closed, before: totalDebt(state),
                after: 0, interest: 0, paid: 0, setAside: 0, unlogged: 0 };
    for (var i = 0; i < n; i++) {
      var when = new Date(y, mo + i, 15);
      var r = closeMonth(work, when);
      work.debts = r.debts; work.caisses = r.caisses;
      sum.interest += r.interest; sum.setAside += r.setAside;
      if (!r.logged) sum.unlogged++;
      sum.last = monthKey(when);
    }
    sum.after = totalDebt(work);
    sum.paid = sum.before + sum.interest - sum.after;   // ancien total + intérêts − remboursé = nouveau total
    return { debts: work.debts, caisses: work.caisses, closed: monthKey(now), summary: sum };
  }

  /* Heures de travail que représente un prix. null si le revenu n'est pas renseigné. */
  function workHours(revenu, amount) {
    var r = num(revenu);
    if (!(r > 0)) return null;
    return amount / (r / WORK_HOURS);
  }

  H.calc = {
    DAY: DAY, MD: MD, WORK_HOURS: WORK_HOURS,
    num: num, isoDate: isoDate, monthKey: monthKey, dayStart: dayStart, monthBounds: monthBounds,
    startShare: startShare, closeMonth: closeMonth, catchUp: catchUp,
    caisseInfo: caisseInfo, caisseMonthly: caisseMonthly,
    nextOccasion: nextOccasion, isApprox: isApprox,
    capacity: capacity, totalDebt: totalDebt,
    pace: pace, daily: daily,
    orderDebts: orderDebts, simulate: simulate, project: project,
    impactDays: impactDays, freedomDate: freedomDate, compare: compare,
    workHours: workHours
  };
})(typeof window !== "undefined" ? window : this);
