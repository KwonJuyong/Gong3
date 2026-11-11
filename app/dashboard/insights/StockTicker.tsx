"use client";

import { useEffect, useRef } from "react";

// 시세를 직접 받아 표시하면 재배포 라이선스가 필요해 TradingView 가 그리는 위젯을 씀
// 아래 TradingView 표기는 위젯 이용 조건이라 지우면 안 됨

const SYMBOLS = [
  { proName: "NASDAQ:NVDA", title: "엔비디아" },
  { proName: "NASDAQ:MSFT", title: "마이크로소프트" },
  { proName: "NASDAQ:GOOGL", title: "알파벳" },
  { proName: "NASDAQ:AMZN", title: "아마존" },
  { proName: "NASDAQ:META", title: "메타" },
  { proName: "NASDAQ:AMD", title: "AMD" },
  { proName: "NASDAQ:AVGO", title: "브로드컴" },
  { proName: "NYSE:TSM", title: "TSMC" },
];

export default function StockTicker() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    // StrictMode 에서 effect 가 두 번 돌면 위젯이 두 개 붙음
    if (!el || el.querySelector("script")) return;

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbols: SYMBOLS,
      showSymbolLogo: false,
      isTransparent: true,
      displayMode: "compact",
      colorTheme: "light",
      locale: "kr",
    });
    el.appendChild(script);
  }, []);

  return (
    <section aria-label="AI 관련주 시세" className="rounded-[var(--radius-xl)] bg-white overflow-hidden">
      <div className="tradingview-widget-container min-h-[46px]" ref={containerRef}>
        <div className="tradingview-widget-container__widget" />
      </div>
      <p className="px-5 pb-3 text-xs text-[var(--muted)]">
        시세 제공{" "}
        <a
          href="https://www.tradingview.com/"
          target="_blank"
          rel="noopener nofollow"
          className="underline underline-offset-2 hover:text-[var(--foreground)]"
        >
          TradingView
        </a>
        . 투자 판단의 근거로 쓰지 마세요.
      </p>
    </section>
  );
}
