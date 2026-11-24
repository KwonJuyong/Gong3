"use server";

/**
 * 스테이징 로그인 화면의 테스트 계정 안내.
 *
 * NEXT_PUBLIC_ 빌드 변수 대신 런타임 env 를 서버에서 읽음. 그래야 같은 이미지를
 * 쓰면서 운영에서는 확실히 꺼 둘 수 있음
 * 계정 열거가 되지 않도록 DB 는 조회하지 않고 시드 목록만 돌려줌
 */

import {
  demoAccountsEnabled,
  stagingEmail,
  STAGING_ACCOUNTS,
  STAGING_PASSWORD,
} from "./lib/stagingAccounts";

export type DemoAccountRow = { email: string; name: string; role: string };
export type DemoAccountsPayload = {
  password: string;
  primary: DemoAccountRow[];
  students: DemoAccountRow[];
};

const ROLE_LABEL: Record<string, string> = { ADMIN: "관리자", DEVELOPER: "기업", USER: "학생" };

/** 켜져 있으면 안내할 계정 목록, 꺼져 있으면 `null`. */
export async function getDemoAccountsAction(): Promise<DemoAccountsPayload | null> {
  if (!demoAccountsEnabled()) return null;

  const toRow = (a: (typeof STAGING_ACCOUNTS)[number]): DemoAccountRow => ({
    email: stagingEmail(a.studentId),
    name: a.name,
    role: ROLE_LABEL[a.role] ?? a.role,
  });

  return {
    password: STAGING_PASSWORD,
    primary: STAGING_ACCOUNTS.filter((a) => a.role !== "USER").map(toRow),
    students: STAGING_ACCOUNTS.filter((a) => a.role === "USER").map(toRow),
  };
}
