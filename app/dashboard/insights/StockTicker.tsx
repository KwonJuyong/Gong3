"use client";

import { useEffect, useRef } from "react";

// AI 관련주 시세 띠(TradingView 위젯 임베드).
// 시세를 직접 받아 표시하면 재배포 라이선스가 필요해서 TradingView 가 그리는 위젯을 쓴다.
// 하단의 TradingView 표기는 위젯 이용 조건이라 지우면 안 된다.

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
    // StrictMode에서 effect가 두 번 돌면 위젯이 두 개 붙는다. 이미 주입했으면 건너뛴다.
    if (!el || el.querySelector("script")) return;

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbols: SYMBOLS,
      showSymbolLogo: true,
      isTransparent: false,
      displayMode: "adaptive",
      colorTheme: "light",
      locale: "kr",
    });
    el.appendChild(script);
  }, []);

  return (
    <section className="rounded-[var(--radius-lg)] bg-white overflow-hidden">
      <div className="px-5 pt-4 pb-2">
        <h3 className="text-base font-bold text-[var(--foreground)] flex items-center gap-2">
          <span aria-hidden="true">📈</span>
          AI 관련주
        </h3>
        <p className="text-xs text-[var(--muted)] mt-1">
          시세는 TradingView에서 직접 제공합니다. 투자 판단의 근거로 쓰지 마세요.
        </p>
      </div>

      {/* 위젯이 이 안에 iframe을 주입한다 */}
      <div className="tradingview-widget-container" ref={containerRef}>
        <div className="tradingview-widget-container__widget" />
      </div>

      <div className="px-5 py-3 bg-[var(--gray-50)] border-t border-[var(--gray-100)]">
        {/* TradingView 표기(이용 조건) */}
        <p className="text-xs text-[var(--muted)]">
          시세 제공:{" "}
          <a
            href="https://www.tradingview.com/"
            target="_blank"
            rel="noopener nofollow"
            className="underline hover:text-[var(--foreground)]"
          >
            TradingView
          </a>
        </p>
      </div>
    </section>
  );
}
