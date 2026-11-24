import popbill from "popbill";
import { POPBILL_LOOKUP_TIMEOUT_MS } from "./limits";

const LINK_ID = process.env.POPBILL_LINK_ID ?? "";
const SECRET_KEY = process.env.POPBILL_SECRET_KEY ?? "";
const CORP_NUM = (process.env.POPBILL_CORP_NUM ?? "").replace(/-/g, "");
const USER_ID = process.env.POPBILL_USER_ID ?? "";
const IS_TEST = process.env.POPBILL_IS_TEST !== "false";

let configured = false;

export function isConfigured(): boolean {
  return Boolean(LINK_ID && SECRET_KEY && CORP_NUM);
}

function ensureConfig() {
  if (!isConfigured()) {
    throw new PopbillNotConfigured();
  }
  if (!configured) {
    popbill.config({
      LinkID: LINK_ID,
      SecretKey: SECRET_KEY,
      IsTest: IS_TEST,
      IPRestrictOnOff: true,
      UseStaticIP: false,
      defaultErrorHandler: () => {},
    });
    configured = true;
  }
}

export class PopbillNotConfigured extends Error {
  constructor() {
    super("팝빌이 아직 설정되지 않았습니다 (POPBILL_LINK_ID/SECRET_KEY/CORP_NUM).");
    this.name = "PopbillNotConfigured";
  }
}

export class PopbillError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(`[팝빌 ${code}] ${message}`);
    this.name = "PopbillError";
  }
}

function withLookupTimeout<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PopbillError(-1, "조회 시간 초과")), POPBILL_LOOKUP_TIMEOUT_MS);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

function call<T>(fn: (success: (r: T) => void, error: (e: { code: number; message: string }) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    fn(resolve, (e) => reject(new PopbillError(e?.code ?? -1, e?.message ?? "알 수 없는 오류")));
  });
}

export type BizState = "정상" | "휴업" | "폐업" | "미등록";

export interface BizInfo {
  corpName: string;
  ceoName: string;
  addr: string;
  bizType: string;
  bizClass: string;
  closeDownState: number | null;
}

export async function checkBizInfo(bizNo: string): Promise<BizInfo> {
  ensureConfig();
  const svc = popbill.BizInfoCheckService();
  const clean = bizNo.replace(/-/g, "");
  const r = await withLookupTimeout(call<{
    corpName?: string;
    ceoname?: string;
    ceoName?: string;
    CEOName?: string;
    addr?: string;
    addrDetail?: string;
    bizClass?: string;
    bizType?: string;
    closeDownState?: number;
  }>((s, e) => svc.checkBizInfo(CORP_NUM, clean, USER_ID, s, e)));

  const addr = [r.addr ?? "", r.addrDetail ?? ""].map((v) => v.trim()).filter(Boolean).join(" ");
  return {
    corpName: (r.corpName ?? "").trim(),
    ceoName: (r.ceoname ?? r.ceoName ?? r.CEOName ?? "").trim(),
    addr,
    bizType: (r.bizType ?? "").trim(),
    bizClass: (r.bizClass ?? "").trim(),
    closeDownState: typeof r.closeDownState === "number" ? r.closeDownState : null,
  };
}

export function bizStateFromCloseDown(state: number | null): BizState {
  switch (state) {
    case 1:
      return "정상";
    case 2:
      return "휴업";
    case 3:
      return "폐업";
    default:
      return "미등록";
  }
}

export interface OurCorpInfo {
  corpName: string;
  ceoName: string;
  addr: string;
  bizType: string;
  bizClass: string;
}

export async function getOurCorpInfo(): Promise<OurCorpInfo> {
  ensureConfig();
  const svc = popbill.TaxinvoiceService();
  const r = await call<{
    corpName?: string;
    ceoname?: string;
    ceoName?: string;
    CEOName?: string;
    addr?: string;
    bizType?: string;
    bizClass?: string;
  }>((s, e) => svc.getCorpInfo(CORP_NUM, USER_ID, s, e));

  return {
    corpName: (r.corpName ?? "").trim(),
    ceoName: (r.ceoname ?? r.ceoName ?? r.CEOName ?? "").trim(),
    addr: (r.addr ?? "").trim(),
    bizType: (r.bizType ?? "").trim(),
    bizClass: (r.bizClass ?? "").trim(),
  };
}

export interface IssueInvoiceInput {
  mgtKey: string;
  buyer: {
    corpNum: string;
    corpName: string;
    ceoName: string;
    addr: string;
    email: string;
  };
  supplyCost: number;
  tax: number;
  itemName: string;
  purposeType: "영수" | "청구";
  remark?: string;
}

export interface IssueInvoiceResult {
  mgtKey: string;
  ntsConfirmNum: string;
  stateCode: number | null;
}

