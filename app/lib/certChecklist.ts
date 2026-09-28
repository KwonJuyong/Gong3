// 인증 준비 점검 문항. 화면과 서버 액션이 함께 읽는다.
//
// 인증 시험이나 판정이 아니라 준비 상태를 스스로 점검하는 목록이다. 점수나 합격 여부를 내지 않고
// 미비 항목만 보여준다.
//
// 문항은 공개된 인증 절차와 구성개념 사전(prisma/seedConstructs.ts)에서 개발사가 답할 수 있는
// 것을 골라 직접 작성했다. 시험기관의 체크리스트를 옮긴 것이 아니다.

/** 서비스 속성 — 조건부 문항의 판정 입력. `Service` 의 플래그와 이름을 맞춘다. */
export type CertServiceFlags = {
  isAiService: boolean;
  hasPersonalData: boolean;
  isSafetyCritical: boolean;
};

export type CertAnswer = "yes" | "no" | "na";

export type CertItem = {
  id: string;
  /** 질문. 예/아니오로 답할 수 있게 쓴다. */
  q: string;
  /** 왜 보는지 한 줄 */
  why: string;
  /** 문항의 근거(화면에 작게 표시) */
  basis: string;
  /** 조건부 문항이면 판정 함수. 없으면 항상 표시. */
  when?: (f: CertServiceFlags) => boolean;
};

export type CertGroup = {
  id: string;
  title: string;
  note: string;
  items: CertItem[];
};

