/**
 * 조직 설정(플랫폼 정보). AppSetting 에 키-값으로 저장함
 * 편집 화면은 /dashboard/org(ADMIN)임
 * 조회·저장만 하고 권한 검사는 서버 액션(app/dashboard/profile/actions.ts)이 함
 */

import { prisma } from "../db";


/**
 * 견적서의 공급자 정보. 세금계산서는 팝빌에 등록된 회사정보를 쓰지만 견적서는 직접 그림
 * 비어 있으면 "-" 로 표시함
 */
const SUPPLIER_KEYS = {
  name: "supplier_name",
  bizNo: "supplier_bizno",
  ceo: "supplier_ceo",
  addr: "supplier_addr",
  contact: "supplier_contact",
  /** 직인 이미지 URL. 없으면 직인 없이 발급됨 */
  sealUrl: "supplier_seal_url",
} as const;

export interface QuoteSupplier {
  name: string;
  bizNo: string;
  ceo: string;
  addr: string;
  contact: string;
  sealUrl: string;
}

export async function getQuoteSupplier(): Promise<QuoteSupplier> {
  const keys = Object.values(SUPPLIER_KEYS) as string[];
  const rows = await prisma.appSetting.findMany({ where: { key: { in: keys } } });
  const val = (k: string) => rows.find((r) => r.key === k)?.value ?? "";
  return {
    name: val(SUPPLIER_KEYS.name),
    bizNo: val(SUPPLIER_KEYS.bizNo),
    ceo: val(SUPPLIER_KEYS.ceo),
    addr: val(SUPPLIER_KEYS.addr),
    contact: val(SUPPLIER_KEYS.contact),
    sealUrl: val(SUPPLIER_KEYS.sealUrl),
  };
}

export async function saveQuoteSupplier(input: QuoteSupplier): Promise<void> {
  const pairs: [string, string][] = (
    Object.entries(SUPPLIER_KEYS) as [keyof QuoteSupplier, string][]
  ).map(([field, key]) => [key, (input[field] || "").trim()]);
  await writeAll(pairs);
}


const BANK_KEY = "platform_bank";
const BANK_CODE_KEY = "platform_bank_code"; // 팝빌 계좌조회용 은행코드 (예: 국민 0004)
const ACCOUNT_KEY = "platform_account";
const HOLDER_KEY = "platform_holder";

export interface PlatformAccount {
  bank: string;
  bankCode: string;
  account: string;
  holder: string;
}

/** 기업에게 안내할 입금 계좌. 미설정이면 빈 문자열 */
export async function getPlatformAccount(): Promise<PlatformAccount> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [BANK_KEY, BANK_CODE_KEY, ACCOUNT_KEY, HOLDER_KEY] } },
  });
  const val = (k: string) => rows.find((r) => r.key === k)?.value ?? "";
  return {
    bank: val(BANK_KEY),
    bankCode: val(BANK_CODE_KEY),
    account: val(ACCOUNT_KEY),
    holder: val(HOLDER_KEY),
  };
}

export async function savePlatformAccount(input: PlatformAccount): Promise<void> {
  await writeAll([
    [BANK_KEY, (input.bank || "").trim()],
    [BANK_CODE_KEY, (input.bankCode || "").trim()],
    [ACCOUNT_KEY, (input.account || "").trim()],
    [HOLDER_KEY, (input.holder || "").trim()],
  ]);
}

async function writeAll(pairs: [string, string][]): Promise<void> {
  for (const [key, value] of pairs) {
    await prisma.appSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
}
