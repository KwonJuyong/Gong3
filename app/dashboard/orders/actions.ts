"use server";

import { getSessionUserId } from "@/app/session-server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "../../db";
// 최저단가는 견적서와 같은 함수로 적용함
import { enforceFloor } from "../../lib/quoteTiers";
import {
  computeOrderAmounts,
  formatOrderNo,
  DEFAULT_FEE_RATE_BP,
} from "../../lib/money";
import {
  confirmDeposit,
  cancelPayment,
  confirmPaymentRefundSent,
  markTaxInvoiceAmended,
  issueInvoiceForPayment,
  syncDeposits,
  syncTaxInvoiceStates,
} from "../../lib/payments";
import {
  checkBizInfo,
  bizStateFromCloseDown,
  isConfigured as popbillReady,
  type BizState,
} from "../../lib/popbill";
import { getPlatformAccount } from "../../lib/orgSettings";
import { saveBizProfile, canTransact, bizStateBlocks } from "../../lib/bizProfile";
import { isValidBizNo, normalizeBizNo, BIZ_NO_ERROR } from "../../lib/bizNo";
import { checkBizLookupQuota, checkLimit } from "../../lib/limits";
import { checkReauth } from "../../lib/reauth";

const ORDERS_PATH = "/dashboard/orders";

async function getMe() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

// 발주·견적서 권한 판정은 canTransact 가 함. 이 함수는 관리자 전용 조작에만 씀
function isAdmin(role: string) {
  return role === "ADMIN";
}



/**
 * 금액은 서버에서만 계산함(클라이언트 금액은 쓰지 않음).
 * 계좌이체만 받으므로 발주와 함께 입금 대기(Payment PENDING)를 만듦
 */
