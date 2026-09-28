/**
 * 팝빌 연동: 전자세금계산서 발행, 사업자 조회, 계좌 입금내역 조회.
 *
 * 설정이 없으면(isConfigured() === false) 호출부가 건너뛰고, 세금계산서는 발행 대기로 남는다.
 * POPBILL_IS_TEST=false 일 때만 운영 서버로 간다.
 * SDK 가 콜백 방식이라 Promise 로 감싼다.
 */

import popbill from "popbill";

// ── 환경설정 ──
const LINK_ID = process.env.POPBILL_LINK_ID ?? "";
const SECRET_KEY = process.env.POPBILL_SECRET_KEY ?? "";
/** 플랫폼 사업자등록번호(팝빌 회원 식별자). 하이픈 없이 10자리 */
const CORP_NUM = (process.env.POPBILL_CORP_NUM ?? "").replace(/-/g, "");
/** 팝빌 담당자 아이디 (선택) */
const USER_ID = process.env.POPBILL_USER_ID ?? "";
const IS_TEST = process.env.POPBILL_IS_TEST !== "false"; // 기본 테스트. 라이브는 명시적으로 false

let configured = false;

/** 팝빌 설정 여부. 미설정이면 호출부가 건너뛴다. */
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
      defaultErrorHandler: () => {}, // 우리는 각 호출의 error 콜백으로 처리한다
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

/** 콜백(success/error) → Promise. error 는 {code, message} 형태로 온다. */
function call<T>(fn: (success: (r: T) => void, error: (e: { code: number; message: string }) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    fn(resolve, (e) => reject(new PopbillError(e?.code ?? -1, e?.message ?? "알 수 없는 오류")));
  });
}

// ─────────────────────────── 사업자상태조회 ───────────────────────────

export type BizState = "정상" | "휴업" | "폐업" | "미등록";

/**
 * 기업 사업자등록번호가 정상인지 확인 (10원/건).
 * state: 0=미등록, 1=정상, 2=면세, 3=폐업 등을 읽기 쉬운 값으로 바꾼다.
 * 지금은 checkBizInfo 가 휴폐업 상태까지 주므로 쓰지 않는다.
 */
