/* Hourriya — comprendre une phrase tapée librement.
   « khlesst 40 f taxi », « خلصت 40 ف طاكسي », « j'ai pas acheté les baskets 450 »…
   Rend : le montant, le type (dépense ou renoncement), la catégorie et le libellé.
   Les mots ci-dessous servent à reconnaître, ils ne sont jamais affichés :
   les textes affichés sont dans le dossier lang/. */
(function (root) {
  "use strict";
  var H = (root.H = root.H || {});

  var AR = "ء-ي"; // lettres arabes

  function westernDigits(s) {
    return String(s)
      .replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 0x0660); })
      .replace(/[۰-۹]/g, function (c) { return String(c.charCodeAt(0) - 0x06F0); });
  }

  /* Met un texte sous une forme simple à comparer : minuscules, sans accents,
     sans voyelles arabes, avec les variantes de lettres arabes ramenées à une seule. */
  function norm(s) {
    return westernDigits(s).toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ًͯ-ٰٟـ]/g, "")
      .replace(/ة/g, "ه")   // ة → ه
      .replace(/ى/g, "ي");  // ى → ي
  }

  /* Catégories et mots qui les déclenchent (français, darija en lettres latines et arabes, anglais).
     L'ordre compte : la première catégorie qui reconnaît un mot l'emporte. */
  var CATS = [
    { id: "courses", words: ["hanout", "7anout", "courses", "khodra", "lkhodra", "souk", "marche", "lhem", "l7em", "l7am",
        "khobz", "hlib", "epicerie", "supermarche", "groceries", "grocery", "supermarket",
        "حانوت", "خضرة", "سوق", "السوق", "لحم", "اللحم", "خبز", "الخبز", "حليب", "تقدية", "مارشي", "بقال"] },
    { id: "transport", words: ["taxi", "tram", "tramway", "bus", "essence", "gasoil", "lisans", "train", "parking",
        "tomobil", "autoroute", "carburant", "fuel", "petrol",
        "طاكسي", "طاكسيات", "طرام", "طرامواي", "طوبيس", "ليسانس", "مازوط", "تران", "قطار", "باركينغ", "طوموبيل", "أوطوروت"] },
    { id: "cafe", words: ["cafe", "qahwa", "9ahwa", "kahwa", "atay", "nousnous", "coffee", "tea",
        "قهوة", "أتاي", "لاتاي", "شاي"], accented: ["thé"] },
    { id: "sorties", words: ["resto", "restaurant", "snack", "tacos", "pizza", "sandwich", "cinema", "sortie", "glace",
        "burger", "lunch", "dinner", "movie",
        "ريسطو", "مطعم", "سناك", "طاكوس", "بيتزا", "سندويتش", "سينما", "بركر"] },
    { id: "telephone", words: ["recharge", "rcharge", "internet", "forfait", "telephone", "tilifoun", "phone", "topup",
        "روشارج", "ريشارج", "تعبئة", "أنترنيت", "تيليفون"] },
    { id: "maison", words: ["gaz", "butane", "bouta", "menage", "quincaillerie", "lavage",
        "بوطا", "البوطا", "بوطة", "غاز"] },
    { id: "sante", words: ["pharmacie", "dwa", "tbib", "docteur", "medecin", "analyse", "pharmacy", "doctor", "medicine",
        "فرماسيان", "صيدلية", "دوا", "الدوا", "طبيب", "تحاليل"] },
    { id: "habits", words: ["hwayj", "vetements", "sbbat", "sbat", "baskets", "chaussures", "pull", "jean", "clothes",
        "shoes", "sneakers",
        "حوايج", "صباط", "سبرديلة", "سروال", "ملابس", "حذاء"] },
    { id: "famille", words: ["cadeau", "hdiya", "3ers", "mariage", "fete", "aqiqa", "sbou3", "gift", "wedding",
        "هدية", "كادو", "عرس", "العرس", "عقيقة", "سبوع"] },
    { id: "autre", words: [] }
  ];
  CATS.forEach(function (c) { c.nw = c.words.map(norm); });

  var TOKEN_SPLIT = new RegExp("[^a-z0-9" + AR + "]+");
  var RAW_SPLIT = new RegExp("[^a-z0-9à-ÿ" + AR + "]+");

  /* Devine la catégorie d'un texte. Rend null si aucun mot n'est reconnu. */
  function detectCat(text) {
    var tokens = norm(text).split(TOKEN_SPLIT).filter(Boolean);
    var rawTokens = westernDigits(text).toLowerCase().split(RAW_SPLIT).filter(Boolean);
    for (var i = 0; i < CATS.length; i++) {
      var c = CATS[i], j, k;
      if (c.accented) {
        for (j = 0; j < c.accented.length; j++) { if (rawTokens.indexOf(c.accented[j]) >= 0) return c.id; }
      }
      for (j = 0; j < c.nw.length; j++) {
        var w = c.nw[j];
        for (k = 0; k < tokens.length; k++) {
          var t = tokens[k];
          if (t === w || (w.length >= 4 && t.indexOf(w) >= 0)) return c.id;
        }
      }
    }
    return null;
  }

  /* Petits mots à retirer du libellé (« khlesst », « f », « dh », « j'ai »…). */
  var STOP = {};
  ("khlesst khlest khalast khallast khllst khlsst khelst chrit chritch chrite chrina ma f fi l dyal d dh dhs " +
   "dirham dirhams mad renonce renonces pas achete jai ai le la les un une de du des pour en au " +
   "machritch makhlestch khlestch paye depense " +
   "paid spent bought for on a an the i didnt did not buy skipped " +
   "خلصت خلصنا شريت شرينا ما ف في فال ديال د درهم دراهم الدرهم ماشريتش شريتش ماخلصتش خلصتش على ب ل من")
    .split(" ").forEach(function (w) { STOP[norm(w)] = 1; });

  var RENOUNCE = new RegExp(
    "(ma ?chri|ma ?khle|renonc|pas achet|didn.?t buy|did not buy|skipped|" +
    norm("ما ?شري") + "|" + norm("ما ?خلص") + "|" + norm("مشريتش") + "|" + norm("مخلصتش") + ")");

  var LETTER = new RegExp("[a-z" + AR + "]");
  var CLEAN = new RegExp("[^a-z0-9" + AR + "]", "g");

  /* Lit une phrase. Rend null si elle est vide ; « amount » vaut null si aucun montant n'est trouvé. */
  function parse(text) {
    var raw = String(text == null ? "" : text).trim();
    if (!raw) return null;
    var n = norm(raw), amount = null, re = /(\d+(?:[.,]\d{1,2})?)/g, m;
    while ((m = re.exec(n))) {
      var before = n.charAt(m.index - 1);
      var after = n.slice(m.index + m[0].length);
      // « l9ahwa » ou « 7anout » : le chiffre fait partie d'un mot, ce n'est pas un montant.
      var okB = !before || !LETTER.test(before);
      var okA = !after || /^(\s|dh|dirham|mad|[^a-z0-9])/.test(after);
      if (okB && okA) { amount = parseFloat(m[1].replace(",", ".")); break; }
    }
    var type = RENOUNCE.test(n) ? "renounce" : "expense";
    var cat = detectCat(raw) || "autre";
    var words = raw.split(/\s+/).filter(function (w) {
      var nw = norm(w).replace(CLEAN, "");
      if (!nw || STOP[nw]) return false;
      if (/^\d+(dh|dhs|mad)?$/.test(nw)) return false;
      return true;
    });
    var label = words.join(" ");
    if (label) label = label.charAt(0).toUpperCase() + label.slice(1);
    return { amount: amount, type: type, cat: cat, label: label };
  }

  H.parse = {
    CATS: CATS.map(function (c) { return c.id; }),
    norm: norm, detectCat: detectCat, parse: parse
  };
})(typeof window !== "undefined" ? window : this);
