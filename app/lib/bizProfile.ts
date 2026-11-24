import { prisma } from "../db";
import { isValidBizNo, normalizeBizNo } from "./bizNo";
import type { BizState } from "./popbill";

// null(조회 실패)은 차단하지 않고 폐업·미등록만 차단
export function bizStateBlocks(state: string | null | undefined): boolean {
  return state === "폐업" || state === "미등록";
}

export interface BizProfileView {
  bizNo: string;
  bizName: string;
  bizCeo: string;
  bizAddr: string;
  bizEmail: string;
  invoiceReady: boolean;
  attestedAt: Date | null;
  bizState: string | null;
  bizVerifiedAt: Date | null;
  updatedAt: Date | null;
}

const EMPTY: BizProfileView = {
  bizNo: "",
  bizName: "",
  bizCeo: "",
  bizAddr: "",
  bizEmail: "",
  invoiceReady: false,
  attestedAt: null,
  bizState: null,
  bizVerifiedAt: null,
  updatedAt: null,
};

export async function getBizProfile(userId: string): Promise<BizProfileView> {
  const row = await prisma.bizProfile.findUnique({ where: { userId } });
  if (!row) return EMPTY;
  return {
    bizNo: row.bizNo,
    bizName: row.bizName,
    bizCeo: row.bizCeo,
    bizAddr: row.bizAddr,
    bizEmail: row.bizEmail,
    invoiceReady: isValidBizNo(row.bizNo) && !!row.bizName && !!row.bizEmail,
    attestedAt: row.attestedAt,
    bizState: row.bizState,
    bizVerifiedAt: row.bizVerifiedAt,
    updatedAt: row.updatedAt,
  };
}

export async function canTransact(user: { id: string; role: string } | null): Promise<boolean> {
  if (!user) return false;
  if (user.role === "ADMIN") return true;

  const row = await prisma.bizProfile.findUnique({
    where: { userId: user.id },
    select: { bizNo: true, bizState: true },
  });
  if (!isValidBizNo(row?.bizNo)) return false;
  return !bizStateBlocks(row?.bizState);
}

export interface BizSaveInput {
  bizNo: string;
  bizName: string;
  bizCeo: string;
  bizAddr: string;
  bizEmail: string;
  attested?: boolean;
  bizState?: BizState | null;
}

export async function saveBizProfile(userId: string, input: BizSaveInput): Promise<void> {
  const data = {
    bizNo: normalizeBizNo(input.bizNo),
    bizName: input.bizName.trim(),
    bizCeo: input.bizCeo.trim(),
    bizAddr: input.bizAddr.trim(),
    bizEmail: input.bizEmail.trim(),
  };

  const prev = await prisma.bizProfile.findUnique({
    where: { userId },
    select: { bizNo: true },
  });
  const numberChanged = !!prev && prev.bizNo !== data.bizNo;

  const attestedAt: Date | null | undefined =
    input.attested === true ? new Date() : numberChanged ? null : undefined;

  const verification =
    input.bizState !== undefined
      ? { bizState: input.bizState, bizVerifiedAt: input.bizState ? new Date() : null }
      : numberChanged
        ? { bizState: null, bizVerifiedAt: null }
        : {};

  await prisma.bizProfile.upsert({
    where: { userId },
    update: { ...data, ...(attestedAt !== undefined ? { attestedAt } : {}), ...verification },
    create: {
      userId,
      ...data,
      attestedAt: input.attested === true ? new Date() : null,
      bizState: input.bizState ?? null,
      bizVerifiedAt: input.bizState ? new Date() : null,
    },
  });
}
