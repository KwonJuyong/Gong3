/**
 * 팝빌 Node SDK(popbill)의 타입 선언. app/lib/popbill.ts 에서 쓰는 부분만 선언한다.
 * 각 메서드는 success/error 콜백을 마지막 인자로 받는다.
 */
declare module "popbill" {
  interface PopbillConfig {
    LinkID: string;
    SecretKey: string;
    IsTest: boolean;
    IPRestrictOnOff?: boolean;
    UseStaticIP?: boolean;
    defaultErrorHandler?: (err: { code: number; message: string }) => void;
  }

  type Success<T> = (result: T) => void;
  type Fail = (err: { code: number; message: string }) => void;

  interface ClosedownService {
    checkCorpNum(corpNum: string, checkCorpNum: string, userID: string, success: Success<{ state: number; stateDate?: string; taxType?: string }>, error: Fail): void;
  }

  interface TaxinvoiceService {
    registIssue(corpNum: string, taxinvoice: unknown, success: Success<{ code: number; message: string }>, error: Fail): void;
    getInfo(corpNum: string, mgtKeyType: string, mgtKey: string, success: Success<{ ntsconfirmNum?: string; stateCode?: number }>, error: Fail): void;
    /** 팝빌에 등록된 우리 회사정보. 세금계산서 공급자란을 채우는 데 쓴다 (BaseService 상속) */
    getCorpInfo(
      corpNum: string,
      userID: string,
      success: Success<{
        corpName?: string;
        ceoname?: string;
        ceoName?: string;
        CEOName?: string;
        addr?: string;
        bizType?: string;
        bizClass?: string;
      }>,
      error: Fail,
    ): void;
  }

  interface EasyFinBankService {
    requestJob(corpNum: string, bankCode: string, accountNumber: string, sdate: string, edate: string, userID: string, success: Success<string>, error: Fail): void;
    getJobState(corpNum: string, jobID: string, userID: string, success: Success<{ jobState: number; errorCode?: number }>, error: Fail): void;
    search(
      corpNum: string,
      jobID: string,
      tradeType: string,
      searchString: string,
      page: number,
      perPage: number,
      order: string,
      userID: string,
      success: Success<{ list?: { trdate: string; accIn: string; remark1?: string; balance: string }[]; total?: number; perPage?: number }>,
      error: Fail,
    ): void;
  }

  /** 기업정보조회: 사업자번호로 상호·대표자·주소·업종·휴폐업 상태를 받는다 */
  interface BizInfoCheckService {
    checkBizInfo(
      corpNum: string,
      checkCorpNum: string,
      userID: string,
      success: Success<{
        corpName?: string;
        CEOName?: string;
        addr?: string;
        addrDetail?: string;
        bizClass?: string;
        bizType?: string;
        closeDownState?: number;
        result?: number;
        resultMessage?: string;
      }>,
      error: Fail,
    ): void;
  }

  interface AccountCheckService {
    checkAccountInfo(corpNum: string, bankCode: string, accountNumber: string, userID: string, success: Success<unknown>, error: Fail): void;
    checkDepositorInfo(corpNum: string, bankCode: string, accountNumber: string, accountType: string, identityNumber: string, userID: string, success: Success<unknown>, error: Fail): void;
  }

  interface Popbill {
    config(cfg: PopbillConfig): void;
    MgtKeyType: { SELL: string; BUY: string; TRUSTEE: string };
    ClosedownService(): ClosedownService;
    TaxinvoiceService(): TaxinvoiceService;
    EasyFinBankService(): EasyFinBankService;
    AccountCheckService(): AccountCheckService;
    BizInfoCheckService(): BizInfoCheckService;
  }

  const popbill: Popbill;
  export = popbill;
}
