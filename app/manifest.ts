import type { MetadataRoute } from "next";

// PWA 매니페스트: /manifest.webmanifest 로 자동 제공되고 <link rel="manifest">가 주입된다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    // id를 명시하지 않으면 브라우저가 start_url로 앱을 식별한다. start_url이 바뀌는 순간
    // "다른 앱"이 되어 재설치를 요구하므로 고정 id를 박아둔다(기존 설치와 동일한 값).
    id: "/",
    name: "AI 평가단",
    short_name: "AI 평가단",
    description: "AI 평가단 플랫폼 — 평가 참여, 메신저, 노무비 청구",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "ko",
    dir: "ltr",
    orientation: "portrait",
    // Microsoft Store / Play 스토어 분류. PWABuilder가 패키징 시 요구한다.
    categories: ["education", "productivity", "business"],
    // 스토어 앱을 설치했더라도 웹에서 계속 쓸 수 있어야 하므로 false.
    // (스토어 등록 후 related_applications에 Store ID를 추가하면
    //  getInstalledRelatedApps()로 설치 여부를 감지해 설치 배너를 숨길 수 있다)
    prefer_related_applications: false,
    // 작업표시줄 아이콘 우클릭 시 나오는 점프 목록.
    // 권한과 무관하게 모든 사용자가 쓰는 두 경로만 넣는다.
    shortcuts: [
      {
        name: "평가 참여",
        url: "/dashboard/surveys",
        icons: [{ src: "/icons/icon-96.png", sizes: "96x96", type: "image/png" }],
      },
      {
        name: "노무비 청구",
        url: "/dashboard/payroll",
        icons: [{ src: "/icons/icon-96.png", sizes: "96x96", type: "image/png" }],
      },
    ],
    icons: [
      // 작은 사이즈까지 주는 이유: Windows 바로가기·작업표시줄은 512를 축소하는 대신
      // 가장 가까운 크기를 골라 쓴다. 48/96이 없으면 흐릿하게 렌더된다.
      { src: "/icons/icon-48.png", sizes: "48x48", type: "image/png", purpose: "any" },
      { src: "/icons/icon-96.png", sizes: "96x96", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // maskable은 OS가 원/둥근사각으로 잘라내므로 안전영역을 둔 별도 파일이어야 한다.
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
