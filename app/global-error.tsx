"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <main style={{ minHeight: "100vh", background: "#F9FAFB", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
          <div style={{ width: "100%", maxWidth: "480px", textAlign: "center" }}>
            <div style={{ background: "#fff", borderRadius: "16px", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.07)", border: "1px solid #E5E7EB", padding: "40px" }}>
              <div style={{ width: "64px", height: "64px", margin: "0 auto 24px", borderRadius: "50%", background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#111827", marginBottom: "8px" }}>
                오류가 발생했습니다
              </h1>
              <p style={{ fontSize: "14px", color: "#6B7280", marginBottom: "24px", lineHeight: 1.6 }}>
                일시적인 문제가 발생했습니다.<br />
                아래 버튼을 눌러 다시 시도해 주세요.
              </p>
              <button
                onClick={() => reset()}
                style={{ padding: "10px 24px", background: "#111827", color: "#fff", borderRadius: "8px", border: "none", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}
              >
                다시 시도
              </button>
            </div>
            <p style={{ fontSize: "12px", color: "#9CA3AF", marginTop: "16px" }}>
              문제가 지속되면 labchain.hallym@gmail.com 으로 문의해 주세요.
            </p>
          </div>
        </main>
      </body>
    </html>
  );
}
