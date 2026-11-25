# 개인 기여 명세

공세마리(권주용 · 진형준 · 서지은), 한림대학교 소프트웨어캡스톤디자인 2026-2

개발은 운영 서버와 연결된 비공개 저장소에서 진행하고, 이 저장소에는 정리된 변경을 모아 반영합니다. 그래서 이 저장소의 커밋은 대부분 반영 담당인 권주용 계정으로 기록되어 있습니다. 누가 어떤 부분을 맡았는지는 아래 표와 파일 경로를 기준으로 봐 주세요.

## 한눈에 보기

| 이름 | 역할 | 맡은 영역 | 주요 위치 |
|---|---|---|---|
| 권주용 | 팀장 · 백엔드 | 데이터 모델, 인증·권한, 평가 처리, Evi 서버 로직, 결제·정산, 배포 | `prisma/`, `app/lib/`, `*actions.ts`, `app/api/` |
| 진형준 | 프론트엔드 | 대시보드 틀, 학생·개설자 화면, Evi 동행 평가 화면, 공용 컴포넌트 | `app/dashboard/**/*.tsx`, `app/components/` |
| 서지은 | 디자인 · QA | Figma 화면 설계, 디자인 토큰·아이콘·Evi 캐릭터, 화면 점검과 피드백 정리 | [Figma](https://www.figma.com/design/qNMyBI2a235FoOp7HTYNuS/%EC%86%8C%EC%9C%B5%EC%BA%A1%EC%8A%A4%ED%86%A4?node-id=0-1), `app/globals.css`, `app/components/Icon.tsx` |

작업 순서는 대체로 Figma 시안(서지은) → 화면 구현(진형준) → 서버·데이터 연결(권주용) → 화면 점검(서지은) → 수정입니다.

## 권주용 · 백엔드

- **데이터 모델**: 평가·응답·의뢰·보상·원장 등 46개 모델과 마이그레이션 (`prisma/schema.prisma`, `prisma/migrations/`)
- **인증과 권한**: 세션 쿠키, 역할별 접근, 재인증, 사용량 한도, 업로드 파일 검사 (`app/lib/`, `proxy.ts`)
- **평가 처리**: 평가 만들기·승인·모집·선발·응답 저장의 서버 액션. 응답 시점의 설문 판본 보존
- **Evi 서버 로직**: 다음에 물을 칸과 저장 조건은 코드로 정하고, 자유 서술 정리만 언어 모델(OpenAI)에 맡기는 구조 (`app/dashboard/accompany/coach-actions.ts`)
- **결제·정산**: 견적서 PDF, 팝빌 전자세금계산서 발행, 입출금 원장(현금·부채 분리), 원천징수 계산, 노무비 청구 서류 묶음 (`app/lib/payments.ts`, `ledger.ts`, `withholding.ts`, `popbill.ts`)
- **배포**: Docker Compose로 운영·시연·스테이징 분리, 배포 전 스테이징 확인과 DB 백업
- **연구**: 지난 평가 기록 분석, 논문 작성

## 진형준 · 프론트엔드

- **대시보드 틀**: 왼쪽 메뉴, 상단 머리글, 알림 종, 프로필 메뉴, 화면 오른쪽 아래 Evi·메신저 창 (`app/dashboard/layout.tsx`, `NavRail.tsx`, `AppHeader.tsx`, `NotificationBell.tsx`, `FloatingHub.tsx`)
- **학생 화면**: 평가 찾기·신청, 응답 화면, 평가할 서비스를 옆에 띄우는 분할 보기, 참여 보상 확인 (`DashboardView.tsx`, `EvalForm.tsx`, `EvalServiceLink.tsx`, `MyRewardsPanel.tsx`)
- **Evi 동행 평가 화면**: 학생 대화 화면(버튼 응답, 막힘 기록, 이전 답 고치기), 서비스와 Evi를 나란히 두는 분할 화면과 칸 너비 조절 (`app/dashboard/accompany/QuestChat.tsx`, `ServiceSplit.tsx`, `HubDock.tsx`)
- **개설자 화면**: Evi 의뢰 인터뷰, 결과·요청·학생·재평가 탭으로 나눈 관리 화면, 모집 설정 (`BriefInterview.tsx`, `ManagerBoard.tsx`, `Report.tsx`, `RecruitForm.tsx`)
- **의뢰·결과 화면**: 평가 의뢰와 견적 입력, 결과 보기 (`app/dashboard/orders/`, `DashboardResultView.tsx`)
- **공용 컴포넌트**: 중복 제출을 막는 제출 버튼, 되돌릴 수 없는 조작 확인 버튼, 비밀번호·전화번호 입력, Esc 닫기 (`app/components/`)
- **반응형과 키보드 사용**: 390px 폰 폭과 1440px 데스크톱 폭 점검, 버튼을 누른 뒤 다음 선택지로 초점 이동
- **연구 행정**: IRB 심의 절차 준비

## 서지은 · 디자인 · QA

- **화면 설계**: 학생·개설자·운영자 화면 흐름과 주요 화면 시안 ([Figma](https://www.figma.com/design/qNMyBI2a235FoOp7HTYNuS/%EC%86%8C%EC%9C%B5%EC%BA%A1%EC%8A%A4%ED%86%A4?node-id=0-1))
- **디자인 토큰**: 회색 단계, 행동 버튼에만 쓰는 남색(`--accent` #1E2B4F), 상태색. 작은 글씨에서도 명암 대비 4.5:1 이상이 나오도록 색을 정함 (`app/globals.css`)
- **아이콘과 캐릭터**: 공용 아이콘 세트, Evi 캐릭터(남색 원에 흰 눈과 미소), 로고 (`app/components/Icon.tsx`, `EviAvatar.tsx`, `public/brand/`)
- **화면 규칙**: 색은 토큰만 쓰기, 보조 글씨 최소 밝기, 최소 글씨 크기, 페이지에는 제목과 본문만 두기 등 README의 작업 규칙
- **QA**: 폰·데스크톱 폭에서 학생·개설자 흐름을 직접 따라가며 막히는 곳 정리, 수정 요청과 재확인
- **피드백 관리**: 평가에 참여한 학생과 의뢰 기관의 의견을 모아 수정 목록으로 정리
- **화면 자료**: README와 발표에 쓰는 화면 캡처 (`docs/images/`)
