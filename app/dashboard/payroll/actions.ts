"use server";

import { getSessionUserId } from "@/app/session-server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { encryptRRN } from "../../lib/crypto";

const PAYROLL_PATH = "/dashboard/payroll";

async function getMe() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

/** 서류 관련 권한은 관리자(ADMIN)에게만 */
function isAdmin(role: string) {
  return role === "ADMIN";
}

// 근무내역 자동 생성용 시간 포맷(Asia/Seoul)
function seoulDate(d: Date) {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("year")}.${get("month")}.${get("day")}`;
}
function seoulTime(d: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  })
    .format(d)
    .replace(/\s/g, "");
}

interface ClaimEntry {
  date: string;
  start: string;
  end: string;
  content: string;
  amount: number;
}

/** 노무비 기준 근무시간 계산: 18:00 시작, 만원당 1시간 추가 */
function workTimeFromAmount(amount: number): { start: string; end: string } {
  const totalMin = Math.round((Math.max(0, amount) / 10000) * 60);
  const endH = 18 + Math.floor(totalMin / 60);
  const endM = totalMin % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { start: "18:00", end: `${pad(endH)}:${pad(endM)}` };
}

/** 한 사용자의 batch 기간 내 참여기록 → 근무내역 자동 생성 */
async function autoEntries(userId: string, periodStart: Date, periodEnd: Date, defaultRate: number): Promise<ClaimEntry[]> {
  const responses = await prisma.response.findMany({
    where: { userId, project: { startTime: { gte: periodStart, lte: periodEnd } } },
    include: { project: { select: { title: true, startTime: true, endTime: true } } },
    orderBy: { project: { startTime: "asc" } },
  });
  return responses.map((r) => {
    const amount = defaultRate || 0;
    const { start, end } = workTimeFromAmount(amount);
    return {
      date: seoulDate(r.project.startTime),
      start,
      end,
      content: r.project.title,
      amount,
    };
  });
}

function parseEntries(raw: string): ClaimEntry[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((e: any) => ({
        date: String(e?.date || "").trim(),
        start: String(e?.start || "").trim(),
        end: String(e?.end || "").trim(),
        content: String(e?.content || "").trim(),
        amount: Math.max(0, parseInt(String(e?.amount ?? "0"), 10) || 0),
      }))
      .filter((e) => e.date || e.content || e.amount > 0);
  } catch {
    return [];
  }
}

// 개인 정산 정보 저장은 app/dashboard/profile/actions.ts 의 saveMyProfileSettlementAction 에서 한다.

/** [연구책임자(근무확인) 서명 저장: ADMIN] 모든 서류에 공통으로 쓴다. */
export async function saveDirectorSignature(formData: FormData) {
  const me = await getMe();
  if (!me || !isAdmin(me.role)) return;

  const value = ((formData.get("directorSignUrl") as string) || "").trim() || null;
  await prisma.appSetting.upsert({
    where: { key: "directorSignUrl" },
    update: { value },
    create: { key: "directorSignUrl", value },
  });

  revalidatePath(PAYROLL_PATH);
  redirect(`${PAYROLL_PATH}?signSaved=1`);
}

/** 연구책임자 단일 고정 서명 URL 조회 (전역 설정) */
export async function getDirectorSignUrl(): Promise<string> {
  const setting = await prisma.appSetting.findUnique({ where: { key: "directorSignUrl" } });
  return setting?.value || "";
}

/** [청구 회차 생성: ADMIN] */
export async function createClaimBatch(formData: FormData) {
  const me = await getMe();
  if (!me || !isAdmin(me.role)) return;

  const title = ((formData.get("title") as string) || "").trim();
  const startDate = (formData.get("periodStart") as string) || "";
  const endDate = (formData.get("periodEnd") as string) || "";
  const defaultRate = Math.max(0, parseInt((formData.get("defaultRate") as string) || "0", 10) || 0);
  if (!title || !startDate || !endDate) return;

  await prisma.claimBatch.create({
    data: {
      title,
      periodStart: new Date(`${startDate}T00:00:00+09:00`),
      periodEnd: new Date(`${endDate}T23:59:59+09:00`),
      defaultRate,
      status: "OPEN",
      createdById: me.id,
    },
  });

  revalidatePath(PAYROLL_PATH);
  redirect(PAYROLL_PATH);
}

/** [회차 마감/재개: ADMIN] */
export async function setBatchStatus(formData: FormData) {
  const me = await getMe();
  if (!me || !isAdmin(me.role)) return;

  const batchId = (formData.get("batchId") as string) || "";
  const status = (formData.get("status") as string) || "";
  if (!batchId || (status !== "OPEN" && status !== "CLOSED")) return;

  await prisma.claimBatch.update({ where: { id: batchId }, data: { status } });
  revalidatePath(`${PAYROLL_PATH}/admin/${batchId}`);
  redirect(`${PAYROLL_PATH}/admin/${batchId}`);
}

/** [참여자 서류 자동 생성: ADMIN] 기간 내 참여자별 청구서를 자동 생성(누락분만). */
export async function generateClaims(formData: FormData) {
  const me = await getMe();
  if (!me || !isAdmin(me.role)) return;

  const batchId = (formData.get("batchId") as string) || "";
  if (!batchId) return;

  const batch = await prisma.claimBatch.findUnique({ where: { id: batchId } });
  if (!batch) return;

  // 기간 내 참여자(중복 제거)
  const responses = await prisma.response.findMany({
    where: { project: { startTime: { gte: batch.periodStart, lte: batch.periodEnd } } },
    select: { userId: true },
    distinct: ["userId"],
  });
  const userIds = responses.map((r) => r.userId);
  if (userIds.length === 0) {
    revalidatePath(`${PAYROLL_PATH}/admin/${batchId}`);
    redirect(`${PAYROLL_PATH}/admin/${batchId}`);
  }

  const existing = await prisma.laborClaim.findMany({
    where: { batchId, userId: { in: userIds } },
    select: { userId: true },
  });
  const existingSet = new Set(existing.map((c) => c.userId));

  for (const userId of userIds) {
    if (existingSet.has(userId)) continue; // 기존(관리자 편집분) 보존
    const [user, profile] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.payrollProfile.findUnique({ where: { userId } }),
    ]);
    if (!user) continue;
    const entries = await autoEntries(userId, batch.periodStart, batch.periodEnd, batch.defaultRate);
    const totalAmount = entries.reduce((s, e) => s + e.amount, 0);
    await prisma.laborClaim.create({
      data: {
        batchId,
        userId,
        affiliation: user.major || "",
        name: user.name,
        phone: user.phone || "",
        address: profile?.address || "",
        bankName: profile?.bankName || "",
        accountNumber: profile?.accountNumber || "",
        rrnEnc: profile?.rrnEnc || null,
        entries: entries as unknown as Prisma.InputJsonValue,
        totalAmount,
        consent: { personal: true, unique: true, thirdParty: true },
        signatureUrl: profile?.signatureUrl || null,
        status: "DRAFT",
      },
    });
  }

  revalidatePath(`${PAYROLL_PATH}/admin/${batchId}`);
  redirect(`${PAYROLL_PATH}/admin/${batchId}`);
}

/** [한 청구서의 개인정보·근무내역을 최신 프로필/참여기록으로 재생성: ADMIN] */
export async function regenerateClaim(formData: FormData) {
  const me = await getMe();
  if (!me || !isAdmin(me.role)) return;

  const claimId = (formData.get("claimId") as string) || "";
  if (!claimId) return;

  const claim = await prisma.laborClaim.findUnique({ where: { id: claimId }, include: { batch: true } });
  if (!claim) return;

  const [user, profile] = await Promise.all([
    prisma.user.findUnique({ where: { id: claim.userId } }),
    prisma.payrollProfile.findUnique({ where: { userId: claim.userId } }),
  ]);
  const entries = await autoEntries(claim.userId, claim.batch.periodStart, claim.batch.periodEnd, claim.batch.defaultRate);
  const totalAmount = entries.reduce((s, e) => s + e.amount, 0);

  await prisma.laborClaim.update({
    where: { id: claimId },
    data: {
      affiliation: user?.major || claim.affiliation,
      name: user?.name || claim.name,
      phone: user?.phone || claim.phone,
      address: profile?.address || "",
      bankName: profile?.bankName || "",
      accountNumber: profile?.accountNumber || "",
      rrnEnc: profile?.rrnEnc || null,
      signatureUrl: profile?.signatureUrl || null,
      entries: entries as unknown as Prisma.InputJsonValue,
      totalAmount,
    },
  });

  revalidatePath(`${PAYROLL_PATH}/admin/${claim.batchId}/${claimId}`);
  redirect(`${PAYROLL_PATH}/admin/${claim.batchId}/${claimId}`);
}

/** [청구서 편집/확정: ADMIN] 자동 생성된 서류의 틀을 수동 수정 */
export async function saveClaim(formData: FormData) {
  const me = await getMe();
  if (!me || !isAdmin(me.role)) return;

  const claimId = (formData.get("claimId") as string) || "";
  if (!claimId) return;

  const claim = await prisma.laborClaim.findUnique({ where: { id: claimId } });
  if (!claim) return;

  const entries = parseEntries((formData.get("entries") as string) || "[]");
  const totalAmount = entries.reduce((s, e) => s + e.amount, 0);

  const affiliation = ((formData.get("affiliation") as string) || "").trim();
  const name = ((formData.get("name") as string) || claim.name).trim();
  const phone = ((formData.get("phone") as string) || "").trim();
  const address = ((formData.get("address") as string) || "").trim();
  const bankName = ((formData.get("bankName") as string) || "").trim();
  const accountNumber = ((formData.get("accountNumber") as string) || "").trim();
  const signatureUrl = ((formData.get("signatureUrl") as string) || "").trim() || null;
  const rrnRaw = ((formData.get("rrn") as string) || "").trim();
  const rrnEnc = rrnRaw ? encryptRRN(rrnRaw) : claim.rrnEnc;

  const consent = {
    personal: formData.get("consentPersonal") === "on",
    unique: formData.get("consentUnique") === "on",
    thirdParty: formData.get("consentThirdParty") === "on",
  };

  const confirm = formData.get("confirm") === "on";

  await prisma.laborClaim.update({
    where: { id: claimId },
    data: {
      affiliation,
      name,
      phone,
      address,
      bankName,
      accountNumber,
      rrnEnc,
      entries: entries as unknown as Prisma.InputJsonValue,
      totalAmount,
      consent,
      signatureUrl,
      status: confirm ? "CONFIRMED" : "DRAFT",
      confirmedAt: confirm ? new Date() : null,
    },
  });

  revalidatePath(`${PAYROLL_PATH}/admin/${claim.batchId}`);
  redirect(`${PAYROLL_PATH}/admin/${claim.batchId}`);
}

/** [청구서 삭제: ADMIN] */
export async function deleteClaim(formData: FormData) {
  const me = await getMe();
  if (!me || !isAdmin(me.role)) return;

  const claimId = (formData.get("claimId") as string) || "";
  if (!claimId) return;
  const claim = await prisma.laborClaim.findUnique({ where: { id: claimId } });
  if (!claim) return;

  await prisma.laborClaim.delete({ where: { id: claimId } });
  revalidatePath(`${PAYROLL_PATH}/admin/${claim.batchId}`);
  redirect(`${PAYROLL_PATH}/admin/${claim.batchId}`);
}