export async function issueTaxInvoice(input: IssueInvoiceInput): Promise<IssueInvoiceResult> {
  ensureConfig();
  const svc = popbill.TaxinvoiceService();

  const our = await getOurCorpInfo();
  if (!our.corpName || !our.ceoName) {
    throw new PopbillError(
      -11001015,
      "팝빌 회원정보에 상호/대표자가 없습니다. 팝빌 관리자 > 회사정보에서 먼저 입력하세요.",
    );
  }

  const total = input.supplyCost + input.tax;
  const now = new Date();
  const writeDate = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  })
    .format(now)
    .replace(/-/g, "");

  const taxinvoice = {
    writeDate,
    chargeDirection: "정과금",
    issueType: "정발행",
    purposeType: input.purposeType,
    taxType: "과세",

    invoicerCorpNum: CORP_NUM,
    invoicerMgtKey: input.mgtKey,
    invoicerCorpName: our.corpName,
    invoicerCEOName: our.ceoName,
    invoicerAddr: our.addr,
    invoicerBizType: our.bizType,
    invoicerBizClass: our.bizClass,

    invoiceeType: "사업자",
    invoiceeCorpNum: input.buyer.corpNum.replace(/-/g, ""),
    invoiceeCorpName: input.buyer.corpName,
    invoiceeCEOName: input.buyer.ceoName,
    invoiceeAddr: input.buyer.addr,
    invoiceeEmail1: input.buyer.email,

    supplyCostTotal: String(input.supplyCost),
    taxTotal: String(input.tax),
    totalAmount: String(total),

    // 비고 최대 100자 제한
    ...(input.remark ? { remark1: input.remark.slice(0, 100) } : {}),

    detailList: [
      {
        serialNum: 1,
        itemName: input.itemName,
        supplyCost: String(input.supplyCost),
        tax: String(input.tax),
      },
    ],
  };

  await call<{ code: number; message: string }>((s, e) =>
    svc.registIssue(CORP_NUM, taxinvoice, s, e),
  );

  const info = await call<{ ntsconfirmNum?: string; stateCode?: number }>((s, e) =>
    svc.getInfo(CORP_NUM, popbill.MgtKeyType.SELL, input.mgtKey, s, e),
  );

  return {
    mgtKey: input.mgtKey,
    ntsConfirmNum: info.ntsconfirmNum ?? "",
    stateCode: typeof info.stateCode === "number" ? info.stateCode : null,
  };
}

export const NTS_STATE = {
  ISSUED: 300,
  SENT: 304,
  SEND_FAILED: 305,
  CANCELLED: 600,
} as const;

export function ntsStateLabel(state: number | null | undefined): string {
  switch (state) {
    case NTS_STATE.ISSUED:
      return "발행완료 (국세청 전송 대기)";
    case NTS_STATE.SENT:
      return "국세청 전송성공";
    case NTS_STATE.SEND_FAILED:
      return "국세청 전송실패";
    case NTS_STATE.CANCELLED:
      return "발행취소";
    default:
      return state == null ? "미확인" : `상태 ${state}`;
  }
}

export interface TaxInvoiceState {
  stateCode: number | null;
  ntsConfirmNum: string | null;
}

export async function getTaxInvoiceState(mgtKey: string): Promise<TaxInvoiceState> {
  ensureConfig();
  const svc = popbill.TaxinvoiceService();
  const info = await call<{ ntsconfirmNum?: string; stateCode?: number }>((s, e) =>
    svc.getInfo(CORP_NUM, popbill.MgtKeyType.SELL, mgtKey, s, e),
  );
  return {
    stateCode: typeof info.stateCode === "number" ? info.stateCode : null,
    ntsConfirmNum: info.ntsconfirmNum || null,
  };
}

export const BANK_CODES: { code: string; name: string }[] = [
  { code: "0002", name: "산업은행" },
  { code: "0003", name: "기업은행" },
  { code: "0004", name: "국민은행" },
  { code: "0007", name: "수협은행" },
  { code: "0011", name: "농협은행" },
  { code: "0020", name: "우리은행" },
  { code: "0023", name: "SC제일은행" },
  { code: "0027", name: "씨티은행" },
  { code: "0031", name: "아이엠뱅크" },
  { code: "0032", name: "부산은행" },
  { code: "0034", name: "광주은행" },
  { code: "0035", name: "제주은행" },
  { code: "0037", name: "전북은행" },
  { code: "0039", name: "경남은행" },
  { code: "0045", name: "새마을금고" },
  { code: "0048", name: "신협중앙회" },
  { code: "0071", name: "우체국" },
  { code: "0081", name: "하나은행" },
  { code: "0088", name: "신한은행" },
];

export interface BankDeposit {
  tradeDate: string;
  amount: number;
  remark: string;
  balance: number;
}

export async function listDeposits(
  bankCode: string,
  accountNumber: string,
  sdate: string,
  edate: string,
): Promise<BankDeposit[]> {
  ensureConfig();
  const svc = popbill.EasyFinBankService();

  const jobID = await call<string>((s, e) =>
    svc.requestJob(CORP_NUM, bankCode, accountNumber, sdate, edate, USER_ID, s, e),
  );

  // jobState === 3 이 수집 완료(최대 30초 폴링)
  for (let i = 0; i < 15; i++) {
    const state = await call<{ jobState: number; errorCode?: number }>((s, e) =>
      svc.getJobState(CORP_NUM, jobID, USER_ID, s, e),
    );
    if (state.jobState === 3) break;
    if (state.errorCode) throw new PopbillError(state.errorCode, "계좌조회 수집 실패");
    await sleep(2000);
  }

  const deposits: BankDeposit[] = [];
  let page = 1;
  for (;;) {
    const res = await call<{
      list?: { trdate: string; accIn: string; remark1?: string; balance: string }[];
      total?: number;
      perPage?: number;
    }>((s, e) => svc.search(CORP_NUM, jobID, "I", "", page, 100, "D", USER_ID, s, e));

    const list = res.list ?? [];
    for (const t of list) {
      deposits.push({
        tradeDate: t.trdate,
        amount: parseInt(t.accIn || "0", 10) || 0,
        remark: t.remark1 ?? "",
        balance: parseInt(t.balance || "0", 10) || 0,
      });
    }
    if (list.length < 100) break;
    page++;
  }
  return deposits;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
