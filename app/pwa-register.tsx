"use client";

import { useEffect, useState } from "react";
import { useCanInstall, promptInstall } from "./pwa-install";

// 서비스워커 등록 + 설치 안내.
// Android/데스크톱: 설치 프롬프트가 잡히면 좌하단 "앱 설치" 버튼.
// iOS: 설치 이벤트가 없어(애플 제약) Safari 수동 설치 안내 배너를 띄운다.
// 프롬프트 이벤트 자체는 pwa-install 스토어가 들고 있다 — NavRail 설치 모달과 공유해야 해서.

export default function PWARegister() {
  const canInstall = useCanInstall();
  // null = iOS 안내 미표시, 객체 = 표시(chrome: iOS의 비-Safari 브라우저 여부)
  const [ios, setIos] = useState<{ chrome: boolean } | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      });
    }

    window.addEventListener("appinstalled", () => setHidden(true));

    // iOS 감지: 설치 프롬프트가 없으므로 안내 배너
    const ua = window.navigator.userAgent;
    const isIOS =
      /iphone|ipad|ipod/i.test(ua) ||
      // iPadOS는 Mac으로 위장 → 터치 지원 Mac을 iPad로 간주
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    // 사이트 데이터를 막은 브라우저에선 읽기만으로 예외가 난다 — 루트 레이아웃이라 앱 전체가 죽는다.
    let dismissed = false;
    try {
      dismissed = localStorage.getItem("pwa-ios-hint") === "1";
    } catch {}
    if (isIOS && !standalone && !dismissed) {
      // 브라우저 기능 감지는 마운트 후에만 가능(SSR엔 window 없음) → 1회 상태 반영
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIos({ chrome: /crios|fxios|edgios/i.test(ua) });
    }

  }, []);

  if (hidden) return null;

  // iOS 안내 배너
  if (ios) {
    const iosChrome = ios.chrome;
    return (
      <div className="fixed bottom-5 left-4 right-4 sm:right-auto sm:max-w-sm z-[60] bg-white rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] p-3 flex items-start gap-3">
        <span className="w-9 h-9 shrink-0 rounded-full bg-[var(--gray-100)] text-[var(--accent)] flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v13" />
            <path d="m8 7 4-4 4 4" />
            <path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--foreground)]">홈 화면에 앱으로 추가</p>
          <p className="text-xs text-[var(--muted)] mt-0.5 leading-relaxed">
            {iosChrome ? (
              <>아이폰은 <b>Safari</b>로 열어야 설치돼요. Safari에서 공유(□↑) → <b>홈 화면에 추가</b></>
            ) : (
              <>하단 공유 버튼(□↑) → <b>홈 화면에 추가</b>를 누르세요</>
            )}
          </p>
        </div>
        <button
          onClick={() => {
            try {
              localStorage.setItem("pwa-ios-hint", "1");
            } catch {}
            setHidden(true);
          }}
          className="w-7 h-7 shrink-0 rounded-[var(--radius-md)] flex items-center justify-center text-[var(--gray-500)] hover:bg-[var(--gray-50)]"
          aria-label="닫기"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  // Android/데스크톱 설치 버튼
  if (canInstall) {
    return (
      <div className="fixed bottom-5 left-5 z-[60] flex items-center gap-2 bg-white rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] pl-3 pr-2 py-2">
        <span className="text-sm text-[var(--gray-700)]">앱으로 설치</span>
        <button
          onClick={() => promptInstall()}
          className="text-sm font-medium bg-[var(--accent)] text-white px-3 py-1.5 rounded-[var(--radius-md)] hover:bg-[var(--accent-dark)] transition-colors"
        >
          설치
        </button>
        <button
          onClick={() => setHidden(true)}
          className="w-7 h-7 rounded-[var(--radius-md)] flex items-center justify-center text-[var(--gray-500)] hover:bg-[var(--gray-50)]"
          aria-label="닫기"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  return null;
}
