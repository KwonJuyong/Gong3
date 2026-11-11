/**
 * 로그인 ID(학번·사번·게스트 이메일) 마스킹. 관리자가 아니면 다른 사용자의 ID 를 일부만 보여줌
 * 게스트는 studentId 가 이메일이므로 이메일도 가림. 동명이인 구분을 위해 도메인은 남김
 */
export function maskStudentId(
  studentId: string | null | undefined,
  isAdmin: boolean,
): string {
  const sid = (studentId || "").trim();
  if (!sid) return sid;
  if (isAdmin) return sid; // 관리자는 전체 열람 허용

  const at = sid.indexOf("@");
  if (at > 0) {
    const local = sid.slice(0, at);
    const domain = sid.slice(at); // "@" 포함
    // 로컬파트가 짧으면 첫 글자만 남김
    const keep = local.length <= 3 ? 1 : 2;
    return local.slice(0, keep) + "••••" + domain;
  }

  if (sid.length <= 4) return sid;
  return sid.slice(0, 4) + "••••";
}
