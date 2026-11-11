"use server";

import { revalidatePath } from "next/cache";
import { prisma, getSessionUser } from "../db";
import { saveSettlementProfile } from "../lib/settlementProfile";
import { logPersonalData } from "../lib/accessLog";

/**
 * 정산 정보 관리자 대리입력(정산 화면의 ProfilesPanel). 본인 입력은 프로필 화면에서 함
 * 이 폼에는 서명 칸이 없으므로 signatureUrl 을 보내지 않아 기존 서명을 유지함
 */

const SETTLEMENT = "/dashboard/settlement";

/**
 * 학생 대신 저장(학생이 메신저로 계좌를 보내온 경우 등).
 * 본인 동의로 기록하지 않고 대리입력자만 남김
 */
export async function saveSettlementProfileForUserAction(formData: FormData) {
  const me = await getSessionUser();
  if (!me || me.role !== "ADMIN") return;

  const userId = ((formData.get("userId") as string) || "").trim();
  if (!userId) return;

  const input = {
    bankName: ((formData.get("bankName") as string) || "").trim(),
    accountNumber: ((formData.get("accountNumber") as string) || "").trim(),
    holderName: ((formData.get("holderName") as string) || "").trim(),
    address: ((formData.get("address") as string) || "").trim(),
    rrn: ((formData.get("rrn") as string) || "").trim(),
    // 대리입력은 본인 동의가 아니므로 consentAt 을 채우지 않음
    consented: false,
  };
  if (!input.bankName || !input.accountNumber) return;

  // 폼에서 온 userId 가 실제 사용자인지 먼저 확인함(없으면 upsert 가 FK 오류를 냄).
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target) return;

  await saveSettlementProfile(userId, input, me.id);
  // 접속기록: 다른 사람의 계좌·주민번호 변경
  await logPersonalData(me.id, "UPDATE", "정산 정보 대리입력(계좌·주민번호)", userId);
  revalidatePath(SETTLEMENT);
}