export async function checkBizStatus(bizNo: string): Promise<BizState> {
  ensureConfig();
  const svc = popbill.ClosedownService();
  const clean = bizNo.replace(/-/g, "");
  const r = await call<{ state: number; stateDate?: string; taxType?: string }>((s, e) =>
    svc.checkCorpNum(CORP_NUM, clean, USER_ID, s, e),
  );
  switch (r.state) {
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

// ─────────────────────────── 기업정보조회 ───────────────────────────

export interface BizInfo {
  corpName: string; // 상호
  ceoName: string; // 대표자명
  addr: string; // 주소 (기본 + 상세 결합)
  bizType: string; // 업태
  bizClass: string; // 업종
  /** 휴폐업상태. 1=사업중, 2=휴업, 3=폐업 (팝빌 문서 기준) */
  closeDownState: number | null;
}

/**
 * 사업자번호로 기업 정보를 가져온다(50원/건). 휴폐업 상태도 함께 온다.
 * 상호·대표자·주소로 발주 폼을 채우는 데 쓴다. 실패하면 호출부는 수동 입력으로 넘어간다.
 */
export async function checkBizInfo(bizNo: string): Promise<BizInfo> {
  ensureConfig();
  const svc = popbill.BizInfoCheckService();
  const clean = bizNo.replace(/-/g, "");
  const r = await call<{
    corpName?: string;
    // 대표자명 필드 이름이 API 마다 달라(ceoname / CEOName) 후보를 순서대로 본다.
    ceoname?: string;
    ceoName?: string;
    CEOName?: string;
    addr?: string;
    addrDetail?: string;
    bizClass?: string;
    bizType?: string;
    closeDownState?: number;
  }>((s, e) => svc.checkBizInfo(CORP_NUM, clean, USER_ID, s, e));

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

/** 기업정보조회의 휴폐업상태 코드를 checkBizStatus() 와 같은 표현으로 바꾼다 */
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

// ─────────────────────────── 공급자(플랫폼) 회사정보 ───────────────────────────

export interface OurCorpInfo {
  corpName: string; // 상호
  ceoName: string; // 대표자
  addr: string; // 주소
  bizType: string; // 업태
  bizClass: string; // 종목
}

/**
 * 팝빌에 등록된 플랫폼 회사정보를 읽는다(무과금).
 * 세금계산서 공급자란은 직접 채워야 해서(안 채우면 -11001015) 팝빌 회원정보를 그대로 쓴다.
 */
export async function getOurCorpInfo(): Promise<OurCorpInfo> {
  ensureConfig();
  const svc = popbill.TaxinvoiceService();
  const r = await call<{
    corpName?: string;
    // 대표자명 필드 이름이 API 마다 달라 후보를 순서대로 본다.
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

// ─────────────────────────── 전자세금계산서 발행 ───────────────────────────

export interface IssueInvoiceInput {
  /** 팝빌 문서관리번호 = 멱등키. 같은 값으로 두 번 발행되지 않는다 (영문/숫자 1~24자) */
  mgtKey: string;
  /** 공급받는자(기업) */
  buyer: {
    corpNum: string; // 사업자번호 (하이픈 없이)
    corpName: string; // 상호
    ceoName: string; // 대표자
    addr: string; // 주소
    email: string; // 계산서 수신 이메일
  };
  /** 금액 */
  supplyCost: number; // 공급가액 (= subtotal + fee, 부가세 제외)
  tax: number; // 세액 (= vat)
  itemName: string; // 품목명 (예: "OO 서비스 평가 10명")
  /**
   * 영수(대금 수령 완료) | 청구. 입금 전에도 발행하므로 호출부가 Payment.paidAt 을 보고 정한다.
   */
  purposeType: "영수" | "청구";
  /** 비고(remark1). 세금계산서 서식에 계좌 칸이 없어 청구 건의 입금 계좌를 여기 적는다. */
  remark?: string;
}

export interface IssueInvoiceResult {
  mgtKey: string;
  ntsConfirmNum: string; // 국세청 승인번호
  /** 발행 직후 상태. 보통 300(발행완료)이고 국세청 전송 결과는 나중에 나온다. */
  stateCode: number | null;
}

/**
 * 전자세금계산서 즉시 발행(registIssue). 국세청 전송과 기업 이메일 발송은 팝빌이 한다.
 * 공급자 정보는 getOurCorpInfo() 로 채운다.
 */
export async function issueTaxInvoice(input: IssueInvoiceInput): Promise<IssueInvoiceResult> {
  ensureConfig();
  const svc = popbill.TaxinvoiceService();

  const our = await getOurCorpInfo();
  if (!our.corpName || !our.ceoName) {
    // -11001015 대신 조치 방법이 분명한 메시지를 준다.
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
    .replace(/-/g, ""); // YYYYMMDD

  const taxinvoice = {
    writeDate,
    // chargeDirection(과금방향: 정과금|역과금)과 issueType(발행유형: 정발행|역발행|위수탁)은 값이 다르다.
    chargeDirection: "정과금", // 발행자가 요금 부담
    issueType: "정발행",
    // 호출부가 입금 여부를 보고 정한다.
    purposeType: input.purposeType,
    taxType: "과세",

    // 공급자: 팝빌 회원정보에서 읽은 값
    invoicerCorpNum: CORP_NUM,
    invoicerMgtKey: input.mgtKey,
    invoicerCorpName: our.corpName,
    invoicerCEOName: our.ceoName,
    invoicerAddr: our.addr,
    invoicerBizType: our.bizType,
    invoicerBizClass: our.bizClass,

    // 공급받는자: 기업
    invoiceeType: "사업자",
    invoiceeCorpNum: input.buyer.corpNum.replace(/-/g, ""),
    invoiceeCorpName: input.buyer.corpName,
    invoiceeCEOName: input.buyer.ceoName,
    invoiceeAddr: input.buyer.addr,
    invoiceeEmail1: input.buyer.email,

    supplyCostTotal: String(input.supplyCost),
    taxTotal: String(input.tax),
    totalAmount: String(total),

    // 비고는 길이를 넘으면 발행이 거부되므로 100자로 자른다.
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

  // registIssue(CorpNum, Taxinvoice, success, error)
  await call<{ code: number; message: string }>((s, e) =>
    svc.registIssue(CORP_NUM, taxinvoice, s, e),
  );

  // 발행 직후 국세청 승인번호 조회. 이때 stateCode 는 보통 300 이고
  // 전송 결과(304/305)는 getTaxInvoiceState() 로 나중에 확인한다.
  const info = await call<{ ntsconfirmNum?: string; stateCode?: number }>((s, e) =>
    svc.getInfo(CORP_NUM, popbill.MgtKeyType.SELL, input.mgtKey, s, e),
  );

  return {
    mgtKey: input.mgtKey,
    ntsConfirmNum: info.ntsconfirmNum ?? "",
    stateCode: typeof info.stateCode === "number" ? info.stateCode : null,
  };
}

// ─────────────────────────── 국세청 전송 상태 조회 ───────────────────────────

/**
 * 팝빌 전자세금계산서 상태코드.
 * 300(발행완료) → 국세청 전송(비동기) → 304(성공) / 305(실패). 취소는 600.
 */
export const NTS_STATE = {
  ISSUED: 300, // 발행완료 — 아직 국세청 전송 전
  SENT: 304, // 전송성공 — 신고 완료
  SEND_FAILED: 305, // 전송실패 — 관리자 조치 필요
  CANCELLED: 600, // 발행취소
} as const;

/** 더 이상 바뀌지 않는 상태 — 조회를 멈춰도 되는 지점 */
export function isNtsStateFinal(state: number | null | undefined): boolean {
  return state === NTS_STATE.SENT || state === NTS_STATE.CANCELLED;
}

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

/**
 * 발행된 세금계산서의 현재 상태를 조회한다(getInfo). 304/305 확인에 쓴다.
 * 플랫폼이 공급자이므로 mgtKeyType 은 SELL.
 */
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

// ─────────────────────────── 은행코드 ───────────────────────────

/**
 * 팝빌 계좌조회가 인식하는 은행코드(팝빌 "빠른조회 계좌등록" 가이드 기준).
 * 틀린 코드는 조회가 실패하므로 선택 목록으로만 입력받는다.
 */
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

// ─────────────────────────── 계좌조회 (입금 자동확인) ───────────────────────────

export interface BankDeposit {
  tradeDate: string; // 거래일시
  amount: number; // 입금액 (입금 거래만)
  remark: string; // 적요/입금자명
  balance: number;
}

/**
 * 등록된 사업자계좌의 입금 거래내역을 수집·조회한다.
 * requestJob(수집 요청) → getJobState(완료 대기) → search(조회) 3단계.
 *
 * TradeType "I" = 입금만.
 */
export async function listDeposits(
  bankCode: string,
  accountNumber: string,
  sdate: string, // YYYYMMDD
  edate: string, // YYYYMMDD
): Promise<BankDeposit[]> {
  ensureConfig();
  const svc = popbill.EasyFinBankService();

  // 1) 수집 작업 요청 → jobID
  const jobID = await call<string>((s, e) =>
    svc.requestJob(CORP_NUM, bankCode, accountNumber, sdate, edate, USER_ID, s, e),
  );

  // 2) 완료 대기 (jobState.jobState === 3 이 완료). 최대 ~30초 폴링.
  for (let i = 0; i < 15; i++) {
    const state = await call<{ jobState: number; errorCode?: number }>((s, e) =>
      svc.getJobState(CORP_NUM, jobID, USER_ID, s, e),
    );
    if (state.jobState === 3) break;
    if (state.errorCode) throw new PopbillError(state.errorCode, "계좌조회 수집 실패");
    await sleep(2000);
  }

  // 3) 입금 내역 조회 (페이지 넘겨가며 전부)
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
