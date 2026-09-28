# AI 평가단 플랫폼

사용자 참여 기반 AI 서비스 품질평가 플랫폼. 학생 평가단이 AI 서비스를 써 보고 응답하면,
표준(ISO/IEC 25010·25059) 기반 구성개념으로 결과를 모으고 평가 의뢰·참여 보상 정산까지 한 곳에서 처리한다.

- 스택: Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Prisma · PostgreSQL
- 한림대학교 캡스톤디자인

<!-- 팀 구성(이름·역할·GitHub 아이디)을 여기에 적는다. -->

## 로컬에서 돌리기

필요한 것: Node.js 20 이상, Docker(개발 DB 용)

```bash
npm install
docker compose -f docker-compose.dev.yml up -d      # PostgreSQL 15 (localhost:5433)
cp .env.example .env
```

`.env` 에서 최소한 아래 값을 채운다.

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

테스트 계정과 비밀번호는 로그인 화면 오른쪽에 표시된다.

## 작업 방법

1. `main` 에서 브랜치를 딴다 — `design/<화면>`, `fix/<내용>` 처럼.
2. 커밋 메시지는 `feat:` / `fix:` / `design:` / `refactor:` + 한국어.
3. PR 을 연다. **UI 변경은 전·후 캡처 필수**(폰 폭·데스크톱 폭). CI(타입·린트·자체 점검)가 통과해야 한다.
4. 관리자 리뷰 후 합쳐진다. 배포는 관리자가 한다.

### 지켜 줄 것

- 페이지는 **제목과 본문만** 그린다. 로고·알림·프로필·로그아웃은 공용 헤더(`app/dashboard/layout.tsx`)가 그린다.
- 제출 버튼은 `SubmitButton`, 되돌릴 수 없는 조작은 `ConfirmButton` (`app/components/`). `alert()`·`confirm()` 금지.
- 내부 이동은 `next/link`.
- 색은 `app/globals.css` 토큰만. 글자에 `--gray-400` 금지(대비 부족), 최소 글씨 `text-xs`.
- 인증·권한·돈 계산(`app/api/`, `*actions.ts`, `app/lib/`, `middleware.ts`, `prisma/`)은 UI 작업 범위가 아니다.
  고쳐야 하면 PR 설명에 이유를 적는다.
- `.env` 와 실제 사람의 정보(이름·학번·전화번호)는 절대 커밋하지 않는다.

## 라이선스

별도 라이선스를 부여하지 않는다(All rights reserved). 열람은 자유지만 복제·재배포·상업적 이용은 허락이 필요하다.
