"use server";

/**
 * 스테이징 로그인 화면의 테스트 계정 안내.
 *
 * NEXT_PUBLIC_ 빌드 변수 대신 런타임 env 를 서버에서 읽는다. 그래야 같은 이미지를
 * 쓰면서 운영에서는 확실히 꺼 둘 수 있다.
 * 계정 열거가 되지 않도록 DB 는 조회하지 않고 시드 목록만 돌려준다.
 */

import {
  demoAccountsEnabled,
  stagingEmail,
  STAGING_ACCOUNTS,
  STAGING_PASSWORD,
  DEMO_PASSWORD,
  DEMO_BUYER_EMAIL,
  DEMO_STUDENT_EMAILS,
} from "./lib/stagingAccounts";

export type DemoAccountRow = { email: string; name: string; role: string; desc: string };
export type DemoAccountGroup = { title: string; caption: string; password: string; rows: DemoAccountRow[] };

/** 화면에 보일 역할 이름. 역할 칸이 좁아 영문 코드 값은 넘친다. */
const ROLE_LABEL: Record<string, string> = { ADMIN: "관리자", DEVELOPER: "교수", USER: "학생" };

/** 켜져 있으면 안내할 계정 그룹들, 꺼져 있으면 `null`. */
export async function getDemoAccountsAction(): Promise<DemoAccountGroup[] | null> {
  if (!demoAccountsEnabled()) return null;

  return [
    {
      title: "기본 계정",
      caption: "배포할 때마다 자동으로 심긴다",
      password: STAGING_PASSWORD,
      rows: STAGING_ACCOUNTS.map((a) => ({
        email: stagingEmail(a.studentId),
        name: a.name,
        role: ROLE_LABEL[a.role] ?? a.role,
        desc: a.desc,
      })),
    },
    {
      title: "시연용 계정",
      caption: "발주·정산 시나리오용 · 배포 시 함께 심긴다",
      password: DEMO_PASSWORD,
      rows: [
        { email: DEMO_BUYER_EMAIL, name: "(주)시연테크", role: "기업", desc: "평가 발주 · 견적서 · 세금계산서" },
        ...DEMO_STUDENT_EMAILS.map((email, i) => ({
          email,
          name: `시연학생${i + 1}`,
          role: "학생",
          desc: "평가 응답 · 보상 수령",
        })),
      ],
    },
  ];
}
