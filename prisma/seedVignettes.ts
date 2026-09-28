import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// 앵커링 비네트 시드 — 평가자 척도사용 편차 보정용 고정 시나리오.
// 각 구성개념마다 의도된 품질 오름차순 3단계(level 1=낮음, 2=중간, 3=높음).
// 검증도구(verbatim)와 달리 비네트는 플랫폼이 직접 저작하는 고정 템플릿.
// 평가단은 실제 문항과 동일한 5점 척도로 각 시나리오를 평가한다.
const vignettes: { constructId: string; level: number; text: string }[] = [
  // 기능 적합성
  { constructId: 'func_suitability', level: 1, text: '핵심 기능 중 상당수가 동작하지 않거나, 수행해도 결과가 자주 틀린다.' },
  { constructId: 'func_suitability', level: 2, text: '핵심 기능은 대체로 동작하지만, 일부 기능이 부정확하거나 빠져 있다.' },
  { constructId: 'func_suitability', level: 3, text: '명시된 기능을 빠짐없이, 정확하게 수행한다.' },

  // 성능 효율
  { constructId: 'performance_efficiency', level: 1, text: '응답이 매우 느리고 자주 멈춰서 사용하기 답답하다.' },
  { constructId: 'performance_efficiency', level: 2, text: '대체로 무난하지만 특정 작업에서 눈에 띄게 느려질 때가 있다.' },
  { constructId: 'performance_efficiency', level: 3, text: '거의 모든 작업이 즉각적으로 처리되어 기다림이 느껴지지 않는다.' },

  // 신뢰성
  { constructId: 'reliability', level: 1, text: '사용 중 오류나 장애가 자주 발생하고, 복구도 잘 되지 않는다.' },
  { constructId: 'reliability', level: 2, text: '가끔 오류가 있지만 대부분 곧 정상으로 돌아온다.' },
  { constructId: 'reliability', level: 3, text: '오류 없이 안정적으로 동작하며, 문제가 생겨도 빠르게 복구된다.' },

  // 보안
  { constructId: 'security', level: 1, text: '개인정보나 입력 내용이 보호된다는 느낌이 전혀 들지 않는다.' },
  { constructId: 'security', level: 2, text: '기본적인 보호는 되는 듯하지만 일부 불안한 부분이 있다.' },
  { constructId: 'security', level: 3, text: '인증·데이터 처리가 신뢰할 수 있게 이루어져 안심하고 쓸 수 있다.' },

  // 출력 정확성 (AI)
  { constructId: 'output_correctness', level: 1, text: 'AI의 답변이 사실과 다르거나 엉뚱한 경우가 매우 잦다.' },
  { constructId: 'output_correctness', level: 2, text: 'AI의 답변이 대체로 맞지만, 틀리거나 모호한 경우가 종종 있다.' },
  { constructId: 'output_correctness', level: 3, text: 'AI의 답변이 거의 항상 정확하고 신뢰할 수 있다.' },
]

async function main() {
  console.log('🌱 앵커링 비네트 시드 시작...')

  // 시드 대상 구성개념이 실제로 존재하는지 확인(무결성)
  const ids = Array.from(new Set(vignettes.map((v) => v.constructId)))
  const found = await prisma.construct.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  })
  const foundSet = new Set(found.map((c) => c.id))
  const missing = ids.filter((id) => !foundSet.has(id))
  if (missing.length > 0) {
    console.warn(`주의: 존재하지 않는 구성개념(건너뜀): ${missing.join(', ')}`)
  }

  let count = 0
  for (const v of vignettes) {
    if (!foundSet.has(v.constructId)) continue
    await prisma.vignette.upsert({
      where: { constructId_level: { constructId: v.constructId, level: v.level } },
      update: { text: v.text, scaleType: 'LIKERT_5', active: true },
      create: { constructId: v.constructId, level: v.level, text: v.text, scaleType: 'LIKERT_5' },
    })
    count++
  }

  const byConstruct = await prisma.vignette.groupBy({ by: ['constructId'], _count: true })
  console.log(`앵커링 비네트 ${count}개 upsert 완료`)
  console.log('   구성개념별:', byConstruct.map((b) => `${b.constructId}:${b._count}`).join(', '))
}

main()
  .catch((e) => {
    console.error('❌ 비네트 시드 실패:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
