const CACHE_PREFIX = "daymark-shell-";
const RELEASE_ID = "__DAYMARK_RELEASE__";
const CACHE_VERSION = `${CACHE_PREFIX}${RELEASE_ID}`;
const scopeUrl = new URL(self.registration.scope);
const basePath = scopeUrl.pathname.endsWith("/")
  ? scopeUrl.pathname
  : `${scopeUrl.pathname}/`;
const shellFiles = [
  basePath,
  `${basePath}index.html`,
  `${basePath}manifest.webmanifest`,
  `${basePath}icons/daymark-192.png`,
  `${basePath}icons/daymark-512.png`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(shellFiles))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !url.pathname.startsWith(basePath)
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(
          async () =>
            (await caches.match(request)) ??
            (await caches.match(`${basePath}index.html`)) ??
            Response.error(),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
