/** 화면에 보이는 역할 이름 */
export function roleLabel(role: string, userType?: string | null): string {
  if (role === "ADMIN") return "최고관리자";
  if (role !== "DEVELOPER") return "학생 평가자";
  return userType === "STAFF" ? "교직원·조교" : "기업";
}