export const CERT_GROUPS: CertGroup[] = [
  {
    id: "docs",
    title: "제출 자료",
    note: "시험기관은 제출된 문서를 근거로 테스트케이스를 만든다. 문서가 부실하면 시험 자체가 시작되지 않는다.",
    items: [
      {
        id: "doc_feature_list",
        q: "제품의 모든 기능을 빠짐없이 적은 기능 목록이 있습니까?",
        why: "시험 항목이 이 목록에서 나온다. 빠진 기능은 시험되지 않고, 나중에 추가하면 시험이 다시 시작된다.",
        basis: "제도 절차 · ISO/IEC 25051",
      },
      {
        id: "doc_manual",
        q: "사용자가 그것만 보고 제품을 쓸 수 있는 사용자 문서가 있습니까?",
        why: "사용자 문서 자체가 심사 대상이다. 화면 캡처만 나열한 문서는 통과하지 못한다.",
        basis: "ISO/IEC 25051",
      },
      {
        id: "doc_product_desc",
        q: "제품이 무엇을 보장하는지(대상 사용자·동작 환경·제약)를 적은 제품 설명이 있습니까?",
        why: "「이 제품은 무엇을 한다」의 선언이 곧 시험의 기준선이 된다.",
        basis: "ISO/IEC 25051",
      },
      {
        id: "doc_version",
        q: "제출할 제품의 버전이 고정되어 있습니까?",
        why: "시험 중 버전이 바뀌면 앞의 결과가 무효가 된다. 결함 보완은 정해진 횟수만 허용된다.",
        basis: "제도 절차",
      },
    ],
  },
  {
    id: "env",
    title: "시험 환경",
    note: "시험기관과 환경을 협의하는 단계에서 막히는 경우가 많다. 미리 준비되면 대기가 줄어든다.",
    items: [
      {
        id: "env_account",
        q: "권한별 시험 계정을 제공할 수 있습니까?",
        why: "관리자·일반 사용자 등 역할이 나뉜 제품은 각 역할로 들어가 봐야 기능이 확인된다.",
        basis: "제도 절차",
      },
      {
        id: "env_install",
        q: "설치 또는 접속 절차를 문서만 보고 재현할 수 있습니까?",
        why: "시험자가 스스로 환경을 세우지 못하면 그 시간이 전부 대기로 잡힌다.",
        basis: "제도 절차 · ISO/IEC 25051",
      },
      {
        id: "env_data",
        q: "시험용 데이터를 초기 상태로 되돌릴 수 있습니까?",
        why: "회귀시험은 같은 조건에서 다시 돌려야 의미가 있다.",
        basis: "제도 절차",
      },
      {
        id: "env_external",
        q: "외부 연동(결제·인증·API)을 시험 환경에서도 쓸 수 있습니까?",
        why: "운영 키만 있는 연동은 시험에서 막히고, 그 기능은 통째로 확인 불가로 남는다.",
        basis: "제도 절차",
      },
    ],
  },
  {
    id: "quality",
    title: "품질 특성 자가확인",
    note: "우리 구성개념 사전에서 개발사가 스스로 답할 수 있는 항목만 뽑았다. 평가단이 응답하는 지각 문항과는 다르다.",
    items: [
      {
        id: "q_func",
        q: "기능 목록의 각 기능이 명세대로 동작하는 것을 확인했습니까?",
        why: "기능 적합성은 시험 항목의 가장 큰 덩어리다.",
        basis: "기능 적합성 · ISO/IEC 25010:2023",
      },
      {
        id: "q_perf",
        q: "주요 화면·요청의 응답 시간을 측정한 기록이 있습니까?",
        why: "성능은 체감이 아니라 값으로 제시해야 한다. 측정한 적이 없으면 근거가 없다.",
        basis: "성능 효율 · ISO/IEC 25023",
      },
      {
        id: "q_reliability",
        q: "장시간 사용이나 반복 요청에서 오류·중단이 없는 것을 확인했습니까?",
        why: "1회 성공은 신뢰성의 근거가 되지 않는다.",
        basis: "신뢰성 · ISO/IEC 25010:2023",
      },
      {
        id: "q_error",
        q: "잘못된 입력에 대해 제품이 죽지 않고 안내를 돌려줍니까?",
        why: "경계값·빈 입력은 시험에서 반드시 들어온다.",
        basis: "신뢰성 · ISO/IEC 25010:2023",
      },
      {
        id: "q_compat",
        q: "지원한다고 밝힌 브라우저·기기에서 모두 동작을 확인했습니까?",
        why: "지원 범위를 넓게 적어 두면 그 전부가 시험 대상이 된다.",
        basis: "호환성 · ISO/IEC 25010:2023",
      },
      {
        id: "q_ui",
        q: "처음 쓰는 사람이 안내 없이 주요 기능에 도달할 수 있습니까?",
        why: "상호작용 역량은 문서가 아니라 화면에서 판정된다.",
        basis: "상호작용 역량 · ISO/IEC 25010:2023",
      },
      {
        id: "q_security",
        q: "인증·권한이 서버에서 판정됩니까? 화면 숨김만으로 막고 있지는 않습니까?",
        why: "화면에서만 가린 기능은 요청을 직접 보내면 열린다.",
        basis: "보안 · ISO/IEC 25010:2023",
      },
      {
        id: "q_privacy",
        q: "수집하는 개인정보의 항목·보유기간·파기 절차를 문서로 정리했습니까?",
        why: "개인정보를 다루면 처리방침과 실제 동작이 일치하는지가 확인된다.",
        basis: "보안 · 개인정보 보호",
        when: (f) => f.hasPersonalData,
      },
      {
        id: "q_safety",
        q: "잘못된 출력이 이용자에게 해를 줄 수 있는 경우의 차단·경고 장치가 있습니까?",
        why: "안전 민감 서비스는 실패했을 때 무엇이 일어나는지가 함께 확인된다.",
        basis: "안전성 · ISO/IEC 25010:2023",
        when: (f) => f.isSafetyCritical,
      },
    ],
  },
  {
    id: "ai",
    title: "AI 서비스 추가 확인",
    note: "확률적 출력·거동 변화 때문에 일반 소프트웨어와 확인할 것이 다르다. AI 서비스로 등록한 경우에만 나타난다.",
    items: [
      {
        id: "ai_accuracy",
        q: "출력의 정확도를 측정한 기준과 결과가 있습니까?",
        why: "「대체로 잘 나온다」는 시험에서 근거가 되지 않는다.",
        basis: "출력 정확성 · ISO/IEC 25059:2023",
        when: (f) => f.isAiService,
      },
      {
        id: "ai_robust",
        q: "같은 요청을 반복했을 때 결과가 크게 흔들리지 않는 것을 확인했습니까?",
        why: "재현되지 않는 동작은 결함으로 기록될 수 있다.",
        basis: "강건성 · ISO/IEC 25059:2023",
        when: (f) => f.isAiService,
      },
      {
        id: "ai_transparency",
        q: "AI가 관여한 결과임을 이용자가 알 수 있고, 필요하면 사람이 개입할 수 있습니까?",
        why: "투명성과 사용자 제어성은 25059가 새로 넣은 항목이다.",
        basis: "투명성·사용자 제어성 · ISO/IEC 25059:2023",
        when: (f) => f.isAiService,
      },
      {
        id: "ai_limit",
        q: "모델이 못 하는 일(한계·비대상 범위)을 문서에 적었습니까?",
        why: "제품 설명이 보장하는 범위가 곧 시험 범위다. 넓게 적으면 그만큼 시험받는다.",
        basis: "ISO/IEC 25051 · 25059:2023",
        when: (f) => f.isAiService,
      },
    ],
  },
  {
    id: "dev",
    title: "개발·유지보수",
    note: "제품을 쓰는 사람에게는 보이지 않지만 시험과 이후 재시험에 영향을 준다.",
    items: [
      {
        id: "dev_test",
        q: "코드 변경 후 되돌아보는 자동 시험(테스트)이 있습니까?",
        why: "결함 보완 후의 회귀시험을 자체적으로 먼저 돌릴 수 있어야 왕복이 줄어든다.",
        basis: "유지보수성 · ISO/IEC 25010:2023",
      },
      {
        id: "dev_config",
        q: "동작 환경(주소·키·경로)이 코드가 아니라 설정으로 분리되어 있습니까?",
        why: "시험 환경으로 옮기는 비용이 여기서 갈린다.",
        basis: "유연성 · ISO/IEC 25010:2023",
      },
      {
        id: "dev_log",
        q: "오류가 났을 때 원인을 찾을 수 있는 로그가 남습니까?",
        why: "결함 리포트를 받고 재현하지 못하면 보완 기회를 그냥 쓴다.",
        basis: "유지보수성 · ISO/IEC 25010:2023",
      },
    ],
  },
];

