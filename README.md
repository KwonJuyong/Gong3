<div align="center">

# AI 평가단

**학생이 직접 써 보고 평가하는 AI 에듀테크 서비스 품질평가 플랫폼**

학생이 과제를 하며 막힌 곳을 기록하고, 고친 버전에서 다시 확인하기까지. 의뢰부터 결제·정산까지 한곳에서 처리

[서비스](https://evalia.co.kr) · [시연 서버](https://try.evalia.co.kr) · 한림대학교 SW 캡스톤디자인 2026-2

![Next.js](https://img.shields.io/badge/Next.js_16-000000?logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?logo=tailwindcss&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)

</div>

![서비스 옆에 Evi를 띄워 과제를 진행하는 학생 화면](docs/images/accompany.jpg)

## 왜 만들었나

학습 도우미 챗봇, AI 튜터, 자동 채점처럼 학생이 쓰는 AI 서비스가 늘고 있습니다. 그런데 이런 서비스는 정답 세트로 잰 정확도만으로는 품질을 알기 어렵습니다.

- 생성형 AI는 같은 질문에도 답이 달라서, 미리 만든 정답 세트로는 학생이 실제로 겪는 문제를 다 찾지 못합니다
- 학습 효과는 학생이 안내를 이해하고 과제를 끝까지 해냈는지에서 갈리고, 이건 실제 사용 과정에서만 보입니다
- 학교에 들어가는 학습지원 소프트웨어는 도입 전에 기준을 확인하도록 바뀌어서, 실제 학습자 기준의 품질 근거가 필요해졌습니다

우리 팀은 학생 평가단을 운영하며 AI 에듀테크 서비스 5종을 13번 평가했고, 학생들이 낸 의견 12건이 개발팀 수정으로 이어졌습니다. 실사용자 평가의 효과는 분명했지만 반복하기는 어려웠습니다.

- 모집, 일정, 참여 확인, 보상 서류(청구서·신분증·통장 사본)를 매번 손으로 처리
- 같은 「로그아웃」 문제도 학생마다 「튕김」 한 단어부터 발생 시각·재현 조건까지 기록 수준이 제각각
- 점수가 4점대여도 서술에는 전원이 같은 문제를 적은 경우가 있어서, 점수만으로는 문제가 드러나지 않음
- 고친 버전을 같은 학생이 다시 확인한 기록이 없어서, 정말 나아졌는지 알 수 없음

AI 평가단은 이 과정을 하나로 묶습니다. 학생이 과제를 하며 막힌 순간을 대화로 남기고, 기업이 요청에 답하고, 고친 버전에서 같은 학생이 다시 확인하기까지를 의뢰부터 결제·정산까지 한 플랫폼에서 처리합니다.

## 평가 방식

평가를 만들 때 셋 중 하나를 고릅니다.

| 방식 | 이렇게 진행 | 받는 결과 |
|---|---|---|
| **Evi 동행 평가** | 과제와 완료 조건을 정하면 학생이 서비스를 쓰며 Evi와 대화로 기록 | 완료 조건별 예상 대비 실제, 쉬움 점수, 개선 요청과 회신, 고친 버전 재평가 |
| **표준 설문** | 서비스 유형에 맞춰 검증된 척도로 문항 구성(ISO/IEC 25010·25059 품질 특성 기준) | 품질 항목별 점수, 다른 회차·서비스와 같은 기준 비교 |
| **자유 설문** | 개설자가 문항을 직접 작성 | 응답 원본(엑셀 내보내기) |

![평가 만들기에서 방식 고르기](docs/images/methods.jpg)

## Evi 동행 평가는 이렇게 동작합니다

같은 학생이 같은 과제를 세 번 기록하고, 그 차이를 봅니다.

```
의뢰 인터뷰 ─▶ 검수·공개 ─▶ T0 사용 전 ─▶ T1 첫 사용 ─▶ 기업 회신 ─▶ T2 고친 버전
```

| 시점 | 기록 | 비교 |
|---|---|---|
| T0 사용 전 | 평소 하는 방법, 완료 조건별 예상, 예상 쉬움(1~7) | |
| T1 첫 사용 | 완료 조건별 달성, 실제 쉬움(1~7), 처음 막힌 순간과 상황, 개선 요청 | T1 − T0: 어디서 예상보다 어려웠나 |
| T2 고친 버전 | 같은 과제·같은 조건으로 다시 수행, 요청별 해결 여부 | T2 − T1: 고친 버전에서 해결됐나 |

- **의뢰 인터뷰**: Evi가 담당자와 대화하며 서비스, 학생 과제, 찾고 싶은 문제, 완료 조건(학생이 예/아니오로 답할 결과 2~5개), 버전을 정리합니다. 담당자가 말하지 않은 기능은 지어내지 않고 되묻습니다
- **학생 기록**: 넓은 화면에서는 평가할 서비스를 왼쪽에, Evi를 오른쪽에 띄워 과제 중에 바로 기록합니다. 사용 후에는 사전 응답을 보여 주지 않아 처음 예상에 끌리지 않게 했습니다
- **역할 분담**: 질문 순서와 저장 조건은 코드가 정하고, 언어 모델은 학생의 자유 서술을 개발사에 전달할 문장으로 정리하는 일만 합니다. 정리된 요청은 학생이 확인해야 저장됩니다

## 주요 기능

### 학생 평가자

- **평가 찾기와 신청**: 모집 중인 평가를 보고 신청, 선발되면 알림
- **Evi 동행 평가**: 서비스를 옆에 띄우고 대화로 예상·진행·막힌 순간·개선 요청 기록
- **설문 응답**: 평가할 서비스와 문항을 나란히 열고 응답, 도중에 나가도 같은 기기에서 이어서 작성
- **고친 버전 재확인**: 내 요청에 대한 기업 답을 받고, 새 버전에서 해결·부분 해결·미해결·확인 불가 중 하나로 확정
- **참여 보상 확인**: 받을 보상과 지급 내역, 계좌 등록

### 개설자 (교원·에듀테크 기업)

- **평가 만들기**: 동행 평가·표준 설문·자유 설문 중 선택, 모집 일정·인원·비용 처리를 마지막에 한 화면에서 설정
- **결과 화면**: 완료 조건별 예상·첫 사용·고친 버전 달성 비율과 쉬움 평균을 나란히 비교
- **요청 회신**: 학생 요청마다 수용·부분 수용·보류·미수용과 이유를 보내고, 고친 버전과 반영한 요청을 지정해 재평가 요청
- **표준 설문 결과**: 품질 항목별 점수와 약점 순위, 응답 내보내기

### 평가 의뢰와 정산

- **평가 의뢰·견적서**: 인원과 보상을 입력하면 보상·수수료·부가세가 계산된 견적서(PDF)와 의뢰를 한 번에
- **전자세금계산서**: 팝빌로 공급시기 기준 발행, 입금 여부에 따라 영수·청구 구분
- **원장 기반 정산**: 입출금을 덮어쓰지 않고 쌓는 원장에 기록하고, 원천징수세·부가세처럼 맡아 둔 돈은 따로 관리
- **참여 보상 지급**: 원천징수(기타소득 8.8%·사업소득 3.3%) 계산, 미달 인원 환불, 간이지급명세서 자료 집계
- **연구비 노무비 서류**: 참여 학생별 청구확인서를 만들고 신분증·통장 사본과 함께 사람별 폴더로 묶어 내려받기

### 운영

- **평가 승인과 과제 검수**: 공개 전 관리자 검토, 동행 평가는 과제 난이도와 확인 기준까지 점검 후 공개
- **AI 도우미**: 메신저에서 자연어로 데이터 조회(권한 범위 안에서만)
- **인증 준비 점검**: 소프트웨어 품질 인증을 준비할 때 확인할 항목 정리
- **AI News**: 모델 순위와 최신 소식 모아 보기
- **앱 설치**: PWA로 데스크톱·모바일에 설치, 웹 푸시 알림

## 화면

| Evi 의뢰 인터뷰 | 학생 요청 회신 |
|---|---|
| ![Evi 의뢰 인터뷰](docs/images/brief.jpg) | ![요청 회신](docs/images/requests.jpg) |
| **동행 평가 결과** | **고친 버전 재확인** |
| ![동행 평가 결과](docs/images/results.jpg) | ![고친 버전 재확인](docs/images/recheck.jpg) |
| **표준 설문 결과** | **평가 의뢰·견적** |
| ![표준 설문 결과](docs/images/result.png) | ![평가 의뢰](docs/images/order.png) |

동행 평가 화면은 가상 서비스로 만든 시험 계정 화면, 설문·의뢰 화면은 [시연 서버](https://try.evalia.co.kr)의 시연 계정 데이터

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프레임워크 | Next.js 16 (App Router, Server Actions) · React 19 |
| 언어·스타일 | TypeScript · Tailwind CSS 4 |
| 데이터 | Prisma · PostgreSQL 15 |
| 실시간 | Server-Sent Events(메신저·알림) |
| 외부 연동 | 팝빌(전자세금계산서·사업자 조회) · OpenAI(Evi 대화 정리·문항 초안·AI 도우미) · Web Push |
| 운영 | Docker Compose · GitHub Actions(CI) |

## 폴더 구조

```
app/
  page.tsx            로그인·회원가입
  dashboard/          로그인 후 화면(평가·서비스·의뢰·정산·관리)
    accompany/        Evi 동행 평가(의뢰 인터뷰, 학생 대화, 결과·요청·재평가)
  api/                라우트 핸들러(업로드, 실시간 메시지 등)
  components/         공용 컴포넌트
  lib/                도메인 로직(평가 구성, 승인, 정산, 세금, 조회)
prisma/
  schema.prisma       데이터 모델
  migrations/         마이그레이션
  seed*.ts            기본 시드(구성개념·테스트 계정·시연 데이터)
scripts/              자체 점검(세션·조회·사용량 한도·동행 평가·표기 규칙)
```

## 연구

| 논문 | 학술지 | 상태 |
|---|---|---|
| AI 에듀테크 서비스 평가를 위한 학생 평가단 운영 시스템의 개발 및 적용 | 한국디지털콘텐츠학회 「디지털콘텐츠학회논문지」(JDCS) | 2026년 10월 투고, 심사 중 |

평가 13회(2025.6 ~ 2026.10)의 학생 응답·참여 이력·보상 처리 기록에서 요구사항을 뽑고, 이 저장소의 문항–응답 연결, 참여 상태 추적, 보상 청구 서류 생성으로 구현해 실제 평가에 적용한 결과를 정리했습니다. 동행 평가 기록으로 개선 요청이 어떻게 처리되는지 분석하는 후속 연구를 이어서 진행하고 있습니다.

## 팀

| 이름 | 개발 | 연구 | GitHub |
|---|---|---|---|
| 권주용 | 백엔드 | 논문 작성 | [KwonJuyong](https://github.com/KwonJuyong) |
| 진형준 | 프론트엔드 | IRB·행정 절차 | [hyungjunjin](https://github.com/hyungjunjin) |
| 서지은 | 디자인 | QA·피드백 관리 | [Seojieun9](https://github.com/Seojieun9) |

맡은 화면·파일과 작업 순서: [개인 기여 명세](docs/contributions.md) · 화면 설계: [Figma](https://www.figma.com/design/qNMyBI2a235FoOp7HTYNuS/%EC%86%8C%EC%9C%B5%EC%BA%A1%EC%8A%A4%ED%86%A4?node-id=0-1)

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
