const CACHE_NAME = 'sql-dungeons-v2';
const ASSETS = [
  './',
  './index.html',
  './assets/css/styles.css',
  './assets/data/dungeons/beginner.json',
  './assets/data/dungeons/tutorial.json',
  './assets/data/dungeons/manifest.json',
  './assets/data/mock-databases/company.json',
  './assets/data/mock-databases/fruit.json',
  './assets/data/mock-databases/game.json',
  './assets/data/mock-databases/tutorial.json',
  './assets/data/mock-databases/user.json',
  './assets/data/mock-databases/manifest.json',
  './assets/data/shop-items.json',
  './assets/lang/en_us.json',
  './assets/lang/ja_jp.json',
  './assets/lang/ko_kr.json',
  './assets/lang/zh_cn.json',
  './assets/lang/manifest.json',
  './assets/js/main.js',
  './assets/js/constants.js',
  './assets/js/register.js',
  './assets/js/core/game-core.js',
  './assets/js/core/game-lifecycle.js',
  './assets/js/core/game-state.js',
  './assets/js/core/sandbox-ui.js',
  './assets/js/core/floor-key.js',
  './assets/js/data/data-loader.js',
  './assets/js/lang/i18n.js',
  './assets/js/lang/i18n-init.js',
  './assets/js/models/floor.js',
  './assets/js/models/item.js',
  './assets/js/models/player.js',
  './assets/js/sql/sql-parser.js',
  './assets/js/sql/clause/abstract-clause.js',
  './assets/js/sql/clause/exists-clause.js',
  './assets/js/sql/clause/groupby-clause.js',
  './assets/js/sql/clause/having-clause.js',
  './assets/js/sql/clause/inner-join-clause.js',
  './assets/js/sql/clause/outer-join-clause.js',
  './assets/js/sql/clause/in-clause.js',
  './assets/js/sql/clause/where-clause.js',
  './assets/js/sql/clause/orderby-clause.js',
  './assets/js/sql/clause/insert-clause.js',
  './assets/js/sql/clause/select-clause.js',
  './assets/js/sql/clause/union-clause.js',
  './assets/js/sql/clause/partitionby-clause.js',
  './assets/js/sql/clause/rank-function.js',
  './assets/js/sql/aggregate/aggregate-function.js',
  './assets/js/sql/aggregate/count-function.js',
  './assets/js/sql/aggregate/sum-function.js',
  './assets/js/sql/aggregate/avg-function.js',
  './assets/js/sql/aggregate/min-function.js',
  './assets/js/sql/aggregate/max-function.js',
  './assets/js/sql/util/column-resolver.js',
  './assets/js/sql/util/condition-util.js',
  './assets/js/ui/dom-manager.js',
  './assets/js/ui/hint.js',
  './assets/js/ui/render-util.js',
  './assets/js/ui/shop.js',
  './assets/js/ui/stage-select.js',
  './assets/js/ui/ui-handlers.js',
  './assets/js/ui/query-executor.js',
  './assets/js/ui/autocomplete.js',
  './assets/js/ui/event-bindings.js',
  './assets/js/sql/clause/manifest.json',
  './assets/js/sql/aggregate/manifest.json',
  './assets/data/dungeons/manifest.json',
  './assets/data/mock-databases/manifest.json',
  './assets/lang/manifest.json',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // 1件ずつ取得する。存在しないファイルがあっても全体のキャッシュを失敗させない
      Promise.all(ASSETS.map((url) => cache.add(url).catch(() => {})))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    // 古いバージョンのキャッシュを削除する
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Network-first, fallback to cache
  event.respondWith(
    fetch(event.request).then((res) => {
      try {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
      } catch (e) {}
      return res;
    }).catch(() => caches.match(event.request).then((r) => r || caches.match('./index.html')))
  );
});
