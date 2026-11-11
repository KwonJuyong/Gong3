/**
 * 프로필 완성도. 헤더 게이지와 탭 배지가 함께 씀
 * 지급에 필요한 정보(계좌 등)가 비어 있으면 미리 보이게 하는 것이 목적임
 * 역할마다 필요한 항목이 달라 체크리스트를 역할별로 만듦
 */

import type { SettlementProfileView } from "./settlementProfile";
import type { BizProfileView } from "./bizProfile";
import { isValidBizNo } from "./bizNo";

export type CompletionTab = "basic" | "settlement" | "biz";

export interface CompletionItem {
  label: string;
  done: boolean;
  /** 채우러 갈 탭 */
  tab: CompletionTab;
  /** 비면 돈·서류가 막히는 항목인가. 게이지 아래 경고로 따로 뽑음 */
  blocking: boolean;
}

export interface Completion {
  percent: number;
  done: number;
  total: number;
  items: CompletionItem[];
  /** 아직 안 된 것들 */
  missing: CompletionItem[];
  /** 미완 항목이 있는 탭: 탭 옆 ● 배지에 씀 */
  tabsWithMissing: Set<CompletionTab>;
}

export interface CompletionInput {
  role: string;
  name: string;
  phone: string;
  email: string;
  profileImage: string | null;
  settlement: SettlementProfileView;
  biz: BizProfileView;
  /**
   * 기업 정보를 완성도에 넣을지. 기업 정보 탭은 모두에게 보이지만 학생은 사업자번호가 없으므로,
   * 호출부는 ADMIN 이거나 이미 입력을 시작한 사람에게만 켬
   */
  showBiz: boolean;
  /** 정산 정보 탭이 보이는가 */
  showSettlement: boolean;
}

export function computeCompletion(input: CompletionInput): Completion {
  const items: CompletionItem[] = [
    { label: "이름", done: !!input.name, tab: "basic", blocking: false },
    { label: "연락처", done: !!input.phone, tab: "basic", blocking: false },
    { label: "이메일", done: !!input.email, tab: "basic", blocking: false },
    { label: "프로필 사진", done: !!input.profileImage, tab: "basic", blocking: false },
  ];

  if (input.showSettlement) {
    const s = input.settlement;
    items.push(
      // generatePayouts() 가 지급 대상으로 삼는 조건과 같음
      { label: "정산 계좌", done: s.payoutReady, tab: "settlement", blocking: true },
      // 지급명세서(원천징수 신고)용. 없다고 이체가 막히지는 않음
      { label: "주민등록번호", done: s.hasRrn, tab: "settlement", blocking: false },
      { label: "주소", done: !!s.address, tab: "settlement", blocking: false },
      // 관리자 대리입력분은 consentAt 이 비어 있음(본인 동의 전).
      { label: "개인정보 동의", done: s.consentAt != null, tab: "settlement", blocking: false },
    );
  }

  if (input.showBiz) {
    const b = input.biz;
    items.push(
      // 자릿수가 아니라 체크섬으로 판정함
      { label: "사업자등록번호", done: isValidBizNo(b.bizNo), tab: "biz", blocking: true },
      { label: "상호", done: !!b.bizName, tab: "biz", blocking: true },
      { label: "세금계산서 수신 이메일", done: !!b.bizEmail, tab: "biz", blocking: true },
    );
  }

  const done = items.filter((i) => i.done).length;
  const missing = items.filter((i) => !i.done);

  return {
    percent: items.length === 0 ? 100 : Math.round((done / items.length) * 100),
    done,
    total: items.length,
    items,
    missing,
    tabsWithMissing: new Set(missing.map((i) => i.tab)),
  };
}
