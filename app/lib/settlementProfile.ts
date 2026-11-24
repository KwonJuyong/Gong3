import { prisma } from "../db";
import { encryptRRN, decryptRRN, maskRRN } from "./crypto";

export interface SettlementProfileView {
  bankName: string;
  accountNumber: string;
  holderName: string;
  address: string;
  signatureUrl: string;
  hasRrn: boolean;
  rrnMasked: string;
  payoutReady: boolean;
  withholdingReady: boolean;
  consentAt: Date | null;
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
  holderName: string;
  address: string;
  rrn: string;
  consented: boolean;
  signatureUrl?: string;
}

export async function saveSettlementProfile(
  userId: string,
  input: SaveInput,
  byAdminId?: string,
): Promise<void> {
  const bankName = input.bankName.trim();
  const accountNumber = input.accountNumber.replace(/[^0-9]/g, "");
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

  if (rrnDigits.length === 13) data.rrnEnc = encryptRRN(rrnDigits);
  // undefined면 기존 서명 유지(서명 칸이 없는 관리자 대리입력 폼 보호)
  if (input.signatureUrl !== undefined) data.signatureUrl = input.signatureUrl.trim() || null;
  if (!byAdminId && input.consented) data.consentAt = new Date();

  await prisma.payrollProfile.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });
}

export interface ProfileStatusRow {
  userId: string;
  name: string;
  studentId: string;
  profile: SettlementProfileView;
  pendingRewards: number;
  hasRewards: boolean;
}

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
      const rank = (r: ProfileStatusRow) =>
        r.profile.payoutReady ? 2 : r.pendingRewards > 0 ? 0 : 1;
      const d = rank(a) - rank(b);
      return d !== 0 ? d : a.name.localeCompare(b.name);
    });
}
