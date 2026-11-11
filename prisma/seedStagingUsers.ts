import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'
import {
  STAGING_ACCOUNTS as users,
  STAGING_PASSWORD as PW,
  stagingEmail as emailOf,
} from '../app/lib/stagingAccounts'

const prisma = new PrismaClient()

// 스테이징 전용 테스트 계정. 운영 학생 데이터(seed.ts)는 넣지 않음
// 목록과 비밀번호는 app/lib/stagingAccounts.ts 에서 가져옴(로그인 화면 안내와 같은 값).
// 로그인 ID 가 이메일이므로 email 과 emailVerifiedAt 을 함께 채움

async function main() {
  console.log('스테이징 테스트 계정 시드 시작...')
  const hash = await bcrypt.hash(PW, 10)

  for (const u of users) {
    const email = emailOf(u.studentId)
    // 기존 행에도 이메일을 채우도록 update 에도 넣음(매 배포마다 같은 값으로 맞춤).
    const fields = {
      name: u.name,
      major: u.major,
      role: u.role,
      userType: u.userType,
      email,
      emailVerifiedAt: new Date(),
    }
    await prisma.user.upsert({
      where: { studentId: u.studentId },
      update: fields,
      create: { studentId: u.studentId, password: hash, ...fields },
    })
  }

  const total = await prisma.user.count()
  console.log(`테스트 계정 ${users.length}개 upsert 완료 (DB 총 ${total}명)`)
  console.log(`   로그인 ID 는 **이메일**이다 — 학번·아이디로는 로그인되지 않는다.`)
  for (const u of users) console.log(`   ${emailOf(u.studentId).padEnd(24)} ${u.role.padEnd(9)} ${u.name}`)
  console.log(`   비밀번호는 모두 ${PW}`)
}

main()
  .catch((e) => {
    console.error('테스트 계정 시드 실패:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
