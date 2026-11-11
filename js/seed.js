/* Hourriya — les données de départ.
   « sample » : l'exemple montré au premier lancement.
   « empty »  : une app vide, pour commencer avec ses vrais chiffres.
   Les noms ne sont pas écrits ici : ce sont des clés (« seed.d1 ») traduites dans le dossier lang/. */
(function (root) {
  "use strict";
  var H = (root.H = root.H || {});

  var KINDS = ["ramadan", "aid", "ete", "rentree"];

  function occasions(now, amounts) {
    var C = H.calc;
    return KINDS.map(function (kind, i) {
      return {
        id: "c" + (i + 1), kind: kind,
        date: C.nextOccasion(kind, now),
        target: amounts ? amounts[i][0] : 0,
        saved: amounts ? amounts[i][1] : 0,
        approx: C.isApprox(kind)
      };
    });
  }

  function sample(now) {
    var C = H.calc, t = now.getTime(), DAY = C.DAY, HOUR = 3600000, MIN = 60000;
    var state = {
      plan: { revenu: 10000, fixes: 3800, vie: 2400 },
      strategy: "avalanche",
      initialTotal: 48000,
      sample: true,
      since: null,                // l'exemple fait comme si le mois avait été suivi depuis le 1er
      closed: C.monthKey(now),    // le mois pour lequel les dettes sont à jour
      notice: null,               // le résumé du dernier changement de mois, tant qu'il n'a pas été lu
      settings: { lang: null, theme: "auto" },
      debts: [
        { id: "d1", name: null, nameKey: "seed.d1", balance: 26000, rate: 11.5, min: 950 },
        { id: "d2", name: null, nameKey: "seed.d2", balance: 7500, rate: 14, min: 300 },
        { id: "d3", name: null, nameKey: "seed.d3", balance: 5000, rate: 0, min: 0 }
      ],
      caisses: occasions(now, [[1500, 400], [3500, 600], [3000, 0], [2000, 0]]),
      entries: []
    };
    var seeds = [
      ["expense", 280, "seed.e1", "courses", t - 5 * DAY],
      ["expense", 35, "seed.e2", "transport", t - 4 * DAY + 2 * HOUR],
      ["expense", 30, "seed.e3", "cafe", t - 3 * DAY + 5 * HOUR],
      ["expense", 50, "seed.e4", "telephone", t - 2 * DAY + 3 * HOUR],
      ["renounce", 450, "seed.e5", "habits", t - DAY + 4 * HOUR],
      ["expense", 60, "seed.e6", "courses", t - 35 * MIN],
      ["renounce", 90, "seed.e7", "sorties", t - 10 * MIN]
    ];
    seeds.forEach(function (s, i) {
      var imp = C.impactDays(state, now, s[0], s[1]);
      state.entries.push({
        id: "s" + (i + 1), type: s[0], amount: s[1], label: null, labelKey: s[2],
        cat: s[3], ts: s[4], impact: imp
      });
    });
    return state;
  }

  function empty(now, settings) {
    return {
      plan: { revenu: 0, fixes: 0, vie: 0 },
      strategy: "avalanche",
      initialTotal: 0,
      sample: false,
      since: now.getTime(),             // le jour où l'on commence avec ses propres chiffres
      closed: H.calc.monthKey(now),
      notice: null,
      settings: settings || { lang: null, theme: "auto" },
      debts: [],
      caisses: occasions(now, null),
      entries: []
    };
  }

  H.seed = { sample: sample, empty: empty, KINDS: KINDS };
})(typeof window !== "undefined" ? window : this);
