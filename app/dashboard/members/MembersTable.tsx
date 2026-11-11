"use client";

import SubmitButton from "@/app/components/SubmitButton";
import { confirmSubmit } from "@/app/components/feedback";
import ConfirmButton from "@/app/components/ConfirmButton";
import ReauthField from "@/app/components/ReauthField";
import { useMemo, useState, useActionState } from "react";
import Link from "next/link";
import { csvCell } from "@/app/lib/csv";
import {
  updateMemberAction,
  changeMemberRoleAction,
  setMemberStatusAction,
  sendResetMailAction,
  deleteMemberAction,
  issueTempPasswordAction,
  issueClaimLinksAction,
  type TempPwState,
  type ClaimLinksState,
} from "./actions";

export interface MemberRow {
  id: string;
  name: string;
  studentId: string;
  email: string;
  /** 이메일 인증 여부. 미인증이면 로그인할 수 없음 */
  emailVerified: boolean;
  phone: string;
  major: string;
  role: string;
  userType: string;
  /** ACTIVE | SUSPENDED | WITHDRAWN (탈퇴해도 행은 남음) */
  status: string;
  withdrawnAt: string | null;
  responseCount: number;
  /** 보상 건수. 지급 기록이 있으면 계정을 삭제할 수 없음 */
  rewardCount: number;
  laborClaimCount: number;
  orderCount: number;
  createdAt: string;
}

type Filter = "all" | "noemail" | "unverified" | "staff" | "company" | "inactive";

const ROLE_LABEL: Record<string, { text: string; cls: string }> = {
  ADMIN: { text: "최고관리자", cls: "bg-[var(--accent-light)] text-[var(--accent)]" },
  DEVELOPER: { text: "기업/교직원", cls: "bg-[var(--gray-100)] text-[var(--gray-600)]" },
  USER: { text: "학생 평가자", cls: "bg-[var(--gray-100)] text-[var(--gray-500)]" },
};

/** role 과 userType 을 합쳐 표시 이름을 만듦(STAFF 는 role=DEVELOPER). */
function typeLabel(role: string, userType: string): string {
  if (role === "ADMIN") return "관리자";
  if (userType === "STAFF") return "교직원/조교";
  if (userType === "DEVELOPER") return "기업";
  return "학생";
}

/** 상태 배지 */
const STATUS_BADGE: Record<string, { text: string; cls: string }> = {
  SUSPENDED: { text: "정지", cls: "bg-[var(--warning-light)] text-[var(--warning)]" },
  WITHDRAWN: { text: "탈퇴", cls: "bg-[var(--danger-light)] text-[var(--danger)]" },
};

/** role·userType 조합 프리셋(서버의 ROLE_PRESETS 와 같은 목록) */
const ROLE_PRESETS: { key: string; label: string }[] = [
  { key: "student", label: "학생 평가자" },
  { key: "company", label: "기업" },
  { key: "staff", label: "교직원/조교" },
  { key: "admin", label: "관리자" },
];

function presetOf(role: string, userType: string): string {
  if (role === "ADMIN") return "admin";
  if (userType === "STAFF") return "staff";
  if (userType === "DEVELOPER") return "company";
  return "student";
}

