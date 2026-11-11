"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// 플랫폼 이용 안내(머리글의 버튼).
//
// 단계 그림 하나와 짧은 키워드 카드로 구성함
// 탭은 사용자 유형별(학생 평가자·기업·교직원·관리자)임. 기업과 교직원은 앞부분이 같지만
// 기업은 의뢰·입금·세금계산서가 있고 교직원 건은 의뢰가 없어 따로 둠

type Track = "panel" | "company" | "faculty" | "admin";

type Node = { n: number; label: string; sub: string; tone: "client" | "panel" | "platform" };

/** 학생 평가자: 신청부터 보상 지급까지. 선발된 사람만 응답할 수 있으므로 신청·선발 단계를 포함함 */
const PANEL_FLOW: Node[] = [
  { n: 1, label: "신청", sub: "모집 중일 때", tone: "panel" },
  { n: 2, label: "선발", sub: "참여 확정", tone: "platform" },
  { n: 3, label: "평가", sub: "응답 제출", tone: "panel" },
  { n: 4, label: "검수", sub: "통과 확정", tone: "platform" },
  { n: 5, label: "지급", sub: "계좌 입금", tone: "platform" },
];

/** 기업: 의뢰가 붙는 흐름 */
const COMPANY_FLOW: Node[] = [
  { n: 1, label: "서비스", sub: "정보 등록", tone: "client" },
  { n: 2, label: "문항", sub: "문항 확정", tone: "client" },
  { n: 3, label: "의뢰", sub: "금액·입금", tone: "client" },
  { n: 4, label: "승인", sub: "관리자 검토", tone: "platform" },
  { n: 5, label: "수집", sub: "평가자 응답", tone: "panel" },
  { n: 6, label: "결과", sub: "리포트", tone: "platform" },
];

/** 교직원: 의뢰 없이 연구비에서 사후 정산함 */
const FACULTY_FLOW: Node[] = [
  { n: 1, label: "서비스", sub: "정보 등록", tone: "client" },
  { n: 2, label: "문항", sub: "AI 초안", tone: "client" },
  { n: 3, label: "평가", sub: "문항 확정", tone: "client" },
  { n: 4, label: "승인", sub: "관리자 검토", tone: "platform" },
  { n: 5, label: "결과", sub: "리포트", tone: "platform" },
];

/** 관리자: 전체 7단계 */
const FULL_FLOW: Node[] = [
  { n: 1, label: "의뢰", sub: "서비스·문항", tone: "client" },
  { n: 2, label: "승인", sub: "공개 결정", tone: "platform" },
  { n: 3, label: "모집", sub: "신청·선발", tone: "panel" },
  { n: 4, label: "평가", sub: "응답", tone: "panel" },
  { n: 5, label: "검수", sub: "통과·탈락", tone: "platform" },
  { n: 6, label: "결과", sub: "리포트", tone: "platform" },
  { n: 7, label: "정산", sub: "지급·환불", tone: "platform" },
];

const TONE: Record<Node["tone"], string> = {
  client: "bg-[var(--accent)]",
  panel: "bg-[var(--success)]",
  platform: "bg-[var(--gray-600)]",
};

