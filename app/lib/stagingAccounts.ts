/**
 * 스테이징 시연 계정. 로그인 화면의 계정 안내 패널과 시드 스크립트가 함께 읽음
 *
 * 비밀번호가 화면에 그대로 보이므로 스테이징용 더미 계정만 넣음
 * 도메인은 RFC 2606 예약 도메인(example.com)이라 메일이 실제로 가지 않음
 */

/** `deploy-staging.sh` 가 매 배포마다 심는 계정의 공통 비밀번호. */
export const STAGING_PASSWORD = "test1234!";

/** `prisma/seedDemoOrder.ts`(수동 시드)가 만드는 마켓플레이스 시연 계정의 공통 비밀번호. */
export const DEMO_PASSWORD = "demo1234!";

/** 로그인 ID. `studentId` 는 화면 표시용으로만 남음 */
export const stagingEmail = (studentId: string) => `${studentId}@example.com`;

/**
 * 배포 때 자동으로 만드는 계정(prisma/seedStagingUsers.ts).
 * role(권한)과 userType(표시)은 함께 바꿈. 교직원은 STAFF + DEVELOPER 다.
 */
export const STAGING_ACCOUNTS = [
  { studentId: "admin", name: "스테이징관리자", major: "운영", role: "ADMIN", userType: "STAFF", desc: "회원 관리 · 평가 승인 · 정산 검수" },
  { studentId: "prof1", name: "김교수", major: "AI융합", role: "DEVELOPER", userType: "DEVELOPER", desc: "평가 개설 · 문항 생성" },
  { studentId: "prof2", name: "이교수", major: "소프트웨어", role: "DEVELOPER", userType: "DEVELOPER", desc: "평가 개설 · 문항 생성" },
  { studentId: "tester1", name: "평가자1", major: "테스트", role: "USER", userType: "STUDENT", desc: "평가 참여 · 보상 확인" },
  { studentId: "tester2", name: "평가자2", major: "테스트", role: "USER", userType: "STUDENT", desc: "평가 참여 · 보상 확인" },
  { studentId: "tester3", name: "평가자3", major: "테스트", role: "USER", userType: "STUDENT", desc: "평가 참여 · 보상 확인" },
  { studentId: "tester4", name: "평가자4", major: "테스트", role: "USER", userType: "STUDENT", desc: "평가 참여 · 보상 확인" },
  { studentId: "tester5", name: "평가자5", major: "테스트", role: "USER", userType: "STUDENT", desc: "평가 참여 · 보상 확인" },
] as const;

/** 마켓플레이스 시연 계정: 발주 기업 1 + 평가단 6 */
export const DEMO_BUYER_EMAIL = "demo-buyer@example.com";
export const DEMO_STUDENT_EMAILS = [1, 2, 3, 4, 5, 6].map((i) => `demo-student${i}@example.com`);

/**
 * 안내 패널을 켤지. SHOW_DEMO_ACCOUNTS 가 정확히 "true" 일 때만 켜고, 값이 없거나 다르면 끔
 * 운영 환경에는 이 변수를 두지 않음
 */
export function demoAccountsEnabled(): boolean {
  return process.env.SHOW_DEMO_ACCOUNTS === "true";
}