export default function MembersTable({ rows, meId }: { rows: MemberRow[]; meId: string }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  /** 펼친 행(한 번에 하나만) */
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      // 「이메일 없음」(계정 인계 대상)과 「이메일 미인증」은 다른 필터임
      if (filter === "noemail" && r.email) return false;
      if (filter === "unverified" && r.emailVerified) return false;
      if (filter === "staff" && r.userType !== "STAFF") return false;
      if (filter === "inactive" && r.status === "ACTIVE") return false;
      if (filter === "company" && !(r.userType === "DEVELOPER" && r.role !== "ADMIN")) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.studentId.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.major.toLowerCase().includes(q)
      );
    });
  }, [rows, search, filter]);

  const chip = (f: Filter, label: string, n: number) => (
    <button
      key={f}
      type="button"
      onClick={() => setFilter(f)}
      className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
        filter === f
          ? "bg-[var(--accent)] text-white"
          : "bg-white border border-[var(--gray-300)] text-[var(--gray-600)] hover:bg-[var(--gray-50)]"
      }`}
    >
      {label} {n}
    </button>
  );

  return (
    <section className="bg-white rounded-[var(--radius-xl)] overflow-hidden">
      <div className="p-5 border-b border-[var(--gray-100)] space-y-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름 · 학번/사번 · 이메일 · 전공 검색"
          className="w-full px-3 py-2 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--gray-200)] text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors placeholder:text-[var(--gray-400)]"
        />
        <div className="flex flex-wrap gap-2">
          {chip("all", "전체", rows.length)}
          {chip("noemail", "이메일 없음", rows.filter((r) => !r.email).length)}
          {chip("unverified", "이메일 미인증", rows.filter((r) => !r.emailVerified).length)}
          {chip("staff", "교직원/조교", rows.filter((r) => r.userType === "STAFF").length)}
          {chip(
            "company",
            "기업",
            rows.filter((r) => r.userType === "DEVELOPER" && r.role !== "ADMIN").length,
          )}
          {chip("inactive", "정지·탈퇴", rows.filter((r) => r.status !== "ACTIVE").length)}
        </div>
      </div>

      {filter === "noemail" && <ClaimLinkPanel rows={filtered} />}

      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--gray-500)] text-center py-12">검색 결과가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--gray-500)] bg-[var(--gray-50)]">
                <th className="px-4 py-3 font-semibold">이름</th>
                <th className="px-4 py-3 font-semibold">학번/사번</th>
                <th className="px-4 py-3 font-semibold">전공/기업</th>
                <th className="px-4 py-3 font-semibold">이메일</th>
                <th className="px-4 py-3 font-semibold">역할</th>
                <th className="px-4 py-3 font-semibold text-right">응답</th>
                <th className="px-4 py-3 font-semibold">가입일</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <MemberRowView
                  key={m.id}
                  m={m}
                  open={openId === m.id}
                  onToggle={() => setOpenId(openId === m.id ? null : m.id)}
                  isMe={m.id === meId}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="px-5 py-3 border-t border-[var(--gray-100)] text-xs text-[var(--muted)] leading-relaxed">
        행을 누르면 <strong>정보 수정 · 역할 변경 · 정지/탈퇴 · 비밀번호 재설정</strong>을 할 수
        있습니다. 이메일 <strong>미인증</strong> 회원은 로그인이 막힙니다.
        계좌·주민번호 등 정산 정보는 <strong>보상 정산 &gt; 평가자 정산 정보</strong>에서 봅니다.
      </p>
    </section>
  );
}

/** 회원 한 줄과 그 아래 펼쳐지는 상세(목록의 필터·검색을 유지하려고 같은 자리에서 열기). */
function MemberRowView({
  m,
  open,
  onToggle,
  isMe,
}: {
  m: MemberRow;
  open: boolean;
  onToggle: () => void;
  isMe: boolean;
}) {
  const badge = STATUS_BADGE[m.status];
  // 지급 관련 기록이 있으면 삭제하지 않고 탈퇴로 처리함
  const money = m.rewardCount + m.laborClaimCount + m.orderCount;
  const field =
    "w-full px-3 py-2 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-[var(--accent)]";
  const label = "block text-xs font-medium text-[var(--muted)] mb-1";
  const btn =
    "px-3 py-2 text-xs font-semibold rounded-[var(--radius-md)] border border-[var(--gray-300)] text-[var(--foreground)] hover:bg-[var(--gray-50)]";

  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-t border-[var(--gray-100)] cursor-pointer ${
          open ? "bg-[var(--gray-50)]" : "hover:bg-[var(--gray-50)]"
        } ${m.status !== "ACTIVE" ? "opacity-60" : ""}`}
      >
        <td className="px-4 py-3 font-medium text-[var(--foreground)] whitespace-nowrap">
          {m.name}
          {badge && (
            <span className={`ml-1.5 text-xs font-medium px-1.5 py-0.5 rounded ${badge.cls}`}>
              {badge.text}
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-[var(--muted)] font-mono text-xs whitespace-nowrap">
          {m.studentId}
        </td>
        <td className="px-4 py-3 text-[var(--muted)] max-w-[180px] truncate">{m.major || "-"}</td>
        <td className="px-4 py-3">
          <span className="text-[var(--muted)] text-xs">{m.email || "-"}</span>
          {m.email && !m.emailVerified && (
            <span className="ml-1.5 text-xs font-medium px-1.5 py-0.5 rounded bg-[var(--warning-light)] text-[var(--warning)] whitespace-nowrap">
              미인증
            </span>
          )}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <span
            className={`text-xs font-medium px-1.5 py-0.5 rounded ${
              (ROLE_LABEL[m.role] ?? ROLE_LABEL.USER).cls
            }`}
          >
            {typeLabel(m.role, m.userType)}
          </span>
        </td>
        <td className="px-4 py-3 text-right text-[var(--muted)]">{m.responseCount}</td>
        <td className="px-4 py-3 text-[var(--muted)] text-xs whitespace-nowrap">
          {new Date(m.createdAt).toLocaleDateString("ko-KR", {
            year: "2-digit",
            month: "2-digit",
            day: "2-digit",
            timeZone: "Asia/Seoul",
          })}
        </td>
      </tr>

      {open && (
        <tr className="border-t border-[var(--gray-100)] bg-[var(--gray-50)]">
          <td colSpan={7} className="px-4 py-5">
            {/* 활동 내역 링크. 행 전체를 링크로 만들면 펼침과 충돌해 안쪽에 둠 */}
            <div className="mb-4 max-w-[900px]">
              <Link
                href={`/dashboard/members/${m.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-[var(--radius-md)] border border-[var(--gray-300)] bg-white text-[var(--foreground)] hover:bg-[var(--gray-50)]"
              >
                활동 내역 보기
                <span aria-hidden>→</span>
              </Link>
              <span className="ml-2 text-xs text-[var(--muted)]">
                신청·응답·보상·노무비·의뢰·관리자 조작을 시간순으로 봅니다.
              </span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-[900px]">
              <form action={updateMemberAction} className="space-y-3">
                <input type="hidden" name="userId" value={m.id} />
                <h4 className="text-xs font-semibold text-[var(--foreground)]">정보 수정</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={label}>이름</label>
                    <input name="name" defaultValue={m.name} required className={field} />
                  </div>
                  <div>
                    <label className={label}>전공 / 기업</label>
                    <input name="major" defaultValue={m.major} className={field} />
                  </div>
                  <div>
                    <label className={label}>연락처</label>
                    <input name="phone" defaultValue={m.phone} className={field} />
                  </div>
                  <div>
                    <label className={label}>이메일</label>
                    <input name="email" type="email" defaultValue={m.email} className={field} />
                  </div>
                </div>
                <p className="text-xs text-[var(--warning)] leading-relaxed">
                  이메일을 바꾸면 <strong>인증이 해제</strong>되어 본인이 다시 인증해야
                  로그인됩니다. 오타 정정도 마찬가지입니다.
                </p>
                <SubmitButton className="px-3 py-2 text-xs font-semibold rounded-[var(--radius-md)] bg-[var(--accent)] text-white hover:opacity-90">
                  저장
                </SubmitButton>
              </form>

              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-[var(--foreground)] mb-2">역할</h4>
                  <form action={changeMemberRoleAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="userId" value={m.id} />
                    <select
                      name="preset"
                      defaultValue={presetOf(m.role, m.userType)}
                      className={`${field} flex-1`}
                    >
                      {ROLE_PRESETS.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <ReauthField className="w-36 min-w-0" />
                    <ConfirmButton
                      message={`${m.name}님의 역할을 「{preset}」(으)로 바꿉니다.\n\n· 권한과 표시 구분이 함께 바뀝니다.\n· 이 회원이 열어 둔 모든 기기에서 즉시 로그아웃됩니다.\n· 관리자 조작 기록에 남습니다.\n\n정말 바꾸시겠습니까?`}
                      className={btn}
                    >
                      변경
                    </ConfirmButton>
                  </form>
                  <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed">
                    권한과 표시 구분을 <strong>한 벌로</strong> 바꿉니다. 따로 바꾸면 어긋납니다.
                  </p>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-[var(--foreground)] mb-2">
                    상태
                    {m.withdrawnAt && (
                      <span className="ml-1.5 font-normal text-[var(--muted)]">
                        · 탈퇴 {new Date(m.withdrawnAt).toLocaleDateString("ko-KR")}
                      </span>
                    )}
                  </h4>
                  {isMe ? (
                    <p className="text-xs text-[var(--muted)]">
                      본인 계정의 상태는 바꿀 수 없습니다.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {[
                        { s: "ACTIVE", t: "활성으로" },
                        { s: "SUSPENDED", t: "정지" },
                        { s: "WITHDRAWN", t: "탈퇴 처리" },
                      ]
                        .filter((x) => x.s !== m.status)
                        .map((x) => (
                          <form key={x.s} action={setMemberStatusAction}>
                            <input type="hidden" name="userId" value={m.id} />
                            <input type="hidden" name="status" value={x.s} />
                            <ConfirmButton
                              message={
                                x.s === "ACTIVE"
                                  ? `${m.name}님 계정을 다시 활성화합니다.\n\n· 다시 로그인할 수 있게 됩니다.\n\n정말 활성화하시겠습니까?`
                                  : x.s === "SUSPENDED"
                                    ? `${m.name}님 계정을 정지합니다.\n\n· 로그인이 막히고, 열려 있는 모든 기기에서 즉시 로그아웃됩니다.\n· 「활성으로」를 누르면 되돌릴 수 있습니다.\n\n정말 정지하시겠습니까?`
                                    : `${m.name}님 계정을 탈퇴 처리합니다.\n\n· 로그인이 막히고, 열려 있는 모든 기기에서 즉시 로그아웃됩니다.\n· 보상·지급 기록과 개인정보는 남습니다(원천징수 신고 근거).\n\n정말 탈퇴 처리하시겠습니까?`
                              }
                              className={
                                x.s === "WITHDRAWN"
                                  ? "px-3 py-2 text-xs font-semibold rounded-[var(--radius-md)] border border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger-light)]"
                                  : btn
                              }
                            >
                              {x.t}
                            </ConfirmButton>
                          </form>
                        ))}
                    </div>
                  )}
                  <p className="text-xs text-[var(--muted)] mt-1.5 leading-relaxed">
                    탈퇴해도 <strong>기록과 개인정보는 남습니다</strong> — 로그인만 막힙니다.
                    보상·지급 기록은 원천징수 신고 근거라 지울 수 없습니다.
                  </p>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-[var(--foreground)] mb-2">비밀번호</h4>
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={sendResetMailAction}>
                      <input type="hidden" name="userId" value={m.id} />
                      <ConfirmButton
                        message={`${m.name}님(${m.email ?? ""})에게 비밀번호 재설정 링크를 보냅니다.\n\n· 링크는 30분 동안 한 번만 쓸 수 있습니다.\n· 관리자 조작 기록에 남습니다.\n\n정말 보내시겠습니까?`}
                        className={btn}
                        disabled={!m.email}
                      >
                        재설정 링크 메일 보내기
                      </ConfirmButton>
                    </form>
                    <TempPasswordButton userId={m.id} />
                  </div>
                  <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed">
                    {m.email
                      ? "메일 링크가 원칙입니다(관리자가 값을 몰라야 안전). 링크는 30분·1회용."
                      : "이메일이 없어 링크를 보낼 수 없습니다. 임시 비밀번호를 쓰세요."}
                  </p>
                </div>

                {/* 활동 요약(탈퇴·삭제 판단용) */}
                <div className="text-xs text-[var(--muted)] border-t border-[var(--gray-200)] pt-3 leading-relaxed">
                  응답 {m.responseCount} · 보상 {m.rewardCount} · 노무비 {m.laborClaimCount} · 의뢰{" "}
                  {m.orderCount}
                  {money > 0 ? (
                    <span className="block mt-1 text-[var(--warning)]">
                      지급·거래 기록이 있는 계정입니다. 삭제할 수 없고, 정리가 필요하면
                      <strong> 탈퇴 처리</strong>로 끝냅니다.
                    </span>
                  ) : (
                    !isMe &&
                    m.role !== "ADMIN" && (
                      <form
                        action={deleteMemberAction}
                        className="mt-2"
                        onSubmit={(e) =>
                          // 되돌릴 수 없어 확인을 받음
                          confirmSubmit(e, {
                            message: `«${m.name}» 계정을 완전히 삭제합니다. 되돌릴 수 없습니다.\n\n정말 삭제하시겠습니까?`,
                            confirmLabel: "계정 삭제",
                            danger: true,
                          })
                        }
                      >
                        <input type="hidden" name="userId" value={m.id} />
                        <SubmitButton className="px-3 py-2 text-xs font-semibold rounded-[var(--radius-md)] border border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger-light)]">
                          계정 완전 삭제
                        </SubmitButton>
                        <span className="block mt-1">
                          활동 기록이 없어 삭제할 수 있습니다. 남길 필요가 있으면 탈퇴 처리를
                          쓰세요.
                        </span>
                      </form>
                    )
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * 임시 비밀번호 발급 버튼.
 * 자격증명이 URL·로그에 남지 않도록 redirect 대신 useActionState 로 받아 화면에만 보여줌
 */
function TempPasswordButton({ userId }: { userId: string }) {
  const [state, formAction, pending] = useActionState<TempPwState | null, FormData>(
    issueTempPasswordAction,
    null,
  );

  return (
    <span className="inline-flex flex-col gap-1">
      <form
        action={formAction}
        onSubmit={(e) =>
          confirmSubmit(e, {
            message: "임시 비밀번호로 즉시 바뀝니다. 기존 비밀번호는 못 씁니다.\n\n정말 발급하시겠습니까?",
            confirmLabel: "발급",
          })
        }
      >
        <input type="hidden" name="userId" value={userId} />
        <ReauthField className="block w-full mb-1.5 text-xs" />
        <button
          disabled={pending}
          className="px-3 py-2 text-xs font-semibold rounded-[var(--radius-md)] border border-[var(--gray-300)] text-[var(--foreground)] hover:bg-[var(--gray-50)] disabled:opacity-50"
        >
          {pending ? "발급 중…" : "임시 비밀번호 발급"}
        </button>
      </form>

      {state?.error && <span className="text-xs text-[var(--danger)]">{state.error}</span>}
      {state?.password && (
        <span className="inline-flex flex-col gap-0.5 px-2.5 py-2 rounded-[var(--radius-md)] bg-[var(--warning-light)] border border-[var(--warning)]">
          <code className="font-mono text-sm font-bold tracking-wider text-[var(--foreground)]">
            {state.password}
          </code>
          <span className="text-xs text-[var(--warning)] leading-snug">
            지금만 보입니다. 본인에게 전달하고 <strong>바로 바꾸도록</strong> 안내하세요.
          </span>
        </span>
      )}
    </span>
  );
}

/**
 * 계정 인계 링크 일괄 발급(「이메일 없음」 필터에서 표시).
 *
 * 토큰 원본은 저장하지 않으므로 결과는 이 화면에만 보이고 새로고침하면 사라짐
 * 내려받는 CSV 에는 개인정보와 링크가 들어 있어 전달 후 삭제하도록 안내함
 */
function ClaimLinkPanel({ rows }: { rows: MemberRow[] }) {
  const [state, formAction, pending] = useActionState<ClaimLinksState | null, FormData>(
    issueClaimLinksAction,
    null,
  );

  const csv = useMemo(() => {
    if (!state?.rows) return "";
    const head = "이름,학번,전화번호,링크";
    const body = state.rows.map((r) => [r.name, r.studentId, r.phone, r.url].map(csvCell).join(","));
    return [head, ...body].join("\r\n");
  }, [state]);

  const download = () => {
    // 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM 을 붙임
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `계정인계링크_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="mx-5 mb-5 p-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--gray-200)]">
      <p className="text-sm font-semibold text-[var(--foreground)] mb-1">계정 인계 링크</p>
      <p className="text-[12px] text-[var(--gray-600)] leading-relaxed mb-3">
        이메일이 없는 계정은 로그인할 방법이 없습니다. 링크를 발급해 문자·메신저로 보내면,
        본인이 링크 한 번으로 이메일과 새 비밀번호를 정하고 바로 들어옵니다.
        <br />
        <span className="text-[var(--gray-500)]">
          링크는 7일간 유효하고 한 번만 쓸 수 있습니다. 재발급하면 이전 링크는 무효가 됩니다.
        </span>
      </p>

      <form action={formAction}>
        <input type="hidden" name="userIds" value={rows.map((r) => r.id).join(",")} />
        <button
          disabled={pending || rows.length === 0}
          className="px-3.5 py-2 text-xs font-semibold rounded-[var(--radius-md)] bg-[var(--accent)] text-white hover:bg-[var(--accent-dark)] disabled:opacity-50 transition-colors"
        >
          {pending ? "발급 중…" : `이 목록 ${rows.length}명에게 링크 발급`}
        </button>
      </form>

      {state?.error && (
        <p className="mt-2 text-[12px] text-[var(--danger)]">{state.error}</p>
      )}

      {state?.rows && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={download}
              className="px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-md)] border border-[var(--gray-300)] hover:bg-white transition-colors"
            >
              CSV 내려받기 ({state.rows.length}명)
            </button>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(csv)}
              className="px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-md)] border border-[var(--gray-300)] hover:bg-white transition-colors"
            >
              전체 복사
            </button>
          </div>

          <p className="text-xs text-[var(--warning)] leading-snug">
            지금만 보입니다. 새로고침하면 사라지고, 다시 보려면 재발급해야 합니다.
            <br />
            이 파일에는 <strong>계정을 가져갈 수 있는 링크</strong>가 들어 있습니다.
            전달이 끝나면 파일을 지워 주세요.
          </p>

          <textarea
            readOnly
            value={csv}
            rows={Math.min(10, state.rows.length + 1)}
            className="w-full px-2.5 py-2 rounded-[var(--radius-md)] bg-white border border-[var(--gray-200)] font-mono text-xs leading-relaxed"
          />
        </div>
      )}
    </div>
  );
}