export async function createOrderAction(formData: FormData) {
  const me = await getMe();
  if (!me || !(await canTransact(me))) return;

  const serviceId = ((formData.get("serviceId") as string) || "").trim();
  const panelSize = parseInt((formData.get("panelSize") as string) || "0", 10);
  const rawReward = parseInt((formData.get("rewardPerPerson") as string) || "0", 10);

  if (!serviceId || !Number.isFinite(panelSize) || !Number.isFinite(rawReward)) return;
  if (panelSize < 1 || panelSize > 500) return;
  if (rawReward < 1000 || rawReward > 1_000_000) return;

  // 최저단가는 서버에서도 적용함. itemTier 는 추가 회차 줄과 같은 이름이라 발주는 첫 줄만 get() 으로 읽음
  const tierKey = ((formData.get("itemTier") as string) || "").trim();
  const rewardPerPerson = tierKey ? enforceFloor(tierKey, rawReward) : rawReward;

  // 수수료율은 ADMIN 만 정할 수 있음. 견적서와 같은 값을 쓰도록 폼 값을 읽음
  const rawFeeRateBp = parseInt((formData.get("feeRateBp") as string) || "", 10);
  const feeRateBp =
    me.role === "ADMIN" && Number.isFinite(rawFeeRateBp) && rawFeeRateBp >= 0 && rawFeeRateBp <= 10000
      ? rawFeeRateBp
      : DEFAULT_FEE_RATE_BP;

  // 세금계산서 공급받는자 정보 (팝빌 발행에 필요)
  const bizNo = normalizeBizNo((formData.get("bizNo") as string) || "");
  const bizName = ((formData.get("bizName") as string) || "").trim();
  const bizCeo = ((formData.get("bizCeo") as string) || "").trim();
  const bizAddr = ((formData.get("bizAddr") as string) || "").trim();
  const bizEmail = ((formData.get("bizEmail") as string) || "").trim();

  // 유료 조회 전에 체크섬으로 사업자번호 형식을 확인함
  if (!isValidBizNo(bizNo) || !bizName || !bizEmail) {
    redirect(
      `${ORDERS_PATH}?error=${encodeURIComponent(
        isValidBizNo(bizNo) ? "상호와 이메일은 필수입니다." : BIZ_NO_ERROR,
      )}`,
    );
  }

  // 폐업·미등록 사업자는 발주 전에 거름(팝빌 미설정이면 통과).
  // redirect() 는 예외를 던지므로 조회만 try 안에서 하고 차단 판정은 try 밖에서 함
  // undefined(조회 안 함)와 null(조회 실패)을 구분해 saveBizProfile 이 이전 확인 결과를 지우지 않게 함
  const orderLimit = checkLimit("orderCreate", me.id);
  if (orderLimit) redirect(`${ORDERS_PATH}?error=${encodeURIComponent(orderLimit)}`);
  let bizState: BizState | null | undefined;
  // 조회 한도를 넘으면 조회만 건너뜀(undefined). 발행 시점에 다시 검증됨
  if (popbillReady() && !checkBizLookupQuota(me.id)) {
    try {
      const info = await checkBizInfo(bizNo);
      bizState = bizStateFromCloseDown(info.closeDownState);
    } catch {
      // 조회 실패는 발주를 막지 않음(발행 시점에 다시 검증됨).
      bizState = null;
    }
  }
  // canTransact 와 같은 기준(bizStateBlocks)으로 판정함
  if (bizStateBlocks(bizState)) {
    redirect(
      `${ORDERS_PATH}?error=${encodeURIComponent(`사업자등록번호 상태가 '${bizState}'입니다. 확인해 주세요.`)}`,
    );
  }

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) return;
  if (service.ownerId !== me.id && me.role !== "ADMIN") return;

  const amounts = computeOrderAmounts(panelSize, rewardPerPerson, feeRateBp);

  const order = await createWithOrderNo(async (orderNo) =>
    prisma.order.create({
      data: {
        orderNo,
        serviceId,
        buyerId: me.id,
        bizNo,
        bizName,
        bizCeo,
        bizAddr,
        bizEmail,
        panelSize,
        rewardPerPerson,
        feeRateBp,
        ...amounts,
        status: "PENDING", // 발주 즉시 입금 대기
        payments: {
          create: {
            provider: "manual",
            ref: orderNo, // 입금 대사용 = 발주번호
            method: "BANK_TRANSFER",
            amount: amounts.totalAmount,
            status: "PENDING",
          },
        },
      },
    }),
  );

  // 발주에 쓴 사업자 정보를 프로필에도 저장함(다음 발주 프리필용).
  // 저장에 실패해도 발주는 이미 만들어졌으므로 막지 않음
  try {
    // 방금 조회한 bizState 를 넘겨 같은 번호를 다시 조회하지 않게 함
    // 이 폼에는 확인 체크박스가 없으므로 attested 는 넘기지 않음(기존 기록 유지).
    await saveBizProfile(me.id, { bizNo, bizName, bizCeo, bizAddr, bizEmail, bizState });
  } catch {
    // 프리필 편의 기능이라 조용히 넘어감. 프로필 화면에서 직접 저장할 수 있음
  }

  revalidatePath(ORDERS_PATH);
  redirect(`${ORDERS_PATH}/${order.id}`);
}

/** orderNo(=Payment.ref)는 날짜별 일련번호라 동시에 만들면 충돌할 수 있어 재시도함 */
async function createWithOrderNo<T>(create: (orderNo: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const todayCount = await prisma.order.count({
      where: { createdAt: { gte: startOfSeoulToday() } },
    });
    try {
      return await create(formatOrderNo(todayCount + 1 + attempt));
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e; // unique 충돌만 재시도
    }
  }
  throw new Error("주문번호 채번에 실패했습니다. 다시 시도해주세요.");
}

function startOfSeoulToday(): Date {
  const seoul = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date());
  return new Date(`${seoul}T00:00:00+09:00`);
}


