/**
 * 정산 정보(계좌·주소·주민번호) 조회·저장. 저장 대상은 PayrollProfile 이고 노무비와 공유한다.
 *
 * 계좌(은행+번호)만 있으면 이체할 수 있다. 주민번호는 지급명세서 신고용이라 이체를 막지 않는다.
 */

import { prisma } from "../db";
import { encryptRRN, decryptRRN, maskRRN } from "./crypto";

/** 화면에 내려보내는 형태. 주민번호는 마스킹 값만 담는다. */
export interface SettlementProfileView {
  bankName: string;
  accountNumber: string;
  /** 예금주. 비어 있으면 본인 이름을 쓴다(generatePayouts). */
  holderName: string;
  address: string;
  /** 전자서명 이미지 URL. 노무비 청구 확인서(PDF)에만 쓴다. */
  signatureUrl: string;
  /** 주민번호 등록 여부 + 마스킹 표시. 평문은 지급명세서 API(ADMIN)에서만 복호화한다. */
  hasRrn: boolean;
  rrnMasked: string;
  /** 계좌가 다 있어 이체가 가능한가. generatePayouts() 의 통과 조건과 같다. */
  payoutReady: boolean;
  /** 지급명세서를 낼 수 있는가 (주민번호 필요) */
  withholdingReady: boolean;
  consentAt: Date | null;
  /** 관리자가 대신 입력한 값인가(본인 확인 필요) */
  byAdmin: boolean;
  updatedAt: Date | null;
}

const EMPTY: SettlementProfileView = {
  bankName: "",
  accountNumber: "",
  holderName: "",
  address: "",
  signatureUrl: "",
  hasRrn: false,
  rrnMasked: "",
  payoutReady: false,
  withholdingReady: false,
  consentAt: null,
  byAdmin: false,
  updatedAt: null,
};

type Row = {
  bankName: string | null;
  accountNumber: string | null;
  holderName: string | null;
  address: string | null;
  signatureUrl: string | null;
  rrnEnc: string | null;
  consentAt: Date | null;
  updatedByAdminId: string | null;
  updatedAt: Date;
};

/**
 * DB 행 → 화면용. 주민번호는 마스킹을 만들 때만 복호화한다.
 * 복호화에 실패하면 "등록됨"으로만 표시한다.
 */
export function toView(row: Row | null): SettlementProfileView {
  if (!row) return EMPTY;

  const bankName = row.bankName ?? "";
  const accountNumber = row.accountNumber ?? "";
  const hasRrn = !!row.rrnEnc;

  let rrnMasked = "";
  if (hasRrn) {
    try {
      rrnMasked = maskRRN(decryptRRN(row.rrnEnc));
    } catch {
      rrnMasked = "등록됨";
    }
  }

  return {
    bankName,
    accountNumber,
    holderName: row.holderName ?? "",
    address: row.address ?? "",
    signatureUrl: row.signatureUrl ?? "",
    hasRrn,
    rrnMasked,
    payoutReady: !!bankName && !!accountNumber,
    withholdingReady: hasRrn,
    consentAt: row.consentAt,
    byAdmin: !!row.updatedByAdminId,
    updatedAt: row.updatedAt,
  };
}

const SELECT = {
  bankName: true,
  accountNumber: true,
  holderName: true,
  address: true,
  signatureUrl: true,
  rrnEnc: true,
  consentAt: true,
  updatedByAdminId: true,
  updatedAt: true,
} as const;

/** 한 사람의 정산 정보 */
export async function getSettlementProfile(userId: string): Promise<SettlementProfileView> {
  const row = await prisma.payrollProfile.findUnique({
    where: { userId },
    select: SELECT,
  });
  return toView(row);
}

