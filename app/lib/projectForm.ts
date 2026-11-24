import "server-only";
import { prisma } from "../db";
import { FUNDING_TYPES } from "./approvals";

// 평가 생성·수정 폼 공용 읽기 규칙. 동행 평가·표준 설문·자유 설문이 같은 규칙을 씀

/**
 * 자금 출처를 폼에서 읽음. 알 수 없는 값이면 입금 확인이 필요한 업체(COMPANY)로 봄
 */
export function parseFundingType(formData: FormData): string {
  const raw = ((formData.get("fundingType") as string) || "").trim();
  return FUNDING_TYPES.includes(raw as (typeof FUNDING_TYPES)[number]) ? raw : "COMPANY";
}

export function strOrNull(formData: FormData, key: string): string | null {
  return ((formData.get(key) as string) || "").trim() || null;
}

/**
 * 발주를 평가에 연결함(선택 사항). 연결 전에는 보상이 생기지 않으며,
 * 나중에 승인 화면에서 연결할 수도 있음(linkOrderToProjectAction).
 * 본인 발주(또는 ADMIN)만 연결할 수 있고, 한 발주는 한 평가에만 붙음(projectId unique).
 */
export async function linkOrder(
  orderId: string | null,
  projectId: string,
  me: { id: string; role: string },
): Promise<void> {
  if (!orderId) return;
  const where =
    me.role === "ADMIN"
      ? { id: orderId, projectId: null }
      : { id: orderId, projectId: null, buyerId: me.id };
  await prisma.order.updateMany({ where, data: { projectId } });
}

export function normalizeUrl(raw: string): string | null {
  const s = (raw || "").trim();
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** 신청 마감 일시. 날짜가 없으면 마감 없음. */
export function parseEnrollmentDeadline(formData: FormData): Date | null {
  const d = (formData.get("enrollmentDeadlineDate") as string) || "";
  const t = (formData.get("enrollmentDeadlineTime") as string) || "";
  return d ? new Date(`${d}T${t || "23:59"}:00+09:00`) : null;
}
