/* Hourriya — l'enregistrement sur le téléphone (IndexedDB).
   Rien ne sort de l'appareil : pas de compte, pas de serveur.
   Deux tiroirs :
   - « meta »    : le plan, les dettes, les grandes dépenses, les réglages ;
   - « entries » : une fiche par dépense ou renoncement. */
(function (root) {
  "use strict";
  var H = (root.H = root.H || {});

  var NAME = "hourriya", VERSION = 1;
  var META_KEYS = ["plan", "strategy", "initialTotal", "sample", "settings", "debts", "caisses",
                   "since", "closed", "notice"];
  var db = null;

  function open() {
    return new Promise(function (resolve) {
      var req;
      try { req = root.indexedDB.open(NAME, VERSION); }
      catch (e) { return resolve(false); }
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta");
        if (!d.objectStoreNames.contains("entries")) d.createObjectStore("entries", { keyPath: "id" });
      };
      req.onsuccess = function () {
        db = req.result;
        db.onversionchange = function () { db.close(); db = null; };
        resolve(true);
      };
      req.onerror = function () { resolve(false); };
      req.onblocked = function () { resolve(false); };
    });
  }

  /* Lance une opération et attend qu'elle soit vraiment écrite. */
  function run(stores, mode, work) {
    return new Promise(function (resolve, reject) {
      if (!db) return reject(new Error("no-db"));
      var out, tx;
      try { tx = db.transaction(stores, mode); out = work(tx); }
      catch (e) { return reject(e); }
      tx.oncomplete = function () { resolve(out); };
      tx.onerror = tx.onabort = function () { reject(tx.error || new Error("tx")); };
    });
  }

  /* Relit tout. Rend null au tout premier lancement (rien d'enregistré). */
  function loadAll() {
    if (!db) return Promise.resolve(null);
    var state = {}, entriesReq, reqs = {};
    return run(["meta", "entries"], "readonly", function (tx) {
      var meta = tx.objectStore("meta");
      META_KEYS.forEach(function (k) { reqs[k] = meta.get(k); });
      entriesReq = tx.objectStore("entries").getAll();
    }).then(function () {
      META_KEYS.forEach(function (k) { state[k] = reqs[k].result; });
      state.entries = entriesReq.result || [];
      return state.plan ? state : null;
    }).catch(function () { return null; });
  }

  function setMeta(key, value) {
    return run(["meta"], "readwrite", function (tx) { tx.objectStore("meta").put(value, key); });
  }
  /* Écrit plusieurs réglages d'un seul coup : soit tout est écrit, soit rien.
     Sert au changement de mois, pour ne jamais compter un mois deux fois. */
  function setMetas(keys, state) {
    return run(["meta"], "readwrite", function (tx) {
      var meta = tx.objectStore("meta");
      keys.forEach(function (k) { meta.put(state[k], k); });
    });
  }
  function putEntry(entry) {
    return run(["entries"], "readwrite", function (tx) { tx.objectStore("entries").put(entry); });
  }
  function deleteEntry(id) {
    return run(["entries"], "readwrite", function (tx) { tx.objectStore("entries").delete(id); });
  }

  /* Efface tout et réécrit l'état donné (remise à zéro ou retour à l'exemple). */
  function replaceAll(state) {
    return run(["meta", "entries"], "readwrite", function (tx) {
      var meta = tx.objectStore("meta"), entries = tx.objectStore("entries");
      meta.clear(); entries.clear();
      META_KEYS.forEach(function (k) { meta.put(state[k], k); });
      state.entries.forEach(function (e) { entries.put(e); });
    });
  }

  H.db = {
    open: open, loadAll: loadAll, setMeta: setMeta, setMetas: setMetas,
    putEntry: putEntry, deleteEntry: deleteEntry, replaceAll: replaceAll,
    available: function () { return !!db; }
  };
})(window);
