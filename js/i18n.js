/* Hourriya — les langues.
   Tous les textes de l'app sont dans le dossier lang/ (un fichier par langue).
   Ce fichier charge la bonne langue et met en forme les nombres, les montants et les dates. */
(function (root) {
  "use strict";
  var H = (root.H = root.H || {});

  var LANGS = ["ar", "ary", "fr", "en"];
  var cache = {}, dict = {}, meta = {}, lang = "fr";
  var nf0, nf1, nf2, plural;

  /* Langue proposée au premier lancement, d'après la langue du téléphone. */
  function detect() {
    var list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || "fr"];
    for (var i = 0; i < list.length; i++) {
      var c = String(list[i]).toLowerCase().split("-")[0];
      if (c === "ar" || c === "fr" || c === "en") return c;
    }
    return "fr";
  }

  function fetchLang(code) {
    if (cache[code]) return Promise.resolve(cache[code]);
    return fetch("lang/" + code + ".json").then(function (r) {
      if (!r.ok) throw new Error("lang " + code);
      return r.json();
    }).then(function (d) { cache[code] = d; return d; });
  }

  function load(code) {
    if (LANGS.indexOf(code) < 0) code = "fr";
    return fetchLang(code).then(function (d) {
      dict = d; lang = code; meta = d._meta || {};
      var numbers = meta.numbers || "fr-FR";
      nf0 = new Intl.NumberFormat(numbers, { maximumFractionDigits: 0 });
      nf1 = new Intl.NumberFormat(numbers, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      nf2 = new Intl.NumberFormat(numbers, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      try { plural = new Intl.PluralRules(meta.plural || code); } catch (e) { plural = null; }
      var el = document.documentElement;
      el.setAttribute("lang", meta.htmlLang || code);
      el.setAttribute("dir", meta.dir === "rtl" ? "rtl" : "ltr");
      return code;
    });
  }

  function has(key) { return Object.prototype.hasOwnProperty.call(dict, key); }

  /* t("hero.rest", {amount: "…"}) → le texte dans la langue choisie, avec les valeurs à leur place. */
  function t(key, vars) {
    var s = has(key) ? dict[key] : key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return s;
  }

  /* Comme t(), mais choisit la bonne forme selon le nombre (1 jour, 3 jours, 3 أيام…). */
  function tn(key, n, vars) {
    var cat = "other";
    if (plural) { try { cat = plural.select(Math.abs(n)); } catch (e) { cat = "other"; } }
    return t(has(key + "." + cat) ? key + "." + cat : key + ".other", vars);
  }

  /* Garde un nombre et son signe dans le bon sens, même au milieu d'un texte arabe. */
  function ltr(s) { return "⁦" + s + "⁩"; }

  function n0(x) { return nf0.format(Math.round(x)); }
  function n1(x) { return nf1.format(x); }

  /* Montant arrondi au dirham : « 1 500 DH ». */
  function money(x) {
    var r = Math.round(x);
    return t("fmt.money", { n: ltr((r < 0 ? "−" : "") + nf0.format(Math.abs(r))) });
  }
  /* Montant exact, avec les centimes s'il y en a : « 12,50 DH ». */
  function moneyExact(x) {
    if (Math.abs(x - Math.round(x)) < 0.005) return money(x);
    return t("fmt.money", { n: ltr((x < 0 ? "−" : "") + nf2.format(Math.abs(x))) });
  }
  /* Le signe qui sépare les décimales dans cette langue (« , » ou « . »). */
  function decimalSign() { return nf1.format(1.5).replace(/[0-9]/g, "") || ","; }
  function percent(x) { return t("fmt.percent", { n: ltr(nf0.format(Math.round(x))) }); }
  function rate(x) {
    var s = Math.round(x * 10) % 10 === 0 ? nf0.format(x) : nf1.format(x);
    return t("fmt.percent", { n: ltr(s) });
  }

  function dateLocale() { return meta.dates || "fr-FR"; }
  function fmtDate(d) {
    var s = d.toLocaleDateString(dateLocale(), { day: "numeric", month: "long", year: "numeric" });
    if (d.getDate() === 1 && has("date.first")) s = s.replace(/^1 /, dict["date.first"] + " ");
    return s;
  }
  function monthYear(d) { return d.toLocaleDateString(dateLocale(), { month: "long", year: "numeric" }); }
  function monthLong(d) { return d.toLocaleDateString(dateLocale(), { month: "long" }); }
  function monthShort(d) { return d.toLocaleDateString(dateLocale(), { month: "short" }).replace(".", ""); }
  function dayShort(d) { return d.toLocaleDateString(dateLocale(), { weekday: "short", day: "numeric", month: "short" }); }
  function time(d) { return ltr(d.toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" })); }

  /* Remplit les textes posés dans la page :
     data-i18n (texte), data-i18n-ph (texte d'aide d'un champ), data-i18n-aria (nom lu par VoiceOver). */
  function applyStatic(scope) {
    var each = function (sel, fn) { Array.prototype.forEach.call((scope || document).querySelectorAll(sel), fn); };
    each("[data-i18n]", function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
    each("[data-i18n-ph]", function (el) { el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph"))); });
    each("[data-i18n-aria]", function (el) { el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria"))); });
  }

  H.i18n = {
    LANGS: LANGS, detect: detect, load: load, has: has, t: t, tn: tn, ltr: ltr,
    n0: n0, n1: n1, money: money, moneyExact: moneyExact, decimalSign: decimalSign, percent: percent, rate: rate,
    fmtDate: fmtDate, monthYear: monthYear, monthLong: monthLong, monthShort: monthShort,
    dayShort: dayShort, time: time, applyStatic: applyStatic,
    lang: function () { return lang; },
    isRtl: function () { return meta.dir === "rtl"; }
  };
})(window);