/** 서비스 속성에 맞는 문항만 편다. 화면과 서버가 같이 쓴다. */
export function activeCertItems(flags: CertServiceFlags): CertItem[] {
  return CERT_GROUPS.flatMap((g) => g.items.filter((it) => !it.when || it.when(flags)));
}

/** 활성 문항만 남긴 그룹. 빈 그룹은 떨어뜨린다. */
export function activeCertGroups(flags: CertServiceFlags): CertGroup[] {
  return CERT_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((it) => !it.when || it.when(flags)),
  })).filter((g) => g.items.length > 0);
}

export type CertAnswers = Record<string, CertAnswer>;

/** 점검 결과 요약. 판정처럼 보이지 않도록 점수 대신 미비·미응답 개수만 센다. */
export function summarizeCert(flags: CertServiceFlags, answers: CertAnswers) {
  const items = activeCertItems(flags);
  const gaps = items.filter((it) => answers[it.id] === "no");
  const unanswered = items.filter((it) => !answers[it.id]);
  return {
    total: items.length,
    answered: items.length - unanswered.length,
    gaps,
    unanswered,
  };
}

/** 저장 전 정규화 — 활성 문항이 아니거나 값이 허용 밖이면 버린다. */
export function sanitizeCertAnswers(flags: CertServiceFlags, raw: unknown): CertAnswers {
  if (!raw || typeof raw !== "object") return {};
  const allowed = new Set(activeCertItems(flags).map((it) => it.id));
  const out: CertAnswers = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(k)) continue;
    if (v === "yes" || v === "no" || v === "na") out[k] = v;
  }
  return out;
}