/** 통장에서 입금을 확인하고 발주를 확정함 */
export async function confirmDepositAction(formData: FormData) {
  const me = await getMe();
  if (!me || !isAdmin(me.role)) return;

  const paymentId = ((formData.get("paymentId") as string) || "").trim();
  if (!paymentId) return;

  const depositorName = ((formData.get("depositorName") as string) || "").trim() || undefined;
  const memo = ((formData.get("memo") as string) || "").trim() || undefined;

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return;

  // 원장 기록과 세금계산서 발행이 이어져 되돌릴 수 없음
  const reauthErr = await checkReauth(me, formData);
  if (reauthErr) redirect(`${ORDERS_PATH}/${payment.orderId}?error=${encodeURIComponent(reauthErr)}`);

  await confirmDeposit(paymentId, me.id, { depositorName, memo });
  // 입금 확정 후 세금계산서 발행(실패해도 수납은 유지됨)
  await issueInvoiceForPayment(paymentId);

  revalidatePath(`${ORDERS_PATH}/${payment.orderId}`);
  redirect(`${ORDERS_PATH}/${payment.orderId}`);
}

export interface BizLookupResult {
  ok: boolean;
  error?: string;
  corpName?: string;
  ceoName?: string;
  addr?: string;
}

/**
 * 사업자번호로 상호·대표자·주소를 조회함(팝빌, 50원/건). 실패하면 직접 입력함
 *
 * 사업자번호를 입력하는 단계라 canTransact 로 막지 않음. 대신 유료 호출 전에 체크섬을 확인하고,
 * 계정당 하루 20회로 제한함(인메모리 카운터라 재시작하면 초기화됨).
 * 오타가 한도를 쓰지 않도록 체크섬을 먼저 봄
 */
export async function lookupBizAction(bizNoRaw: string): Promise<BizLookupResult> {
  const me = await getMe();
  if (!me) return { ok: false, error: "인증이 필요합니다." };

  const bizNo = normalizeBizNo(bizNoRaw);
  if (!isValidBizNo(bizNo)) return { ok: false, error: BIZ_NO_ERROR };

  if (!popbillReady()) return { ok: false, error: "팝빌 미설정: 직접 입력해 주세요." };

  const rlMsg = checkBizLookupQuota(me.id);
  if (rlMsg) return { ok: false, error: rlMsg };

  try {
    const info = await checkBizInfo(bizNo);
    const state = bizStateFromCloseDown(info.closeDownState);
    if (state === "폐업" || state === "미등록") {
      return { ok: false, error: `사업자등록번호 상태가 '${state}'입니다. 확인해 주세요.` };
    }
    if (!info.corpName) {
      return { ok: false, error: "조회 결과가 없습니다. 직접 입력해 주세요." };
    }
    return { ok: true, corpName: info.corpName, ceoName: info.ceoName, addr: info.addr };
  } catch {
    // 상품 미활성·일시 장애 등은 직접 입력으로 안내함
    return { ok: false, error: "조회에 실패했습니다. 직접 입력해 주세요." };
  }
}

/**
 * 입금 확인 전에도 호출할 수 있음
 * 발급 시기는 공급시기(용역 완료) 기준이라 입금을 기다리지 않음. 이중 발행은
 * issueInvoiceForPayment 가 taxInvoiceIssued 로 막음
 */
export async function retryInvoiceAction(formData: FormData) {
  const me = await getMe();
  if (!me || !isAdmin(me.role)) return;

  const paymentId = ((formData.get("paymentId") as string) || "").trim();
  if (!paymentId) return;

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return;

  // 운영에서는 실제 국세청 신고로 이어져 되돌릴 수 없음
  const reauthErr = await checkReauth(me, formData);
  if (reauthErr) redirect(`${ORDERS_PATH}/${payment.orderId}?error=${encodeURIComponent(reauthErr)}`);

  await issueInvoiceForPayment(paymentId);
  revalidatePath(`${ORDERS_PATH}/${payment.orderId}`);
  redirect(`${ORDERS_PATH}/${payment.orderId}`);
}