/** 단계 그림. 넓은 화면은 한 줄로 폭에 맞추고, 폰은 세로로 쌓아 가로 스크롤을 없앰 */
function Flow({ nodes }: { nodes: Node[] }) {
  return (
    <>
      <ol className="hidden sm:grid" style={{ gridTemplateColumns: `repeat(${nodes.length}, minmax(0, 1fr))` }}>
        {nodes.map((s, i) => (
          <li key={s.n} className="relative flex flex-col items-center gap-2 px-1 text-center">
            {i < nodes.length - 1 && (
              <span className="absolute top-5 left-1/2 w-full h-[2px] bg-[var(--gray-200)]" aria-hidden="true" />
            )}
            <span className={`relative w-10 h-10 rounded-full flex items-center justify-center text-base font-bold text-white ${TONE[s.tone]}`}>
              {s.n}
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-bold text-[var(--foreground)]">{s.label}</span>
              <span className="block text-xs text-[var(--muted)] mt-0.5">{s.sub}</span>
            </span>
          </li>
        ))}
      </ol>
      <ol className="sm:hidden">
        {nodes.map((s, i) => (
          <li key={s.n} className="flex gap-3">
            <span className="flex flex-col items-center shrink-0">
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white ${TONE[s.tone]}`}>
                {s.n}
              </span>
              {i < nodes.length - 1 && <span className="w-[2px] flex-1 min-h-3 bg-[var(--gray-200)]" aria-hidden="true" />}
            </span>
            <span className="pt-1.5 pb-3 min-w-0">
              <span className="text-sm font-bold text-[var(--foreground)]">{s.label}</span>
              <span className="text-xs text-[var(--muted)] ml-2">{s.sub}</span>
            </span>
          </li>
        ))}
      </ol>
    </>
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
 * 처음 열 때 보여줄 탭. 교직원은 userType=STAFF, role=DEVELOPER 라서 두 값을 함께 봄
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const trigger = triggerRef.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      trigger?.focus();
    };
  }, [open]);

  const tab = (t: Track, label: string) => (
    <button
      onClick={() => setTrack(t)}
      role="tab"
      aria-selected={track === t}
      className={`shrink-0 whitespace-nowrap px-2.5 py-1.5 text-xs font-medium rounded-[var(--radius-md)] transition-colors ${
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
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 h-10 px-2 sm:px-2.5 text-sm text-[var(--muted)] hover:text-[var(--accent)] rounded-[var(--radius-md)] hover:bg-[var(--gray-50)] transition-colors"
        aria-label="이용 안내 열기"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span className="hidden sm:inline whitespace-nowrap">이용 안내</span>
      </button>

      {/* 머리글은 쌓임 맥락을 만들어 그 안에 두면 메신저 아래로 깔리므로 body 로 뺌 */}
      {open && createPortal(
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="이용 안내"
        >
          <div
            className="w-full max-w-2xl max-h-full flex flex-col bg-white rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-[var(--gray-100)] shrink-0">
              {/* 좁은 화면에서 탭 넷이 줄바꿈되지 않게 가로 스크롤로 둠 */}
              <div className="flex items-center gap-1 overflow-x-auto" role="tablist" aria-label="이용 안내 대상">
                {tab("panel", "학생 평가자")}
                {tab("company", "기업")}
                {tab("faculty", "교직원·조교")}
                {tab("admin", "관리자")}
              </div>
              <button
                ref={closeRef}
                type="button"
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

            <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-5 space-y-5" role="tabpanel">
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
                      ["사업자번호 필요", "의뢰·견적서 공통"],
                      ["세금계산서", "평가 완료 후 발행"],
                      ["미달분 환불", "수수료·부가세 포함"],
                    ]}
                  />
                  <Note>
                    모집은 관리자 승인으로 시작됩니다. 입금은 모집 시작 조건이 아닙니다.
                    세금계산서는 입금 전에도 발행됩니다.
                  </Note>
                </>
              )}

              {track === "faculty" && (
                <>
                  <Flow nodes={FACULTY_FLOW} />
                  <Keys
                    items={[
                      ["의뢰 절차 없음", "사업자번호 불필요"],
                      ["문항은 AI 초안", "검토 후 직접 확정"],
                      ["평가 주소 입력", "등록 뒤 수정에서"],
                    ]}
                  />
                  <Note>
                    확정 문항으로 만든 평가에는 평가 대상 주소가 비어 있습니다. 등록한 뒤 수정
                    화면에서 채워야 평가자가 접속할 수 있습니다. 참여 보상은 연구비에서
                    사후 정산합니다.
                  </Note>
                </>
              )}

              {track === "admin" && (
                <>
                  <Flow nodes={FULL_FLOW} />
                  <Keys
                    items={[
                      ["승인해야 공개", "자금은 판단 자료"],
                      ["의뢰 미연결 확인", "보상이 안 생긴다"],
                      ["계좌 미등록자", "지급에서 빠진다"],
                    ]}
                  />
                  <Note>
                    의뢰는 평가와 별개라 나중에 연결할 수 있고, 연결하면 기존 응답분 보상이
                    소급 생성됩니다.
                  </Note>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
