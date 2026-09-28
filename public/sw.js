// AI 평가단 PWA 서비스워커
// 전략: 인증이 필요한 SSR 앱이므로 HTML은 캐시하지 않고(네트워크 우선),
// 오프라인일 때만 오프라인 폴백 페이지를 보여준다. 해시된 정적 자산만 캐시.
// 아이콘을 cache-first로 들고 있으므로, 아이콘을 교체하면 반드시 버전을 올려야
// 기존 방문자의 옛 아이콘이 activate 단계에서 폐기된다.
const CACHE = "aieval-v3";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 외부 요청은 그대로
  if (url.pathname.startsWith("/api/")) return; // API/SSE는 캐시하지 않음

  // 문서(네비게이션): 네트워크 우선, 실패 시 오프라인 폴백
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // 해시된 정적 자산·아이콘: 캐시 우선(불변)
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
  }
});

// ── 웹 푸시 ──
// 서버(app/lib/push.ts)가 { title, body, url, tag } JSON을 보낸다.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "AI 평가단", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-96.png",
      // 같은 tag면 알림이 쌓이지 않고 최신 것으로 대체된다(같은 평가 알림 도배 방지).
      tag: data.tag || undefined,
      data: { url: data.url || "/dashboard" },
    }),
  );
});

// 알림 클릭: 이미 열린 창이 있으면 그 창을 포커스해 이동하고, 없으면 새로 연다.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin)) {
          return client.focus().then((c) => (c && "navigate" in c ? c.navigate(target) : c));
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
