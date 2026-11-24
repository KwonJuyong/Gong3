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

export type StagingAccount = {
  studentId: string;
  name: string;
  major: string;
  role: "ADMIN" | "DEVELOPER" | "USER";
  userType: "STAFF" | "DEVELOPER" | "STUDENT";
  desc: string;
};

/**
 * 배포 때 자동으로 만드는 계정(prisma/seedStagingUsers.ts).
 * 관리자 1 · 기업 2 · 학생 20. role(권한)과 userType(표시)은 함께 바꿈
 */
export const STAGING_ACCOUNTS: readonly StagingAccount[] = [
  { studentId: "admin", name: "관리자", major: "운영", role: "ADMIN", userType: "STAFF", desc: "승인 · 관리" },
  { studentId: "company1", name: "기업 1", major: "테스트기업1", role: "DEVELOPER", userType: "DEVELOPER", desc: "평가 개설" },
  { studentId: "company2", name: "기업 2", major: "테스트기업2", role: "DEVELOPER", userType: "DEVELOPER", desc: "평가 개설" },
  ...Array.from({ length: 20 }, (_, i): StagingAccount => ({
    studentId: `student${i + 1}`,
    name: `학생 ${i + 1}`,
    major: "테스트",
    role: "USER",
    userType: "STUDENT",
    desc: "평가 참여",
  })),
];

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
