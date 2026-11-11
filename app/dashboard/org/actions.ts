"use server";

/** 조직 설정 화면의 서버 액션. 결과는 ?saved=1 또는 ?error= 로 돌려줌 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "../../db";
import { saveQuoteSupplier, savePlatformAccount } from "../../lib/orgSettings";

const ORG = "/dashboard/org";

function back(error?: string): never {
  redirect(error ? `${ORG}?error=${encodeURIComponent(error)}` : `${ORG}?saved=1`);
}

const str = (fd: FormData, k: string) => ((fd.get(k) as string) || "").trim();

/** 견적서 공급자(플랫폼) 정보 저장 */
export async function saveQuoteSupplierAction(formData: FormData) {
  const me = await getSessionUser();
  if (!me || me.role !== "ADMIN") back("권한이 없습니다.");

  await saveQuoteSupplier({
    name: str(formData, "name"),
    bizNo: str(formData, "bizNo"),
    ceo: str(formData, "ceo"),
    addr: str(formData, "addr"),
    contact: str(formData, "contact"),
    sealUrl: str(formData, "sealUrl"),
  });

  revalidatePath(ORG);
  revalidatePath("/dashboard/orders");
  back();
}

/** 기업에게 안내할 입금 계좌. 발주 상세·견적서가 읽음 */
export async function savePlatformAccountAction(formData: FormData) {
  const me = await getSessionUser();
  if (!me || me.role !== "ADMIN") back("권한이 없습니다.");

  await savePlatformAccount({
    bank: str(formData, "bank"),
    bankCode: str(formData, "bankCode"),
    account: str(formData, "account"),
    holder: str(formData, "holder"),
  });

  revalidatePath(ORG);
  revalidatePath("/dashboard/orders");
  back();
}
