/* Hourriya — fonctionnement sans connexion.
   À la première visite, ce fichier garde une copie de l'app dans le téléphone.
   Ensuite l'app s'ouvre depuis cette copie (même sans réseau) et, s'il y a du réseau,
   va chercher en arrière-plan la dernière version pour la prochaine ouverture.
   Seuls les fichiers de l'app sont concernés : les données personnelles ne passent jamais par ici. */

var CACHE = "hourriya-v2";
var FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/style.css",
  "js/calc.js",
  "js/parse.js",
  "js/seed.js",
  "js/db.js",
  "js/i18n.js",
  "js/app.js",
  "lang/fr.json",
  "lang/en.json",
  "lang/ar.json",
  "lang/ary.json",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(FILES); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      // « ignoreSearch » : index.html?quelquechose ouvre bien la copie de index.html.
      return cache.match(req, { ignoreSearch: true }).then(function (cached) {
        var fresh = fetch(req).then(function (res) {
          if (res && res.ok && res.type === "basic") cache.put(req, res.clone());
          return res;
        });
        if (cached) {
          event.waitUntil(fresh.catch(function () {}));
          return cached;
        }
        // Pas de copie : on essaie le réseau, et pour une page on retombe sur l'app.
        return fresh.catch(function () {
          if (req.mode === "navigate") return cache.match("index.html");
          return Response.error();
        });
      });
    })
  );
});
