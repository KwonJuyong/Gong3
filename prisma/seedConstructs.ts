import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// L0 구성개념 사전 (ISO 25010:2023 / 25059 / 25019 기반)
// instrument: SUS | UEQ | NASA_TLX | CSAT_NPS | null(=LLM 적응 블록)
// evaluator : EVALUATOR(평가단) | DEVELOPER(게스트 자가평가)
// group     : A_CORE | A_AI | A_DOMAIN | A_MODALITY | A_DEV | B | C
const constructs = [
  // ── A-1 공통 코어 (모든 서비스 항상 적용 · ISO 25010:2023 · 평가단) ──
  { id: 'func_suitability',       group: 'A_CORE',   name: '기능 적합성',            isoRef: 'ISO/IEC 25010:2023', evaluator: 'EVALUATOR', instrument: null,        sortOrder: 10, description: '기능 완전성·정확성·적절성. 서비스가 명시된 기능을 빠짐없이 정확하게 수행하는 정도.' },
  { id: 'performance_efficiency', group: 'A_CORE',   name: '성능 효율',              isoRef: 'ISO/IEC 25010:2023', evaluator: 'EVALUATOR', instrument: null,        sortOrder: 20, description: '응답 속도·자원 사용·부하 시 거동. 체감 성능 중심.' },
  { id: 'reliability',            group: 'A_CORE',   name: '신뢰성',                 isoRef: 'ISO/IEC 25010:2023', evaluator: 'EVALUATOR', instrument: null,        sortOrder: 30, description: '가용성·결함 허용·복구. 오류 없이 안정적으로 동작하는 정도.' },
  { id: 'security',               group: 'A_CORE',   name: '보안',                   isoRef: 'ISO/IEC 25010:2023', evaluator: 'EVALUATOR', instrument: null,        sortOrder: 40, description: '기밀성·무결성·인증(체감). 개인정보 보유 시 가중치 상향.' },
  { id: 'interaction_capability', group: 'A_CORE',   name: '상호작용 역량',          isoRef: 'ISO/IEC 25010:2023', evaluator: 'EVALUATOR', instrument: 'SUS',       sortOrder: 50, description: '학습성·접근성·포용성·UI(구 사용성). SUS로 측정.' },
  { id: 'compatibility',          group: 'A_CORE',   name: '호환성',                 isoRef: 'ISO/IEC 25010:2023', evaluator: 'EVALUATOR', instrument: null,        sortOrder: 60, description: '기기·브라우저 간 일관 동작. 환경 메타데이터 병행.' },

  // ── A-2 AI 전용 모듈 (isAiService=true 일 때만 · ISO 25059) ──
  { id: 'output_correctness',     group: 'A_AI',     name: '출력 정확성',            isoRef: 'ISO/IEC 25059:2023', evaluator: 'EVALUATOR', instrument: null,        sortOrder: 110, description: 'AI 응답의 정확/부정확. ML은 항상 정확하지 않으므로 신중 측정.' },
  { id: 'robustness',             group: 'A_AI',     name: '강건성',                 isoRef: 'ISO/IEC 25059:2023', evaluator: 'EVALUATOR', instrument: null,        sortOrder: 120, description: '입력 변동·엣지케이스에서의 일관성. 신뢰성의 신규 하위특성.' },
  { id: 'functional_adaptability',group: 'A_AI',     name: '기능 적응성',            isoRef: 'ISO/IEC 25059:2023', evaluator: 'EVALUATOR', instrument: null,        sortOrder: 130, description: '변화하는 환경·맥락에 대한 적응. 25059 신규 특성.' },
  { id: 'transparency_control',   group: 'A_AI',     name: '투명성·사용자 제어성',   isoRef: 'ISO/IEC 25059:2023', evaluator: 'EVALUATOR', instrument: null,        sortOrder: 140, description: '동작 설명 가능성·사용자 개입 가능성. 신뢰 가능한 AI 요건.' },

  // ── A-3 도메인 조건부 모듈 (속성 플래그로 ON/OFF) ──
  { id: 'recommendation_accuracy',group: 'A_DOMAIN', name: '추천·개인화 정확도',     isoRef: 'ISO/IEC 25059:2023', evaluator: 'EVALUATOR', instrument: null,        sortOrder: 210, description: '추천/개인화 결과의 적합성. hasRecommendation=true 일 때.' },
  { id: 'safety',                 group: 'A_DOMAIN', name: '안전성',                 isoRef: 'ISO/IEC 25010:2023', evaluator: 'EVALUATOR', instrument: null,        sortOrder: 220, description: '위해 방지·안전 거동. isSafetyCritical=true(헬스케어 등) 일 때.' },
  { id: 'deep_accessibility',     group: 'A_DOMAIN', name: '심화 접근성',            isoRef: 'ISO/IEC 25010:2023', evaluator: 'EVALUATOR', instrument: null,        sortOrder: 230, description: '공공·교육 서비스의 강화된 접근성 요건.' },

  // ── 입력 형태(modality)별 품질. isConstructActive 의 A_MODALITY 분기가 연다 ──
  { id: 'visual_fidelity',        group: 'A_MODALITY', name: '시각 결과 충실도',      isoRef: 'ISO/IEC 25059',      evaluator: 'EVALUATOR', instrument: null,        sortOrder: 210, description: '요청한 내용과 생성·표시된 이미지가 일치하는 정도. 의도 반영·세부 묘사의 정확성.' },
  { id: 'visual_artifact',        group: 'A_MODALITY', name: '시각 결함',             isoRef: 'ISO/IEC 25059',      evaluator: 'EVALUATOR', instrument: null,        sortOrder: 220, description: '왜곡·뭉개짐·잘못된 글자/손가락 등 눈에 띄는 결함이 없는 정도.' },
  { id: 'speech_recognition',     group: 'A_MODALITY', name: '음성 인식 정확도',      isoRef: 'ISO/IEC 25059',      evaluator: 'EVALUATOR', instrument: null,        sortOrder: 230, description: '사용자의 말을 정확히 알아듣는 정도. 발음·억양·주변 소음에 대한 강건성 포함.' },
  { id: 'speech_naturalness',     group: 'A_MODALITY', name: '발화 자연스러움',       isoRef: 'ISO/IEC 25059',      evaluator: 'EVALUATOR', instrument: null,        sortOrder: 240, description: '합성 음성의 억양·속도·끊김이 사람의 말처럼 자연스러운 정도.' },
  { id: 'cross_modal_consistency',group: 'A_MODALITY', name: '모달 간 일관성',        isoRef: 'ISO/IEC 25059',      evaluator: 'EVALUATOR', instrument: null,        sortOrder: 250, description: '텍스트·이미지·음성 등 서로 다른 형태의 출력이 같은 내용을 모순 없이 전달하는 정도. 멀티모달 전용.' },

  // ── 게스트 자가평가 (코드 내부 속성 → 평가단 외부관찰 불가) ──
  { id: 'maintainability',        group: 'A_DEV',    name: '유지보수성',             isoRef: 'ISO/IEC 25010:2023', evaluator: 'DEVELOPER', instrument: null,        sortOrder: 310, description: '수정 용이성·모듈성·테스트 용이성. 게스트 자가평가.' },
  { id: 'flexibility',            group: 'A_DEV',    name: '유연성',                 isoRef: 'ISO/IEC 25010:2023', evaluator: 'DEVELOPER', instrument: null,        sortOrder: 320, description: '적응성·설치성·대체성(구 이식성). 게스트 자가평가.' },

  // ── B그룹 사용 품질 (ISO 25019:2023 · 별도 점수축) ──
  { id: 'overall_satisfaction',   group: 'B',        name: '전체 만족도',            isoRef: 'ISO/IEC 25019:2023', evaluator: 'EVALUATOR', instrument: 'CSAT_NPS',  sortOrder: 410, description: '전반적 만족·추천 의향. CSAT/NPS로 측정.' },
  { id: 'user_experience',        group: 'B',        name: '사용자 경험',            isoRef: 'ISO/IEC 25019:2023', evaluator: 'EVALUATOR', instrument: 'UEQ',       sortOrder: 420, description: '매력도·명료성·효율성·신뢰성·자극·신규성(6차원). UEQ로 측정.' },

  // ── C그룹 운영·메타 (플랫폼 운영 품질, A/B 와 합산하지 않는다) ──
  { id: 'eval_fatigue',           group: 'C',        name: '평가 피로도',            isoRef: 'NASA-TLX',           evaluator: 'EVALUATOR', instrument: 'NASA_TLX',  sortOrder: 510, description: '평가 수행의 인지 부하(6차원). 응답 신뢰도 보정용. 평가 종료 후 응답.' },
  { id: 'feedback_usefulness',    group: 'C',        name: '피드백 유용성',          isoRef: '운영 KPI',           evaluator: 'DEVELOPER', instrument: null,        sortOrder: 520, description: '리포트가 개발에 실제로 유용했는지. 게스트가 리포트 확인 후 응답.' },
] as const

async function main() {
  console.log('🌱 구성개념(Construct) 사전 시드 시작...')

  for (const c of constructs) {
    await prisma.construct.upsert({
      where: { id: c.id },
      update: {
        group: c.group,
        name: c.name,
        isoRef: c.isoRef,
        description: c.description,
        evaluator: c.evaluator,
        instrument: c.instrument,
        sortOrder: c.sortOrder,
        active: true,
      },
      create: {
        id: c.id,
        group: c.group,
        name: c.name,
        isoRef: c.isoRef,
        description: c.description,
        evaluator: c.evaluator,
        instrument: c.instrument,
        sortOrder: c.sortOrder,
        active: true,
      },
    })
  }

  const total = await prisma.construct.count()
  console.log(`구성개념 ${constructs.length}종 upsert 완료 (DB 총 ${total}행)`)
}

main()
  .catch((e) => {
    console.error('❌ 구성개념 시드 실패:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
