"use client";

import { useEffect, useState, type ReactNode } from "react";

// 플랫폼 이용 안내(헤더의 [이용안내] 버튼).
//
// 단계 그림 하나와 짧은 키워드 카드로 구성한다.
// 탭은 사용자 유형별(평가단·업체·교원·관리자)이다. 업체와 교원은 앞부분이 같지만
// 업체는 발주·입금·세금계산서가 있고 교원 건은 발주가 없어 따로 둔다.

type Track = "panel" | "company" | "faculty" | "admin";

type Node = { n: number; label: string; sub: string; tone: "client" | "panel" | "platform" };

/** 평가단: 신청부터 보상 지급까지. 선발된 사람만 응답할 수 있으므로 신청·선발 단계를 포함한다. */
const PANEL_FLOW: Node[] = [
  { n: 1, label: "신청", sub: "모집중일 때", tone: "panel" },
  { n: 2, label: "선발", sub: "참여 확정", tone: "platform" },
  { n: 3, label: "평가", sub: "응답 제출", tone: "panel" },
  { n: 4, label: "검수", sub: "통과 확정", tone: "platform" },
  { n: 5, label: "지급", sub: "계좌 입금", tone: "platform" },
];

/** 업체: 발주가 붙는 흐름 */
const COMPANY_FLOW: Node[] = [
  { n: 1, label: "서비스", sub: "정보 등록", tone: "client" },
  { n: 2, label: "설문", sub: "문항 확정", tone: "client" },
  { n: 3, label: "발주", sub: "금액·입금", tone: "client" },
  { n: 4, label: "승인", sub: "관리자 검토", tone: "platform" },
  { n: 5, label: "수집", sub: "평가단 응답", tone: "panel" },
  { n: 6, label: "결과", sub: "리포트", tone: "platform" },
];

/** 교원: 발주 없이 연구비에서 사후 정산한다 */
const FACULTY_FLOW: Node[] = [
  { n: 1, label: "서비스", sub: "정보 등록", tone: "client" },
  { n: 2, label: "설문", sub: "AI 초안", tone: "client" },
  { n: 3, label: "평가", sub: "문항 확정", tone: "client" },
  { n: 4, label: "승인", sub: "관리자 검토", tone: "platform" },
  { n: 5, label: "결과", sub: "리포트", tone: "platform" },
];

/** 관리자: 전체 7단계 */
const FULL_FLOW: Node[] = [
  { n: 1, label: "의뢰", sub: "서비스·설문", tone: "client" },
  { n: 2, label: "승인", sub: "공개 결정", tone: "platform" },
  { n: 3, label: "모집", sub: "신청·선발", tone: "panel" },
  { n: 4, label: "평가", sub: "응답", tone: "panel" },
  { n: 5, label: "검수", sub: "통과·탈락", tone: "platform" },
  { n: 6, label: "결과", sub: "리포트", tone: "platform" },
  { n: 7, label: "정산", sub: "지급·환불", tone: "platform" },
];

const TONE: Record<Node["tone"], { dot: string; ring: string }> = {
  client: { dot: "bg-[var(--accent)] text-white", ring: "border-[var(--accent)]" },
  panel: { dot: "bg-[var(--success)] text-white", ring: "border-[var(--success)]" },
  platform: { dot: "bg-[var(--gray-400)] text-white", ring: "border-[var(--gray-300)]" },
};

