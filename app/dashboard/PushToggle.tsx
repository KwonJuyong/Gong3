"use client";

import { useEffect, useState } from "react";
import { pushSupported, currentSubscription, enablePush, disablePush } from "../push-client";

// 프로필 알림 탭의 푸시 켜기/끄기 토글.
// 앱을 닫아둔 상태에서도 알림을 받으려면 이 구독이 있어야 함
type State = "loading" | "off" | "on" | "denied" | "unsupported";

export default function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!pushSupported()) return setState("unsupported");
      // 브라우저 설정에서 차단한 경우
      if (Notification.permission === "denied") return setState("denied");
      setState((await currentSubscription()) ? "on" : "off");
    })();
  }, []);

  if (state === "loading") return null;

  if (state === "unsupported") {
    return (
      <p className="text-xs text-[var(--muted)] leading-relaxed">
        이 브라우저는 푸시 알림을 지원하지 않습니다. iPhone은 <b>홈 화면에 추가</b>한 뒤 앱에서 열면 사용할 수 있어요.
      </p>
    );
  }

  if (state === "denied") {
    return (
      <p className="text-xs text-[var(--muted)] leading-relaxed">
        알림이 차단되어 있습니다. 브라우저 주소창의 자물쇠 → <b>알림</b> → 허용으로 바꿔주세요.
      </p>
    );
  }

  const on = state === "on";

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-[var(--muted)]">
        {on ? "앱을 닫아도 알림을 받습니다" : "앱을 닫아도 알림을 받으려면 켜세요"}
      </span>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            if (on) {
              await disablePush();
              setState("off");
            } else {
              const res = await enablePush();
              setState(res === "ok" ? "on" : res === "denied" ? "denied" : "off");
            }
          } finally {
            setBusy(false);
          }
        }}
        className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-[var(--radius-md)] transition-colors disabled:opacity-50 ${
          on
            ? "bg-[var(--gray-100)] text-[var(--gray-600)] hover:bg-[var(--gray-200)]"
            : "bg-[var(--accent)] text-white hover:bg-[var(--accent-dark)]"
        }`}
      >
        {busy ? "…" : on ? "알림 끄기" : "알림 켜기"}
      </button>
    </div>
  );
}