export interface SaveInput {
  bankName: string;
  accountNumber: string;
  /** 빈 문자열이면 "본인 이름과 같다"로 저장한다(NULL). */
  holderName: string;
  address: string;
  /** 빈 문자열이면 기존 값을 유지한다 */
  rrn: string;
  /** 본인이 저장할 때만 true */
  consented: boolean;
  /**
   * 전자서명 이미지 URL. undefined 면 유지하고 빈 문자열이면 지운다.
   * 서명 칸이 없는 관리자 대리입력 폼이 기존 서명을 지우지 않게 하려는 것이다.
   */
  signatureUrl?: string;
}

/** 저장. byAdminId 가 있으면 대리입력으로 기록하고, 본인이 저장하면 대리입력 표시를 지운다. */
export async function saveSettlementProfile(
  userId: string,
  input: SaveInput,
  byAdminId?: string,
): Promise<void> {
  const bankName = input.bankName.trim();
  // 계좌번호는 숫자만 저장한다.
  const accountNumber = input.accountNumber.replace(/[^0-9]/g, "");
  // 빈 값은 NULL(예금주 = 본인)로 저장한다.
  const holderName = input.holderName.trim() || null;
  const address = input.address.trim();
  const rrnDigits = input.rrn.replace(/[^0-9]/g, "");

  const data: {
    bankName: string;
    accountNumber: string;
    holderName: string | null;
    address: string;
    signatureUrl?: string | null;
    rrnEnc?: string;
    consentAt?: Date | null;
    updatedByAdminId: string | null;
    updatedByAdminAt: Date | null;
  } = {
    bankName,
    accountNumber,
    holderName,
    address,
    updatedByAdminId: byAdminId ?? null,
    updatedByAdminAt: byAdminId ? new Date() : null,
  };

  // 13자리를 모두 입력했을 때만 덮어쓴다.
  if (rrnDigits.length === 13) data.rrnEnc = encryptRRN(rrnDigits);

  // 폼이 서명 칸을 보냈을 때만 바꾼다.
  if (input.signatureUrl !== undefined) data.signatureUrl = input.signatureUrl.trim() || null;

  // 동의는 본인이 체크했을 때만 기록한다(대리입력으로는 채우지 않는다).
  if (!byAdminId && input.consented) data.consentAt = new Date();

  await prisma.payrollProfile.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });
}

/** 관리자 명단용 한 줄 */
export interface ProfileStatusRow {
  userId: string;
  name: string;
  studentId: string;
  profile: SettlementProfileView;
  /** 아직 지급되지 않은 보상 건수(정렬에 쓴다) */
  pendingRewards: number;
  /** 보상이 한 번이라도 있었나 (없으면 아직 지급 대상이 아니다) */
  hasRewards: boolean;
}

/**
 * [ADMIN] 정산 정보 관리 명단.
 * 대상: 평가단(role=USER) 전원 ∪ 보상이 있는 사람 ∪ 정산 정보를 입력한 사람
 */
export async function listProfileStatus(): Promise<ProfileStatusRow[]> {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { role: "USER" },
        { rewards: { some: {} } },
        { payrollProfile: { isNot: null } },
      ],
    },
    select: {
      id: true,
      name: true,
      studentId: true,
      payrollProfile: { select: SELECT },
      rewards: { select: { status: true } },
    },
    orderBy: { name: "asc" },
  });

  return users
    .map((u) => ({
      userId: u.id,
      name: u.name,
      studentId: u.studentId,
      profile: toView(u.payrollProfile),
      pendingRewards: u.rewards.filter((r) => r.status !== "PAID" && r.status !== "REJECTED").length,
      hasRewards: u.rewards.length > 0,
    }))
    .sort((a, b) => {
      // 미입력 + 지급 대기가 있는 사람이 맨 위. 그다음 미입력, 그다음 이름순.
      const rank = (r: ProfileStatusRow) =>
        r.profile.payoutReady ? 2 : r.pendingRewards > 0 ? 0 : 1;
      const d = rank(a) - rank(b);
      return d !== 0 ? d : a.name.localeCompare(b.name);
    });
}