/** 팝빌 계좌조회로 대기 발주를 자동 매칭·확정 */
export async function syncDepositsAction(formData: FormData) {
  const me = await getMe();
  if (!me || !isAdmin(me.role)) return;

  // 1:1 매칭 건은 입금 확정과 함께 세금계산서가 발행됨
  const reauthErr = await checkReauth(me, formData);
  if (reauthErr) redirect(`${ORDERS_PATH}?error=${encodeURIComponent(reauthErr)}`);
  const jobLimit = checkLimit("adminJob", me.id);
  if (jobLimit) redirect(`${ORDERS_PATH}?error=${encodeURIComponent(jobLimit)}`);

  const acct = await getPlatformAccount();
  if (!acct.bankCode || !acct.account) {
    redirect(`${ORDERS_PATH}?error=${encodeURIComponent("입금계좌·은행코드를 먼저 설정하세요.")}`);
  }
  if (!popbillReady()) {
    redirect(`${ORDERS_PATH}?error=${encodeURIComponent("팝빌이 설정되지 않았습니다.")}`);
  }

  // redirect()는 never 를 반환하므로 성공 리다이렉트는 try 밖에 둠
  let r: { matched: number; ambiguous: number };
  try {
    r = await syncDeposits(me.id, acct.bankCode, acct.account);
  } catch {
    redirect(`${ORDERS_PATH}?error=${encodeURIComponent("입금내역 조회 실패")}`);
  }
  redirect(`${ORDERS_PATH}?synced=${r.matched}&ambiguous=${r.ambiguous}`);
}

/**
 * 304(성공)/305(실패)를 조회해 반영함
 * 평소에는 크론이 하루 한 번 돌리고, 발행 직후 바로 확인할 때 이 버튼을 씀
 */
export async function syncInvoiceStatesAction() {
  const me = await getMe();
  if (!me || !isAdmin(me.role)) return;

  if (!popbillReady()) {
    redirect(`${ORDERS_PATH}?error=${encodeURIComponent("팝빌이 설정되지 않았습니다.")}`);
  }
  const jobLimit = checkLimit("adminJob", me.id);
  if (jobLimit) redirect(`${ORDERS_PATH}?error=${encodeURIComponent(jobLimit)}`);

  // redirect()는 never 를 반환하므로 성공 리다이렉트는 try 밖에 둠
  let r: { checked: number; updated: number; failed: number; errors: number };
  try {
    r = await syncTaxInvoiceStates();
  } catch {
    redirect(`${ORDERS_PATH}?error=${encodeURIComponent("전송결과 조회 실패")}`);
  }
  redirect(`${ORDERS_PATH}?ntsChecked=${r.checked}&ntsFailed=${r.failed}`);
}

export async function cancelPaymentAction(formData: FormData) {
  const me = await getMe();
  if (!me || !isAdmin(me.role)) return;

  const paymentId = ((formData.get("paymentId") as string) || "").trim();
  const reason = ((formData.get("reason") as string) || "관리자 취소").trim();
  if (!paymentId) return;

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return;

  const r = await cancelPayment(paymentId, reason);
  revalidatePath(`${ORDERS_PATH}/${payment.orderId}`);
  // 이미 지급된 보상이 있어 취소하지 못한 경우 사유를 보여줌
  if (r.blockedReason) {
    redirect(`${ORDERS_PATH}/${payment.orderId}?error=${encodeURIComponent(r.blockedReason)}`);
  }
  redirect(`${ORDERS_PATH}/${payment.orderId}`);
}

/** 취소한 수납액을 돌려준 뒤 누름. 이때 원장에 환불을 기록함 */
export async function confirmPaymentRefundSentAction(formData: FormData) {
  const me = await getMe();
  if (!me || !isAdmin(me.role)) return;

  const paymentId = ((formData.get("paymentId") as string) || "").trim();
  if (!paymentId) return;

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return;

  await confirmPaymentRefundSent(paymentId);
  revalidatePath(`${ORDERS_PATH}/${payment.orderId}`);
  redirect(`${ORDERS_PATH}/${payment.orderId}`);
}

/** 수정세금계산서 발행 완료 기록. 발행은 팝빌·홈택스에서 직접 함 */
export async function markTaxInvoiceAmendedAction(formData: FormData) {
  const me = await getMe();
  if (!me || !isAdmin(me.role)) return;

  const paymentId = ((formData.get("paymentId") as string) || "").trim();
  if (!paymentId) return;

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return;

  await markTaxInvoiceAmended(paymentId);
  revalidatePath(`${ORDERS_PATH}/${payment.orderId}`);
  redirect(`${ORDERS_PATH}/${payment.orderId}`);
}

