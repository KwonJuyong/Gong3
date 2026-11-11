import "server-only";
import { visibleProjectWhere } from "./approvals";
import { maskStudentId } from "./privacy";

/**
 * AI 도우미가 조회할 수 있는 모델·필드·관계 메타데이터.
 * 권한은 queryPolicy.ts, 실행은 queryEngine.ts 에 있음
 *
 * 스키마를 바꾸면 여기도 함께 고침. `npm run check:metadata` 가 스키마와 대조함
 */

export type FType = "string" | "int" | "float" | "boolean" | "datetime";

export type FieldMeta = {
  type: FType;
  /** 사람이 읽는 이름. LLM 프롬프트·감사 화면·내보내기 헤더가 같이 씀 */
  label: string;
  /** ADMIN 에게만 열리는 필드 */
  adminOnly?: boolean;
  /** 비관리자에게 적용할 마스킹 */
  maskForNonAdmin?: (v: unknown) => unknown;
};

export type ModelMeta = {
  label: string;
  /** ADMIN 만 이 모델에 접근할 수 있음 */
  adminOnly?: boolean;
  fields: Record<string, FieldMeta>;
  /** 관계명 → 설명. 존재여부 필터("some"/"none")와 건수 집계에 씀 */
  relations?: Record<string, string>;
  /** 비관리자 조회에 항상 AND 로 붙는 행 필터. 사용자 where 로 덮을 수 없음 */
  rowFilterForNonAdmin?: Record<string, unknown>;
  /** 비관리자는 본인 소유 행만. 조회자 id 를 받아 행 필터를 만듦(id 가 없으면 아무 행도 안 맞음). */
  ownerFilterForNonAdmin?: (userId: string) => Record<string, unknown>;
  /** 기간별 추이의 기본 시간축 */
  dateField?: string;
};

/** 로그인 ID 마스킹(maskStudentId 와 같은 규칙) */
const mask4 = (v: unknown) => (v ? maskStudentId(String(v), false) : v);

const s = (label: string, extra?: Partial<FieldMeta>): FieldMeta => ({ type: "string", label, ...extra });
const i = (label: string): FieldMeta => ({ type: "int", label });
const b = (label: string): FieldMeta => ({ type: "boolean", label });
const d = (label: string): FieldMeta => ({ type: "datetime", label });