/** 단계 그림. 좁은 화면에서는 가로 스크롤한다. */
function Flow({ nodes }: { nodes: Node[] }) {
  return (
    <div className="overflow-x-auto -mx-1 px-1 py-2">
      <div className="flex items-start" style={{ minWidth: nodes.length * 88 }}>
        {nodes.map((s, i) => (
          <div key={s.n} className="flex items-start flex-1">
            <div className="flex flex-col items-center gap-2 w-[80px] shrink-0">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${TONE[s.tone].dot}`}
              >
                {s.n}
              </div>
              <div className="text-center leading-tight">
                <div className="text-sm font-bold text-[var(--foreground)]">{s.label}</div>
                <div className="text-xs text-[var(--muted)] mt-0.5">{s.sub}</div>
              </div>
            </div>
            {i < nodes.length - 1 && (
              <div className="flex-1 h-12 flex items-center min-w-[16px]" aria-hidden="true">
                <div className="w-full h-[2px] bg-[var(--gray-200)]" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 핵심 키워드 카드(한 줄) */
function Keys({ items }: { items: [string, string][] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {items.map(([head, note]) => (
        <div
          key={head}
          className="px-3 py-2.5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--gray-200)]"
        >
          <div className="text-[13px] font-bold text-[var(--foreground)]">{head}</div>
          <div className="text-xs text-[var(--muted)] mt-0.5">{note}</div>
        </div>
      ))}
    </div>
  );
}

/** 한 줄짜리 보충 설명 */
function Note({ children }: { children: ReactNode }) {
  return <p className="text-xs text-[var(--muted)] leading-relaxed">{children}</p>;
}

/**
 * 처음 열 때 보여줄 탭. 교직원은 userType=STAFF, role=DEVELOPER 라서 두 값을 함께 본다.
 */
function defaultTrack(userType?: string, role?: string): Track {
  if (role === "ADMIN") return "admin";
  if (userType === "STAFF") return "faculty";
  if (userType === "DEVELOPER") return "company";
  return "panel";
}

export default function ManualButton({ userType, role }: { userType?: string; role?: string }) {
  const [open, setOpen] = useState(false);
  const [track, setTrack] = useState<Track>(defaultTrack(userType, role));

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const tab = (t: Track, label: string) => (
    <button
      onClick={() => setTrack(t)}
      role="tab"
      aria-selected={track === t}
      className={`px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] transition-colors ${
        track === t
          ? "bg-[var(--accent)] text-white"
          : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--gray-50)]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
        aria-label="이용안내 열기"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        이용안내
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="이용안내"
        >
          <div
            className="w-full max-w-2xl bg-white rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--gray-100)]">
              {/* 좁은 화면에서 탭 넷이 줄바꿈되지 않게 가로 스크롤로 둔다 */}
              <div className="flex items-center gap-2 overflow-x-auto" role="tablist" aria-label="이용안내 대상">
                {tab("panel", "평가단")}
                {tab("company", "업체")}
                {tab("faculty", "교원")}
                {tab("admin", "관리자")}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 shrink-0 rounded-full hover:bg-[var(--gray-100)] text-[var(--muted)] flex items-center justify-center transition-colors"
                aria-label="닫기"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="px-5 py-5 space-y-5" role="tabpanel">
              {track === "panel" && (
                <>
                  <Flow nodes={PANEL_FLOW} />
                  <Keys
                    items={[
                      ["선발돼야 참여", "신청만으론 응답 불가"],
                      ["계좌 등록 필수", "없으면 지급에서 빠짐"],
                      ["정원 차면 마감", "먼저 제출한 사람까지"],
                    ]}
                  />
                  <Note>
                    계좌는 프로필 &gt; 정산 정보에서 등록합니다. 지급액은 세전 기준이라 금액에
                    따라 원천징수될 수 있습니다.
                  </Note>
                </>
              )}

              {track === "company" && (
                <>
                  <Flow nodes={COMPANY_FLOW} />
                  <Keys
                    items={[
                      ["사업자번호 필요", "발주·견적서 공통"],
                      ["세금계산서", "평가 완료 후 발행"],
                      ["미달분 환불", "수수료·부가세 포함"],
                    ]}
                  />
                  <Note>
                    모집은 관리자 승인으로 시작됩니다 — 입금은 모집 시작 조건이 아닙니다.
                    세금계산서는 입금 전에도 발행됩니다.
                  </Note>
                </>
              )}

              {track === "faculty" && (
                <>
                  <Flow nodes={FACULTY_FLOW} />
                  <Keys
                    items={[
                      ["발주 절차 없음", "사업자번호 불필요"],
                      ["문항은 AI 초안", "검토 후 직접 확정"],
                      ["평가 주소 입력", "등록 뒤 수정에서"],
                    ]}
                  />
                  <Note>
                    설문에서 만든 평가에는 평가 대상 주소가 비어 있습니다 — 등록한 뒤 수정
                    화면에서 채워야 평가단이 접속할 수 있습니다. 평가단 보상은 연구비에서
                    사후 정산합니다.
                  </Note>
                </>
              )}

              {track === "admin" && (
                <>
                  <Flow nodes={FULL_FLOW} />
                  <Keys
                    items={[
                      ["승인이 공개 게이트", "자금은 판단 자료"],
                      ["발주 미연결 확인", "보상이 안 생긴다"],
                      ["계좌 미등록자", "지급에서 빠진다"],
                    ]}
                  />
                  <Note>
                    발주는 평가와 별개라 나중에 연결할 수 있고, 연결하면 기존 응답분 보상이
                    소급 생성됩니다.
                  </Note>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
