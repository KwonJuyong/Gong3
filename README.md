# AI 평가단 플랫폼

사용자 참여 기반 AI 서비스 품질평가 플랫폼. 학생 평가단의 AI 서비스 사용 평가를 표준(ISO/IEC 25010·25059) 기반 구성개념으로 수집하고, 평가 의뢰·참여 보상 정산까지 처리.

- 스택: Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Prisma · PostgreSQL
- 한림대학교 캡스톤디자인

<!-- 팀 구성(이름·역할·GitHub 아이디) 기재 -->

## 로컬 실행

필요: Node.js 20 이상, Docker(개발 DB)

```bash
npm install
docker compose -f docker-compose.dev.yml up -d      # PostgreSQL 15 (localhost:5433)
cp .env.example .env
```

`.env` 최소 설정:

```
DATABASE_URL=postgresql://dev:dev@localhost:5433/aieval?schema=public
SESSION_SECRET=<32자 이상 아무 문자열>
SHOW_DEMO_ACCOUNTS=true        # 로그인 화면에 테스트 계정 안내
```

```bash
npx prisma generate
npx prisma migrate deploy
npx ts-node prisma/seedConstructs.ts                 # 구성개념 사전
npx ts-node prisma/seedVignettes.ts                  # 앵커링 비네트
npx ts-node prisma/seedStagingUsers.ts               # 테스트 계정(관리자·교수·학생·기업)
DEMO_SEED=1 node --conditions=react-server -r ts-node/register prisma/seedDemoOrder.ts --ensure   # 시연 데이터
npm run dev                                          # http://localhost:3000
```

테스트 계정·비밀번호는 로그인 화면 오른쪽에 표시.

## 작업 방법

1. `main` 에서 브랜치 생성: `design/<화면>`, `fix/<내용>`
2. 커밋 메시지: `feat:` / `fix:` / `design:` / `refactor:` + 한국어
3. PR 생성. UI 변경은 전·후 캡처 필수(폰 폭·데스크톱 폭). CI(타입·린트·자체 점검) 통과 필수
4. 관리자 리뷰 후 병합. 배포는 관리자 담당

### 규칙

- 페이지는 제목·본문만. 로고·알림·프로필·로그아웃은 공용 헤더(`app/dashboard/layout.tsx`)
- 제출 버튼은 `SubmitButton`, 되돌릴 수 없는 조작은 `ConfirmButton`(`app/components/`). `alert()`·`confirm()` 금지
- 내부 이동은 `next/link`
- 색은 `app/globals.css` 토큰만. 글자에 `--gray-400` 금지(대비 부족), 최소 글씨 `text-xs`
- 인증·권한·돈 계산(`app/api/`, `*actions.ts`, `app/lib/`, `middleware.ts`, `prisma/`)은 UI 작업 범위 밖. 수정 필요 시 PR 설명에 이유 기재
- `.env`·실제 사람의 정보(이름·학번·전화번호) 커밋 금지

## 라이선스

별도 라이선스 없음(All rights reserved). 열람 자유, 복제·재배포·상업적 이용은 허락 필요.
