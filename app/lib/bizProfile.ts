/**
 * 기업 사업자 정보(BizProfile) 조회·저장.
 * Order.biz* 는 발주 시점 값이므로 프로필을 고쳐도 기존 발주는 바꾸지 않는다.
 */

import { prisma } from "../db";
import { isValidBizNo, normalizeBizNo } from "./bizNo";
import type { BizState } from "./popbill";

/**
 * 사업자 상태로 거래를 막는지. 폐업·미등록만 막고 휴업은 통과시킨다.
 * null(조회 못 함)은 팝빌 미설정·장애일 수 있으므로 막지 않는다.
 * 거래 게이트와 발주 생성이 모두 이 함수로 판정한다.
 */
export function bizStateBlocks(state: string | null | undefined): boolean {
  return state === "폐업" || state === "미등록";
}

export interface BizProfileView {
  bizNo: string;
  bizName: string;
  bizCeo: string;
  bizAddr: string;
  bizEmail: string;
  /** 세금계산서를 끊을 수 있는 최소 조건. `createOrderAction` 의 필수 판정과 같다. */
  invoiceReady: boolean;
  /** 발주 권한 확인에 동의한 시각. 거래 게이트에는 쓰지 않는다. */
  attestedAt: Date | null;
  /** 팝빌로 확인한 사업자 상태. null 은 아직 확인하지 못한 것(미등록과 다르다). */
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
    // 잘못된 번호는 발행 시점에야 팝빌에서 거부되므로 미리 체크섬으로 본다.
    invoiceReady: isValidBizNo(row.bizNo) && !!row.bizName && !!row.bizEmail,
    attestedAt: row.attestedAt,
    bizState: row.bizState,
    bizVerifiedAt: row.bizVerifiedAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * 발주·견적서를 낼 수 있는지. 유효한 사업자등록번호가 있고 상태가 막히지 않았거나 ADMIN.
 *
 * 체크섬은 임의로 만든 번호도 통과하므로 저장 시점에 팝빌로 확인한 bizState 도 본다.
 * 판정 때마다 유료 조회를 하지 않도록 저장된 값만 읽는다.
 * 교원·조교는 사업자번호가 없으므로 평가 만들기·서비스 등록에는 이 조건을 쓰지 않는다.
 */
export async function canTransact(user: { id: string; role: string } | null): Promise<boolean> {
  if (!user) return false;
  if (user.role === "ADMIN") return true;

  const row = await prisma.bizProfile.findUnique({
    where: { userId: user.id },
    select: { bizNo: true, bizState: true },
  });
  if (!isValidBizNo(row?.bizNo)) return false;
  // null(확인 못 함)은 통과시킨다.
  return !bizStateBlocks(row?.bizState);
}

export interface BizSaveInput {
  bizNo: string;
  bizName: string;
  bizCeo: string;
  bizAddr: string;
  bizEmail: string;
  /** 발주 권한 확인 체크. undefined 면 기존 값을 유지한다(체크박스가 없는 폼이 지우지 않도록). */
  attested?: boolean;
  /**
   * 팝빌 조회 결과. 중복 과금을 피하려고 조회는 호출부가 한다.
   * BizState(확인됨) · null(조회 실패) · undefined(변경 없음)
   */
  bizState?: BizState | null;
}

/** 저장(upsert). 사업자번호는 숫자만 남겨 저장한다. */
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

  // attestedAt: 체크하면 지금 시각, 번호가 바뀌면 비움, 그 외에는 유지.
  const attestedAt: Date | null | undefined =
    input.attested === true ? new Date() : numberChanged ? null : undefined;

  // bizState: 조회 결과가 있으면 그 값과 시각, 번호가 바뀌면 비움, 그 외에는 유지.
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