export const MODELS: Record<string, ModelMeta> = {
  user: {
    label: "회원",
    fields: {
      name: s("이름"),
      studentId: s("학번/사번", { maskForNonAdmin: mask4 }),
      major: s("전공"),
      role: s("역할"),
      userType: s("유형"),
      createdAt: d("가입일"),
      phone: s("연락처", { adminOnly: true }),
      email: s("이메일", { adminOnly: true }),
    },
    relations: {
      enrollments: "참여신청",
      responses: "응답",
      ownedServices: "보유 서비스",
      surveyResponses: "설문응답",
      createdProjects: "개설한 평가",
    },
    dateField: "createdAt",
  },
  project: {
    label: "평가",
    fields: {
      title: s("제목"),
      description: s("설명"),
      location: s("장소"),
      status: s("상태"),
      startTime: d("시작"),
      endTime: d("종료"),
      minParticipants: i("최소인원"),
      maxParticipants: i("정원"),
      enrollmentDeadline: d("신청마감"),
      createdAt: d("생성일"),
    },
    relations: { enrollments: "참여신청", responses: "응답" },
    // 승인 대기·반려 평가는 비관리자에게 보이지 않음(화면과 같은 조건).
    rowFilterForNonAdmin: visibleProjectWhere as Record<string, unknown>,
    dateField: "startTime",
  },
  enrollment: {
    label: "참여신청",
    fields: { projectId: s("평가 ID"), userId: s("회원 ID"), createdAt: d("신청일") },
    dateField: "createdAt",
  },
  response: {
    label: "응답",
    fields: { projectId: s("평가 ID"), userId: s("회원 ID"), createdAt: d("제출일") },
    dateField: "createdAt",
  },
  service: {
    label: "서비스",
    fields: {
      name: s("이름"),
      preset: s("프리셋"),
      modality: s("양식"),
      isAiService: b("AI 서비스"),
      hasRecommendation: b("추천 기능"),
      isSafetyCritical: b("안전 중요"),
      hasPersonalData: b("개인정보 취급"),
      userFacingUi: b("사용자 UI"),
      ownerId: s("소유자 ID"),
      createdAt: d("등록일"),
    },
    relations: { surveys: "설문 버전" },
    // 다른 기업의 의뢰 서비스는 보이지 않음(list_services_surveys 와 같은 규칙).
    ownerFilterForNonAdmin: (userId) => ({ ownerId: userId }),
    dateField: "createdAt",
  },
  surveyVersion: {
    label: "설문 버전",
    fields: {
      round: i("회차"),
      status: s("상태"),
      llmModelId: s("생성 모델"),
      serviceId: s("서비스 ID"),
      confirmedAt: d("확정일"),
      createdAt: d("생성일"),
    },
    relations: { responses: "응답", drafts: "초안" },
    ownerFilterForNonAdmin: (userId) => ({ service: { ownerId: userId } }),
    dateField: "createdAt",
  },
  surveyResponse: {
    label: "설문 응답",
    fields: {
      surveyVersionId: s("설문 버전 ID"),
      userId: s("회원 ID"),
      submittedAt: d("제출일"),
      createdAt: d("생성일"),
    },
    dateField: "createdAt",
  },
  construct: {
    label: "구성개념",
    fields: {
      id: s("ID"),
      group: s("그룹"),
      name: s("이름"),
      evaluator: s("응답 주체"),
      instrument: s("측정도구"),
      active: b("활성"),
      defaultWeight: i("기본 가중치"),
      sortOrder: i("정렬순서"),
    },
  },
  claimBatch: {
    label: "노무비 청구 회차",
    adminOnly: true,
    fields: {
      title: s("제목"),
      status: s("상태"),
      periodStart: d("기간 시작"),
      periodEnd: d("기간 종료"),
      defaultRate: i("기본 단가"),
      createdAt: d("생성일"),
    },
    relations: { claims: "청구 건" },
    dateField: "createdAt",
  },
  laborClaim: {
    label: "노무비 청구",
    adminOnly: true,
    fields: {
      name: s("이름"),
      affiliation: s("소속"),
      status: s("상태"),
      totalAmount: i("금액"),
      confirmedAt: d("확정일"),
      batchId: s("회차 ID"),
      createdAt: d("생성일"),
    },
    dateField: "createdAt",
  },
};

export const MODEL_KEYS = Object.keys(MODELS);

export function getModelMeta(key: string): ModelMeta | undefined {
  return MODELS[key];
}

/** LLM 에게 넘길 스키마 설명을 메타데이터에서 만듦 */
export function describeSchemaForLLM(isAdmin: boolean): string {
  const lines: string[] = [];
  for (const [key, m] of Object.entries(MODELS)) {
    if (m.adminOnly && !isAdmin) continue;
    const fields = Object.entries(m.fields)
      .filter(([, f]) => isAdmin || !f.adminOnly)
      .map(([name, f]) => `${name}(${f.label})`)
      .join(", ");
    const rels = m.relations ? Object.keys(m.relations).join(", ") : "";
    lines.push(
      `- ${key} [${m.label}]${m.adminOnly ? " *ADMIN전용" : ""}: ${fields}` +
        (rels ? ` | 관계: ${rels}` : ""),
    );
  }
  return lines.join("\n");
}

/**
 * LLM 에게 줄 예시도 역할별로 만듦. 비관리자에게 ADMIN 전용 모델이 보이지 않게 하려는 것임
 * npm run test:query 가 이를 확인함
 */
export function describeExamplesForLLM(isAdmin: boolean): string {
  const ex = [
    "'빅데이터 전공생 수' → model:user, mode:count, where:{major:{contains:'빅데이터'}}",
    "'전공별 인원' → model:user, mode:groupBy, groupBy:'major'",
    "'전공별·역할별 분포' → model:user, mode:crosstab, groupBy:'major', groupBy2:'role'",
    "'월별 가입 추이' → model:user, mode:trend, interval:'month'",
    "'1회 이상 참여한 회원 수' → model:user, mode:count, where:{OR:[{enrollments:'some'},{responses:'some'}]}",
    "'진행중인 평가 목록' → model:project, mode:list, where:{status:'ACTIVE'}",
  ];
  if (isAdmin) {
    ex.push("'노무비 청구 총액' → model:laborClaim, mode:aggregate, metric:{fn:'sum', field:'totalAmount'}");
  }
  return ex.map((e) => "예) " + e).join("\n");
}
