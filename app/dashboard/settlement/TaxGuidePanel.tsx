"use client";

import { useState } from "react";

/**
 * 세무 안내(정산 화면에서 펼쳐 보는 신고 규칙 요약). 기본은 접혀 있음
 * 문구는 명사형 단문으로 쓰고 주의는 ※ 로 표시하며, 항목마다 근거 조문과 원문 링크를 붙임
 * 세법이 바뀔 수 있으므로 원문은 링크를 기준으로 함
 */

const LINK = "text-[var(--accent)] underline underline-offset-2 hover:opacity-80 transition-opacity";

/** 국세청·위택스 원문 링크(새 탭) */
function Src({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>
      {children}
    </a>
  );
}

const Icon = ({ d }: { d: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-3.5 h-3.5 shrink-0"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
);

const I_BOOK =
  "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z";
const I_CLOSE = "M18 6 6 18M6 6l12 12";

const TH = "px-3 py-1.5 font-semibold";
const TD = "px-3 py-1.5";
const THEAD =
  "text-left text-xs text-[var(--gray-500)] bg-[var(--gray-50)]";
const ROW = "border-t border-[var(--gray-100)]";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-[var(--foreground)]">
        {title}
      </h4>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export default function TaxGuidePanel() {
  const [open, setOpen] = useState(false);

  return (
    <section className="bg-white rounded-[var(--radius-xl)] overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">세무 안내</h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            신고·제출 기한, 원천징수 기준, 근거 조문 및 국세청 원문.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[var(--gray-300)] text-[var(--muted)] rounded-[var(--radius-md)] hover:bg-[var(--gray-50)] transition-colors shrink-0"
        >
          <Icon d={open ? I_CLOSE : I_BOOK} />
          {open ? "닫기" : "세무 안내"}
        </button>
      </div>

      {open && (
        <div className="px-5 pb-5 space-y-5 border-t border-[var(--gray-100)] pt-4">
          <Section title="1. 신고·제출 기한">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className={THEAD}>
                    <th className={TH}>구분</th>
                    <th className={TH}>주기</th>
                    <th className={TH}>제출처</th>
                    <th className={TH}>기한</th>
                  </tr>
                </thead>
                <tbody className="text-[var(--muted)]">
                  <tr className={ROW}>
                    <td className={`${TD} text-[var(--foreground)]`}>원천징수이행상황신고서</td>
                    <td className={TD}>매월</td>
                    <td className={TD}>홈택스</td>
                    <td className={`${TD} font-medium`}>지급월의 다음 달 10일</td>
                  </tr>
                  <tr className={ROW}>
                    <td className={`${TD} text-[var(--foreground)]`}>지방소득세 특별징수분</td>
                    <td className={TD}>매월</td>
                    <td className={`${TD} text-[var(--warning)] font-medium`}>위택스</td>
                    <td className={`${TD} font-medium`}>지급월의 다음 달 10일</td>
                  </tr>
                  <tr className={ROW}>
                    <td className={`${TD} text-[var(--foreground)]`}>간이지급명세서</td>
                    <td className={TD}>매월</td>
                    <td className={TD}>홈택스</td>
                    <td className={`${TD} font-medium`}>지급월의 다음 달 말일</td>
                  </tr>
                  <tr className={ROW}>
                    <td className={`${TD} text-[var(--foreground)]`}>부가가치세 확정신고</td>
                    <td className={TD}>반기</td>
                    <td className={TD}>홈택스</td>
                    <td className={`${TD} font-medium`}>1월 25일 · 7월 25일</td>
                  </tr>
                  <tr className={ROW}>
                    <td className={`${TD} text-[var(--foreground)]`}>종합소득세</td>
                    <td className={TD}>연 1회</td>
                    <td className={TD}>홈택스</td>
                    <td className={`${TD} font-medium`}>5월 31일</td>
                  </tr>
                  <tr className={ROW}>
                    <td className={`${TD} text-[var(--foreground)]`}>원천세 반기납부 승인신청</td>
                    <td className={TD}>연 2회</td>
                    <td className={TD}>홈택스</td>
                    <td className={`${TD} font-medium`}>6월 · 12월 중 (말일까지)</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ul className="text-xs text-[var(--muted)] mt-2 space-y-0.5">
              <li>※ 지방소득세는 홈택스가 아닌 위택스에 별도 신고한다.</li>
              <li>※ 홈택스 접수증의 &quot;지방소득세 신고이동&quot; 이용 시 신고내역이 연계된다.</li>
              <li>※ 반기납부 승인은 신청 기간(6월·12월)에만 가능하다. 상시고용인원 20명 이하 대상.</li>
            </ul>
          </Section>

          <Section title="2. 제출의무: 세액 0원인 경우">
            <div className="rounded-[var(--radius-md)] border border-[var(--warning)] bg-[var(--warning-light)] p-3 text-xs leading-relaxed">
              <p className="text-[var(--foreground)] font-medium">
                원천징수세액이 0원인 경우에도 신고·제출 대상이다.
              </p>
              <ul className="text-[var(--muted)] mt-1.5 space-y-1">
                <li>· 원천징수이행상황신고서: 납부할 세액이 없는 경우에도 기한 내 제출.</li>
                <li>
                  · 기타소득 지급명세서: 과세최저한 적용 시 제출의무 면제가 원칙이나,{" "}
                  <span className="text-[var(--foreground)] font-medium">
                    소득세법 제21조 제1항 제19호(일시적 인적용역)
                  </span>{" "}
                  는 면제 대상에서 제외된다.
                </li>
                <li>· 평가 참여 보상은 위 제19호에 해당하므로 간이지급명세서를 매월 제출한다.</li>
              </ul>
              <p className="text-[var(--muted)] mt-1.5">
                가산세: 미제출·지연제출 시 지급금액의 <strong>0.25%</strong>. 기한 후 1개월 이내
                제출 시 <strong>0.125%</strong>.
              </p>
              <p className="mt-2">
                <Src href="https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=12314&cntntsId=8634">
                  국세청 · 기타소득 지급명세서 제출
                </Src>
                <span className="text-[var(--gray-500)]"> | </span>
                <Src href="https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=40677&cntntsId=239031">
                  간이지급명세서(거주자의 기타소득)
                </Src>
              </p>
            </div>
            <p className="text-xs text-[var(--muted)] mt-2">
              ※ 간이지급명세서를 매월 제출한 경우 연 1회 지급명세서 제출은 면제된다.
            </p>
          </Section>

          <Section title="3. 원천징수 기준">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className={THEAD}>
                    <th className={TH}>소득구분</th>
                    <th className={TH}>세율</th>
                    <th className={TH}>징수 제외</th>
                    <th className={TH}>근거</th>
                  </tr>
                </thead>
                <tbody className="text-[var(--muted)]">
                  <tr className={ROW}>
                    <td className={`${TD} text-[var(--foreground)]`}>기타소득 (일시적)</td>
                    <td className={TD}>8.8%</td>
                    <td className={`${TD} font-medium`}>지급액 125,000원 이하</td>
                    <td className={TD}>필요경비 60% 의제, 과세최저한 50,000원</td>
                  </tr>
                  <tr className={ROW}>
                    <td className={`${TD} text-[var(--foreground)]`}>사업소득 (계속·반복)</td>
                    <td className={TD}>3.3%</td>
                    <td className={`${TD} font-medium`}>지급액 33,333원 이하</td>
                    <td className={TD}>소액부징수 (소득세 1,000원 미만)</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ul className="text-xs text-[var(--muted)] mt-2 space-y-0.5">
              <li>
                ※ 지급액 33,333원 이하는 소득구분과 무관하게 원천징수세액이 0원이다
                (33,333 × 3% = 999.99, 절사 999원).
              </li>
              <li>
                ※ 기타소득 과세최저한 경계에서 실수령액이 역전된다. 지급액 125,000원 → 실수령
                125,000원, 125,001원 → 실수령 114,001원.
              </li>
              <li>※ 소득구분 변경 시 기존 보상의 세액은 변경되지 않는다(생성 시점 스냅샷).</li>
            </ul>
          </Section>

          <Section title="4. 부가가치세">
            <ul className="text-xs text-[var(--muted)] space-y-1 leading-relaxed">
              <li>· 개인 일반과세자 확정신고: 1월 25일, 7월 25일.</li>
              <li>
                · 예정고지: 4월·10월, 직전 과세기간 납부세액의 50%. 고지세액 50만원 미만인 경우
                고지하지 아니한다.
              </li>
              <li>
                · 참여 보상은 비사업자 지급분으로{" "}
                <span className="text-[var(--foreground)] font-medium">매입세액이 발생하지 않는다.</span>{" "}
                매출세액 전액이 납부 대상이 된다.
              </li>
              <li>· 운영비 매입세액 확보가 납부세액을 줄이는 유일한 수단이다.</li>
            </ul>
            <p className="text-xs mt-2">
              <Src href="https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=2273&cntntsId=7694">
                국세청 · 부가가치세 신고납부기한
              </Src>
            </p>
          </Section>

          <Section title="5. 증빙">
            <ul className="text-xs text-[var(--muted)] space-y-1 leading-relaxed">
              <li>· 적격증빙: 세금계산서, 계산서, 신용카드매출전표, 현금영수증.</li>
              <li>· 건당 3만원 초과 지출에 적격증빙이 없는 경우 증빙불비 가산세 2%.</li>
              <li>
                · 학생 지급분은 원천징수 및 지급명세서 제출이 필요경비 인정의 요건이다. 미제출 시
                해당 지급액이 필요경비에서 부인될 수 있다.
              </li>
            </ul>
          </Section>

          <Section title="6. 관련 자료">
            <ul className="text-xs space-y-1">
              <li>
                <Src href="https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=2414&cntntsId=7702">
                  국세청 · 원천세 신고납부기한
                </Src>
              </li>
              <li>
                <Src href="https://www.gov.kr/mw/AA020InfoCappView.do?HighCtgCD=A09002&CappBizCD=12100000219">
                  정부24 · 원천징수세액 반기별 납부승인
                </Src>
              </li>
              <li>
                <Src href="https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=40349&cntntsId=238925">
                  국세청 · 간이지급명세서(거주자의 사업소득)
                </Src>
              </li>
              <li>
                <Src href="https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=12309&cntntsId=8631">
                  국세청 · 지급명세서 제출
                </Src>
              </li>
              <li>
                <Src href="https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=2230&cntntsId=7669">
                  국세청 · 기장의무 및 경비율 판단기준
                </Src>
              </li>
              <li>
                <Src href="https://www.wetax.go.kr/etr/lit/B070001M01.do">위택스 · 지방소득세 신고</Src>
              </li>
            </ul>
            <p className="text-xs text-[var(--gray-500)] mt-2">
              ※ 세법은 개정된다. 본 안내는 요약이며 위 링크가 원문이다. 연 1회 대조를 권고한다.
            </p>
          </Section>
        </div>
      )}
    </section>
  );
}
