"use server";

/**
 * 프로필 화면의 서버 액션(정산 정보·사업자 정보·조직 설정).
 * 저장 결과는 ?tab=<t>&saved=1 또는 &error= 로 돌려주고 page.tsx 가 안내를 띄운다.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "../../db";
import { saveSettlementProfile } from "../../lib/settlementProfile";
import { saveBizProfile, getBizProfile, bizStateBlocks } from "../../lib/bizProfile";
import { isValidBizNo, normalizeBizNo, BIZ_NO_ERROR } from "../../lib/bizNo";
import {
  checkBizInfo,
  bizStateFromCloseDown,
  isConfigured as popbillReady,
  type BizState,
} from "../../lib/popbill";
import { saveQuoteSupplier, savePlatformAccount } from "../../lib/orgSettings";

const PROFILE = "/dashboard/profile";

function backTo(tab: string, error?: string): never {
  const q = error ? `error=${encodeURIComponent(error)}` : "saved=1";
  redirect(`${PROFILE}?tab=${tab}&${q}`);
}

const str = (fd: FormData, k: string) => ((fd.get(k) as string) || "").trim();

/**
 * [본인] 정산 정보 저장: 계좌·예금주·주소·주민번호·동의·전자서명.
 * 이 폼은 signatureUrl 을 항상 보낸다(빈 값이면 삭제).
 */
export async function saveMyProfileSettlementAction(formData: FormData) {
  const me = await getSessionUser();
  if (!me) backTo("settlement", "인증이 필요합니다.");

  const bankName = str(formData, "bankName");
  const accountNumber = str(formData, "accountNumber");
  if (!bankName || !accountNumber) backTo("settlement", "은행과 계좌번호는 필수입니다.");

  // 주민번호를 일부만 입력했으면 저장하지 않고 알려준다.
  const rrn = str(formData, "rrn");
  const rrnDigits = rrn.replace(/[^0-9]/g, "");
  if (rrnDigits.length > 0 && rrnDigits.length !== 13) {
    backTo("settlement", "주민등록번호는 13자리를 모두 입력해야 저장됩니다.");
  }

  await saveSettlementProfile(me.id, {
    bankName,
    accountNumber,
    holderName: str(formData, "holderName"),
    address: str(formData, "address"),
    rrn,
    consented: str(formData, "consent") === "1",
    signatureUrl: str(formData, "signatureUrl"),
  });

  revalidatePath(PROFILE);
  revalidatePath("/dashboard"); // 좌측 "내 보상" 패널의 계좌 상태
  backTo("settlement");
}

/**
 * [본인] 사업자 정보 저장(발주 폼·견적서·세금계산서 프리필용).
 * 발주 권한이 이 번호로 정해지므로 역할과 관계없이 누구나 저장할 수 있다.
 */
export async function saveMyBizProfileAction(formData: FormData) {
  const me = await getSessionUser();
  if (!me) backTo("biz", "인증이 필요합니다.");

  const bizNo = normalizeBizNo(str(formData, "bizNo"));
  // 사업자번호 체크섬 확인
  if (!isValidBizNo(bizNo)) backTo("biz", BIZ_NO_ERROR);

  // 발주 권한 확인 체크(기록용). 폼의 required 와 별개로 서버에서도 확인한다.
  if (str(formData, "attest") !== "1") {
    backTo("biz", "해당 사업자 명의로 발주할 권한이 있는지 확인에 동의해 주세요.");
  }

  // 사업자 실재 확인(팝빌, 50원/건). 체크섬만으로는 임의로 만든 번호를 거르지 못한다.
  // 결과는 bizState 에 저장하고 canTransact 는 그 값을 읽는다.
  // 번호가 그대로이고 이미 확인했으면 다시 조회하지 않고, 조회에 실패해도(null) 저장은 막지 않는다.
  const prev = await getBizProfile(me.id);
  let bizState: BizState | null | undefined;
  if (popbillReady() && (prev.bizNo !== bizNo || !prev.bizVerifiedAt)) {
    try {
      const info = await checkBizInfo(bizNo);
      bizState = bizStateFromCloseDown(info.closeDownState);
    } catch {
      bizState = null; // 일시 장애·상품 미활성(확인하지 못함)
    }
  }

  // 폐업·미등록이면 저장 단계에서 알린다(null 은 통과).
  if (bizStateBlocks(bizState)) {
    backTo("biz", `국세청에 '${bizState}'로 조회되는 사업자등록번호입니다. 번호를 확인해 주세요.`);
  }

  await saveBizProfile(me.id, {
    bizNo,
    bizName: str(formData, "bizName"),
    bizCeo: str(formData, "bizCeo"),
    bizAddr: str(formData, "bizAddr"),
    bizEmail: str(formData, "bizEmail"),
    attested: true,
    bizState,
  });

  revalidatePath(PROFILE);
  revalidatePath("/dashboard/orders"); // 발주 폼 프리필
  backTo("biz");
}

/** [ADMIN] 견적서 공급자(플랫폼) 정보 저장 */
export async function saveQuoteSupplierAction(formData: FormData) {
  const me = await getSessionUser();
  if (!me || me.role !== "ADMIN") backTo("org", "권한이 없습니다.");

  await saveQuoteSupplier({
    name: str(formData, "name"),
    bizNo: str(formData, "bizNo"),
    ceo: str(formData, "ceo"),
    addr: str(formData, "addr"),
    contact: str(formData, "contact"),
    sealUrl: str(formData, "sealUrl"),
  });

  revalidatePath(PROFILE);
  revalidatePath("/dashboard/orders");
  backTo("org");
}

/** [ADMIN] 기업에게 안내할 입금 계좌. 발주 상세·견적서가 읽는다. */
export async function savePlatformAccountAction(formData: FormData) {
  const me = await getSessionUser();
  if (!me || me.role !== "ADMIN") backTo("org", "권한이 없습니다.");

  await savePlatformAccount({
    bank: str(formData, "bank"),
    bankCode: str(formData, "bankCode"),
    account: str(formData, "account"),
    holder: str(formData, "holder"),
  });

  revalidatePath(PROFILE);
  revalidatePath("/dashboard/orders");
  backTo("org");
}
