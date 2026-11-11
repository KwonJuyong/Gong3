import "server-only";
import bcrypt from "bcrypt";
import { checkRateLimit } from "../rate-limit";
import { REAUTH_FIELD } from "../components/ReauthField";

/**
 * 민감 조작(임시 비밀번호 발급·역할 변경·세금계산서 발행) 직전의 비밀번호 재확인.
 * 세션만 탈취돼도 되돌릴 수 없는 조작까지 가지 않게 함. 폼에는 <ReauthField /> 를 넣음
 * 통과하면 null, 아니면 화면에 보일 문구.
 */
export async function checkReauth(
  me: { id: string; password: string },
  formData: FormData,
): Promise<string | null> {
  // 성공도 세므로 입금 확인을 연달아 처리해도 막히지 않을 만큼 둠. 추측 공격에는 충분히 낮음
  const rl = checkRateLimit(`reauth:${me.id}`, 30, 15 * 60 * 1000);
  if (rl) return rl;
  const pw = (formData.get(REAUTH_FIELD) as string) || "";
  if (!pw) return "본인 확인을 위해 내 비밀번호를 입력해 주세요.";
  if (!(await bcrypt.compare(pw, me.password))) return "비밀번호가 일치하지 않습니다.";
  return null;
}
