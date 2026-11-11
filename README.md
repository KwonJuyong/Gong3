<div align="center">

# AI 평가단

**학생이 직접 써 보고 평가하는 AI 에듀테크 서비스 품질평가 플랫폼**

학생 평가자 모집부터 평가문항 구성, 응답 수집, 평가 결과, 참여 보상 정산까지 한곳에서 처리

[서비스](https://evalia.co.kr) · [시연 서버](https://try.evalia.co.kr) · 한림대학교 SW 캡스톤디자인 2026-2

![Next.js](https://img.shields.io/badge/Next.js_16-000000?logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?logo=tailwindcss&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)

</div>

![표준 기반으로 구성된 평가](docs/images/detail.png)

## 왜 만들었나

학습 도우미 챗봇, AI 튜터, 자동 채점처럼 학생이 쓰는 AI 서비스가 늘고 있지만, 실제 학생이 써 봤을 때 어떤지 확인하는 과정은 대부분 수작업입니다.

- 평가할 학생을 매번 따로 모집하고 선발
- 무엇을 물어볼지 정하는 기준이 평가마다 다름
- 응답 정리, 참여 보상 지급, 세금 처리가 엑셀과 메일로 흩어짐

AI 평가단은 이 과정을 하나의 흐름으로 묶습니다. 서비스를 등록하면 국제 표준(ISO/IEC 25010·25059)에 맞춰 평가 항목과 문항이 구성되고, 학생 평가자가 서비스를 직접 사용하며 응답하고, 결과와 보상 정산까지 플랫폼 안에서 이어집니다.

## 이렇게 동작합니다

```
 서비스 등록  ─▶  평가 구성  ─▶  모집·선발  ─▶  응답  ─▶  평가 결과  ─▶  보상 정산
 (유형·속성)     (표준 기반)     (학생 평가자)   (서비스 사용)  (문항별 분포)    (지급·세무)
```

## 주요 기능

### 학생 평가자

- **평가 찾기와 신청**: 모집 중인 평가를 보고 신청, 선발되면 알림
- **서비스를 옆에 띄우고 응답**: 평가할 서비스와 문항을 한 화면에 나란히 열기
- **임시 저장**: 응답 도중 나가도 같은 기기에서 이어서 작성
- **참여 보상 확인**: 받을 보상과 지급 내역, 계좌 등록

### 개설자 (교원·에듀테크 기업)

- **표준 기반 평가 구성**: 서비스 유형과 속성(AI 서비스, 추천·개인화, 개인정보 수집 등)을 고르면 그에 맞는 평가 항목과 검증된 측정 문항을 자동으로 구성
- **AI 문항 초안**: 서비스 설명을 바탕으로 문항 초안을 만들고 직접 다듬기
- **모집·선발 관리**: 정원, 마감, 신청자 선발
- **평가 결과**: 문항별 점수 분포와 응답 내보내기

### 평가 의뢰와 정산

- **평가 의뢰·견적서**: 인원과 보상을 입력하면 견적서(PDF)와 의뢰를 한 번에
- **전자세금계산서**: 공급시기 기준 발행, 입금 여부에 따라 영수·청구 구분
- **참여 보상 지급**: 원천징수를 반영한 지급과 원장 기반 정산 기록

### 운영

- **평가 승인**: 공개 전 관리자 검토
- **AI 도우미**: 메신저에서 자연어로 데이터 조회(권한 범위 안에서만)
- **인증 준비 점검**: 소프트웨어 품질 인증을 준비할 때 확인할 항목 정리
- **AI News**: 모델 순위와 최신 소식 모아 보기
- **앱 설치**: PWA로 데스크톱·모바일에 설치, 웹 푸시 알림

## 화면

| 서비스 등록 | 평가 찾기 |
|---|---|
| ![서비스 등록](docs/images/services.png) | ![평가 찾기](docs/images/find.png) |
| **평가 결과** | **평가 의뢰·견적** |
| ![평가 결과](docs/images/result.png) | ![평가 의뢰](docs/images/order.png) |

화면은 [시연 서버](https://try.evalia.co.kr)의 시연 계정 데이터

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프레임워크 | Next.js 16 (App Router, Server Actions) · React 19 |
| 언어·스타일 | TypeScript · Tailwind CSS 4 |
| 데이터 | Prisma · PostgreSQL 15 |
| 실시간 | Server-Sent Events(메신저·알림) |
| 외부 연동 | 팝빌(전자세금계산서·사업자 조회) · OpenAI(문항 초안·AI 도우미) · Web Push |
| 운영 | Docker Compose · GitHub Actions(CI) |

## 폴더 구조

```
app/
  page.tsx            로그인·회원가입
  dashboard/          로그인 후 화면(평가·서비스·의뢰·정산·관리)
  api/                라우트 핸들러(업로드, 실시간 메시지 등)
  components/         공용 컴포넌트
  lib/                도메인 로직(평가 구성, 승인, 정산, 세금, 조회)
prisma/
  schema.prisma       데이터 모델
  migrations/         마이그레이션
  seed*.ts            기본 시드(구성개념·테스트 계정·시연 데이터)
scripts/              자체 점검(세션·조회·사용량 한도·표기 규칙)
```

## 팀

| 이름 | 개발 | 연구 | GitHub |
|---|---|---|---|
| 권주용 | 백엔드 | 논문 작성 | [KwonJuyong](https://github.com/KwonJuyong) |
| 진형준 | 프론트엔드 | IRB·행정 절차 | [hyungjunjin](https://github.com/hyungjunjin) |
| 서지은 | 디자인 | QA·피드백 관리 | [Seojieun9](https://github.com/Seojieun9) |

## 로컬 실행

필요: Node.js 24 LTS, Docker(개발 DB)

```bash
npm ci
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

테스트 계정·비밀번호는 로그인 화면 오른쪽에 표시. 실제 개인정보·운영 DB·운영 API 키 사용 금지.

Windows PowerShell에서는 `npm.cmd`·`npx.cmd` 사용. 시연 데이터 명령의 `DEMO_SEED=1` 대신 다음과 같이 실행:

```powershell
$env:DEMO_SEED = "1"
node --conditions=react-server -r ts-node/register prisma/seedDemoOrder.ts --ensure
Remove-Item Env:DEMO_SEED
```

검증 명령:

```bash
npx prisma generate
npm run verify
npm run build
```

- `verify`: 타입·린트·표기 규칙·세션·조회 권한·사용량·업로드 및 주소 검사
- `build`: 배포용 번들 및 라우트 생성 확인
- DB는 `127.0.0.1:5433`에만 개방
- 민감 첨부 기능 사용 시 로컬 전용 `RRN_SECRET` 설정 필요
- 검증도구 문항 시드와 국세청 엑셀 원본 양식은 배포 대상에서 제외. 해당 기능은 공개 저장소만으로 전체 재현 불가

점검 결과와 남은 검증: [협업 전 점검](docs/review.md)

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
