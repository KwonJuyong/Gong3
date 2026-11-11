import SubmitButton from "@/app/components/SubmitButton";
import { BANK_CODES } from "../../lib/popbill";
import SealUpload from "./SealUpload";
import { saveQuoteSupplierAction, savePlatformAccountAction } from "./actions";
import type { QuoteSupplier, PlatformAccount } from "../../lib/orgSettings";
import { Card, Field, Note, INPUT, BTN_PRIMARY } from "../profile/ui";

/** 조직 설정(ADMIN): 견적서 공급자 정보와 입금 계좌. 견적서와 발주 상세가 이 값을 씀 */
export default function OrgSection({
  supplier,
  account,
}: {
  supplier: QuoteSupplier;
  account: PlatformAccount;
}) {
  return (
    <div className="space-y-5">
      <Card
        title="견적서 공급자 정보"
        desc="견적서 PDF 에 찍히는 우리 회사 정보입니다. 세금계산서는 팝빌에 등록된 회사정보로 나가지만, 견적서는 우리가 직접 그리므로 따로 갖고 있어야 합니다."
      >
        <form action={saveQuoteSupplierAction} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="상호">
              <input name="name" defaultValue={supplier.name} placeholder="상호" className={INPUT} />
            </Field>
            <Field label="사업자등록번호">
              <input name="bizNo" defaultValue={supplier.bizNo} placeholder="사업자등록번호" className={INPUT} />
            </Field>
            <Field label="대표자">
              <input name="ceo" defaultValue={supplier.ceo} placeholder="대표자" className={INPUT} />
            </Field>
            <Field label="연락처" hint="전화 또는 이메일">
              <input name="contact" defaultValue={supplier.contact} placeholder="연락처" className={INPUT} />
            </Field>
            <Field label="주소" className="sm:col-span-2">
              <input name="addr" defaultValue={supplier.addr} placeholder="주소" className={INPUT} />
            </Field>
          </div>

          <div className="pt-2 border-t border-[var(--gray-100)]">
            <SealUpload initialUrl={supplier.sealUrl} />
          </div>

          <Note tone="warning">
            비워두면 견적서에 <strong>&quot;-&quot;</strong> 로 찍힙니다. 상호·사업자번호가
            비어 있거나 <strong>직인이 없는 견적서는 상대 회사 결재에서 반려되기 쉽습니다</strong>
            — 발급 자체를 막지는 않으니 첫 발송 전에 채워 두세요.
          </Note>

          <div className="flex justify-end">
            <SubmitButton type="submit" className={BTN_PRIMARY}>
              공급자 정보 저장
            </SubmitButton>
          </div>
        </form>
      </Card>

      <Card
        title="플랫폼 입금 계좌"
        desc="기업에게 안내하는 입금 계좌입니다. 의뢰 상세와 견적서 하단에 그대로 표시됩니다."
      >
        <form action={savePlatformAccountAction} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="은행명">
              <input name="bank" defaultValue={account.bank} placeholder="은행명" className={INPUT} />
            </Field>
            {/* 은행코드는 팝빌이 정한 값이라 목록에서 고름 */}
            <Field label="은행코드 (팝빌 계좌조회용)" hint="입금내역 자동 동기화를 켤 때만 필요합니다.">
              <select name="bankCode" defaultValue={account.bankCode} className={INPUT}>
                <option value="">선택 안 함</option>
                {BANK_CODES.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="계좌번호">
              <input name="account" defaultValue={account.account} placeholder="계좌번호" className={INPUT} />
            </Field>
            <Field label="예금주">
              <input name="holder" defaultValue={account.holder} placeholder="예금주" className={INPUT} />
            </Field>
          </div>

          <Note tone="warning">
            비워두면 견적서 입금 계좌가 <strong>&quot;-&quot;</strong> 로 찍히고, 의뢰 상세의
            입금 안내도 뜨지 않습니다. <strong>기업이 대금을 보낼 곳을 알 수 없습니다</strong> —
            세금계산서에는 계좌 칸이 아예 없으므로 계좌를 나르는 건 이 설정뿐입니다.
          </Note>

          <div className="flex justify-end">
            <SubmitButton type="submit" className={BTN_PRIMARY}>
              입금 계좌 저장
            </SubmitButton>
          </div>
        </form>
      </Card>
    </div>
  );
}
