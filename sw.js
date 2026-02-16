const CACHE_NAME = 'focusmind-v1';
const urlsToCache = [
    './',
    './index.html',
    './assets/style/app.css',
    './assets/js/app.js',
    './assets/data.json',
    './favicio.png',
    './LICENSE',
    './README.md',
    './FM(demo).png',
    './robots.txt',
    './assets/LICENSE.html'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
    );
});