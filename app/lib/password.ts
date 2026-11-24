/**
 * 새 비밀번호 검사(가입·변경·재설정·인계 공통). 조합 규칙은 두지 않고 흔한 비밀번호만 거절함
 * 근거: NIST SP 800-63B-4 3.1.1.2(흔한·추측 가능한 비밀번호 목록 대조, 거절 사유 안내, 조합 규칙 금지)
 */

export const PASSWORD_MIN = 8;
// bcrypt 는 72바이트 뒤를 버려 그 뒤 글자가 검증되지 않음
const BCRYPT_MAX_BYTES = 72;

// 공개 유출 목록 상위권 중 8자 이상과 이 서비스 이름에서 나온 값. 전체 일치만 비교함
const COMMON = new Set([
  "12345678", "123456789", "1234567890", "0123456789", "87654321", "987654321", "12341234", "12344321",
  "123123123", "11111111", "00000000", "88888888", "11223344", "1q2w3e4r", "1q2w3e4r5t", "1q2w3e4r!",
  "q1w2e3r4", "1qaz2wsx", "qwer1234", "qwer1234!", "1234qwer", "asdf1234", "zxcv1234", "abcd1234",
  "abc12345", "a1234567", "a12345678", "a123456789", "qwe12345", "qwerty12", "qwerty123", "qwertyuiop",
  "asdfghjk", "asdfasdf", "zxcvbnm1", "password", "password1", "password123", "passw0rd", "iloveyou",
  "sunshine", "princess", "football", "baseball", "superman", "welcome1", "admin123", "letmein1",
  "evalia123", "evalia1234", "hallym123", "hallym1234", "aipyeongga",
]);

export function passwordProblem(password: string, context: (string | null | undefined)[] = []): string | null {
  if (password.length < PASSWORD_MIN) return `비밀번호는 ${PASSWORD_MIN}자 이상이어야 합니다.`;
  if (new TextEncoder().encode(password).length > BCRYPT_MAX_BYTES) {
    return "비밀번호가 너무 깁니다. 영문 기준 72자 이하로 정해 주세요.";
  }
  const p = password.toLowerCase();
  const words = context
    .flatMap((c) => {
      const v = (c || "").trim().toLowerCase();
      return v.includes("@") ? [v, v.split("@")[0]] : [v];
    })
    .filter((v) => v.length >= 3);
  // 학번·이메일·이름 뒤에 숫자·기호만 붙인 값도 같은 값으로 봄
  const derived = words.some((w) => p === w || (p.startsWith(w) && /^[^a-z가-힣]*$/.test(p.slice(w.length))));
  if (derived) return "학번·이메일·이름에 숫자나 기호만 붙인 비밀번호는 쓸 수 없습니다. 서로 관련 없는 단어 몇 개를 이어 쓰는 방식을 권장합니다.";
  const repeated = /^(.)\1+$/.test(p) || /^(.{2,4})\1+$/.test(p);
  if (COMMON.has(p) || repeated) {
    return "흔하거나 짐작하기 쉬운 비밀번호입니다. 서로 관련 없는 단어 몇 개를 이어 쓰는 방식을 권장합니다.";
  }
  return null;
}
