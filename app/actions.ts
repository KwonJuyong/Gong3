"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcrypt";
import { prisma, getSessionUser, ActionState } from "./db";
import { safeNext } from "./session";
import { setSessionCookie, clearSessionCookie, revokeSessionsAndRefresh } from "./session-server";
import { requestPasswordReset, consumeResetToken } from "./lib/passwordReset";
import {
  sendVerificationEmail,
  resendVerification,
  isMailReady,
} from "./lib/emailVerification";
import { createNotifications } from "./lib/notify";
import { isKnownMajor } from "./lib/majors";
import { EMAIL_UNVERIFIED_ERROR, LEGACY_ID_ERROR } from "./lib/authMessages";
import { checkRateLimit } from "./rate-limit";
import { createDmRoom, sendMessage } from "./dashboard/messenger/actions";
import { clientIp, logAccess, maskAccount } from "./lib/accessLog";

const getClientIP = clientIp;

const stripPhone = (v: string | null) => v?.replace(/\D/g, "") || null;

/** [1] 인증 **/
export async function loginAction(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ip = await getClientIP();
  const rlMsg = checkRateLimit(`login:${ip}`, 7, 15 * 60 * 1000);
  if (rlMsg) return { error: rlMsg, success: false };

  // 필드명은 브라우저 자동완성을 유지하려고 studentId 그대로 둔다.
  const identifier = ((formData.get("studentId") as string) || "").trim();
  const password = (formData.get("password") as string) || "";

  // 로그인 ID 는 이메일뿐이다. 학번·사번은 DB 조회 전에 거절하고, 이메일이 없는 기존 계정은
  // migrateToEmailLoginAction 으로 안내한다.
  if (!identifier.includes("@")) {
    return { error: LEGACY_ID_ERROR, success: false };
  }

  // 게스트는 studentId 가 이메일이므로 그쪽을 먼저 찾는다.
  // OR 로 합치면 두 행이 걸릴 때 어느 계정으로 로그인될지 정해지지 않는다.
  let user = await prisma.user.findUnique({ where: { studentId: identifier } });
  if (!user) {
    user = await prisma.user.findFirst({
      where: { email: { equals: identifier, mode: "insensitive" } },
    });
  }

  if (!user || !(await bcrypt.compare(password, user.password))) {
    // 없는 계정이면 입력값을 가려서 기록한다. 두 경우 모두 기록하므로 응답 시간 차이가 없다.
    await logAccess({
      userId: user?.id ?? null,
      account: user ? user.email || user.studentId : maskAccount(identifier),
      kind: "LOGIN_FAIL",
      result: user ? "비밀번호 불일치" : "없는 계정",
    });
    return { error: "이메일 또는 비밀번호가 틀렸습니다.", success: false };
  }
  const account = user.email || user.studentId;

  // 인증 안 된 주소로는 재설정 메일이 나가므로 미인증 계정은 막는다.
  if (!user.emailVerifiedAt) {
    // 로그인 화면이 이 문구와 비교해 재발송 버튼을 띄우므로 그대로 돌려준다.
    await logAccess({ userId: user.id, account, kind: "LOGIN_FAIL", result: "이메일 미인증" });
    return { error: EMAIL_UNVERIFIED_ERROR, success: false };
  }

  // 탈퇴·정지 계정. 지급 기록이 userId 를 참조하므로 행은 지우지 않고 상태로 막는다.
  // 비밀번호를 통과한 뒤라 사유를 알려줘도 계정 존재 여부가 새지 않는다.
  if (user.status === "WITHDRAWN") {
    await logAccess({ userId: user.id, account, kind: "LOGIN_FAIL", result: "탈퇴 계정" });
    return { error: "탈퇴 처리된 계정입니다. 다시 이용하시려면 관리자에게 문의해 주세요.", success: false };
  }
  if (user.status === "SUSPENDED") {
    await logAccess({ userId: user.id, account, kind: "LOGIN_FAIL", result: "정지 계정" });
    return { error: "이용이 정지된 계정입니다. 관리자에게 문의해 주세요.", success: false };
  }

  await setSessionCookie(user.id);
  await logAccess({ userId: user.id, account, kind: "LOGIN" });

  // 세션 만료로 튕겨나온 경우 원래 보던 화면으로 돌려보낸다.
  redirect(safeNext(formData.get("next") as string | null));
}

/**
 * [이메일 등록 — 로그인 전] 학번·사번만 있는 기존 계정이 로그인용 이메일을 등록한다.
 *
 * 본인 확인은 학번·사번과 비밀번호로 한다(이름 등 지식 기반 대조는 쓰지 않는다).
 * 새 주소는 인증 전까지 미인증 상태이고, 인증 메일 발송에 실패하면 이전 값으로 되돌린다.
 * 미인증 상태에서는 오타를 고칠 수 있도록 다시 등록할 수 있다.
 */
export async function migrateToEmailLoginAction(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ip = await getClientIP();
  const rlMsg = checkRateLimit(`migrate:${ip}`, 7, 15 * 60 * 1000);
  if (rlMsg) return { error: rlMsg, success: false };

  const legacyId = ((formData.get("legacyId") as string) || "").trim();
  const password = (formData.get("password") as string) || "";
  const email = ((formData.get("email") as string) || "").trim();
  const confirm = ((formData.get("emailConfirm") as string) || "").trim();

  if (!legacyId || !password) {
    return { error: "학번·사번과 비밀번호를 입력해주세요.", success: false };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "이메일 형식이 올바르지 않습니다.", success: false };
  }
  if (email.toLowerCase() !== confirm.toLowerCase()) {
    return { error: "두 이메일이 서로 다릅니다. 다시 확인해 주세요.", success: false };
  }

  const user = await prisma.user.findUnique({ where: { studentId: legacyId } });
  // 학번 존재 여부가 드러나지 않도록 두 경우를 구분하지 않는다.
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return { error: "학번·사번 또는 비밀번호가 틀렸습니다.", success: false };
  }

  if (user.status === "WITHDRAWN") {
    return { error: "탈퇴 처리된 계정입니다. 관리자에게 문의해 주세요.", success: false };
  }
  if (user.status === "SUSPENDED") {
    return { error: "이용이 정지된 계정입니다. 관리자에게 문의해 주세요.", success: false };
  }

  // 이미 인증된 주소가 있으면 그걸로 로그인하게 한다(비밀번호 확인 후라 보여줘도 된다).
  if (user.email && user.emailVerifiedAt) {
    return {
      error: `이미 등록된 이메일이 있습니다: ${user.email} — 이 주소로 로그인해 주세요.`,
      success: false,
    };
  }

  const taken = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, id: { not: user.id } },
    select: { id: true },
  });
  if (taken) {
    return { error: "이미 다른 계정이 사용 중인 이메일입니다.", success: false };
  }

  if (!isMailReady()) {
    return {
      error: "메일 발송이 설정되지 않았습니다. 관리자에게 문의해 주세요.",
      success: false,
    };
  }

  const prevEmail = user.email;
  const prevVerifiedAt = user.emailVerifiedAt;

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { email, emailVerifiedAt: null },
    });
  } catch {
    return { error: "저장 중 오류가 발생했습니다. 다시 시도해주세요.", success: false };
  }

  const mailErr = await sendVerificationEmail(user.id);
  if (mailErr) {
    // 미인증인 채로 메일도 못 받으면 로그인할 방법이 없으므로 되돌린다.
    await prisma.user
      .update({
        where: { id: user.id },
        data: { email: prevEmail, emailVerifiedAt: prevVerifiedAt },
      })
      .catch(() => {});
    return { error: `${mailErr} 잠시 후 다시 시도해 주세요.`, success: false };
  }

  return { error: null, success: true };
}

/**
 * [이메일 등록] 로그인한 상태에서 이메일이 없는 기존 계정이 주소를 채운다.
 *
 * emailVerifiedAt 은 건드리지 않는다. 비우면 다음 로그인부터 막히는데, 학교 메일 도달이
 * 아직 확인되지 않아 기존 사용자를 잠글 수 있다. 대신 주소를 두 번 입력받아 오타를 막는다.
 */
export async function setMissingEmailAction(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const me = await getSessionUser();
  if (!me) return { error: "인증이 필요합니다.", success: false };

  // 탭 두 개에서 모두 제출한 경우
  if (me.email) redirect("/dashboard");

  const email = ((formData.get("email") as string) || "").trim();
  const confirm = ((formData.get("emailConfirm") as string) || "").trim();

  if (!email) return { error: "이메일을 입력해주세요.", success: false };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "이메일 형식이 올바르지 않습니다.", success: false };
  }
  if (email.toLowerCase() !== confirm.toLowerCase()) {
    return { error: "두 이메일이 서로 다릅니다. 다시 확인해 주세요.", success: false };
  }

  // email 컬럼의 unique 는 대소문자를 구분하므로 중복은 직접 확인한다.
  const taken = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (taken) {
    return { error: "이미 다른 계정이 사용 중인 이메일입니다.", success: false };
  }

  try {
    await prisma.user.update({ where: { id: me.id }, data: { email } });
  } catch {
    return { error: "저장 중 오류가 발생했습니다. 다시 시도해주세요.", success: false };
  }

  redirect("/dashboard");
}

export async function registerAction(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ip = await getClientIP();
  const rlMsg = checkRateLimit(`register:${ip}`, 5, 30 * 60 * 1000);
  if (rlMsg) return { error: rlMsg, success: false };

  const userType = (formData.get("userType") as string) || "STUDENT";
  const name = ((formData.get("name") as string) || "").trim();
  const password = (formData.get("password") as string) || "";
  const phone = stripPhone(((formData.get("phone") as string) || "").trim());
  let email: string | null = ((formData.get("email") as string) || "").trim() || null;

  if (!name || !password) {
    return { error: "이름과 비밀번호는 필수입니다.", success: false };
  }

  if (password.length < 8) {
    return { error: "비밀번호는 8자 이상이어야 합니다.", success: false };
  }

  let studentId: string;
  let major: string;
  let role: "USER" | "DEVELOPER" = "USER";

  if (userType === "DEVELOPER") {
    const devEmail = ((formData.get("devEmail") as string) || "").trim();
    const companyName = ((formData.get("companyName") as string) || "").trim();
    if (!devEmail) return { error: "이메일은 필수입니다.", success: false };
    if (!companyName) return { error: "업체명은 필수입니다.", success: false };
    studentId = devEmail;
    major = companyName;
    role = "DEVELOPER";
    // 게스트도 email 필드에 이메일 저장 (DB 통일)
    email = devEmail;
  } else if (userType === "STAFF") {
    const employeeId = ((formData.get("employeeId") as string) || "").trim();
    major = ((formData.get("major") as string) || "").trim();
    if (!employeeId) return { error: "사번은 필수입니다.", success: false };
    if (employeeId.length > 8) return { error: "사번은 최대 8자리입니다.", success: false };
    if (!/^[a-zA-Z0-9]+$/.test(employeeId)) return { error: "사번은 영문과 숫자만 가능합니다.", success: false };
    if (!isKnownMajor(major)) return { error: "소속을 목록에서 선택해 주세요.", success: false };
    studentId = employeeId;
    role = "DEVELOPER";
  } else {
    studentId = ((formData.get("studentId") as string) || "").trim();
    major = ((formData.get("major") as string) || "").trim();
    if (!studentId) return { error: "학번은 필수입니다.", success: false };
    // 로그인이 studentId 를 먼저 찾으므로, 남의 이메일을 학번으로 선점하지 못하게 막는다.
    if (studentId.includes("@")) {
      return { error: "학번에는 @ 를 쓸 수 없습니다.", success: false };
    }
    if (!isKnownMajor(major)) return { error: "전공을 목록에서 선택해 주세요.", success: false };
    role = "USER";
  }

  // 이메일은 모든 유형에서 필수다. 폼 검증과 별개로 서버에서도 확인한다.
  if (!email) return { error: "이메일은 필수입니다.", success: false };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "이메일 형식이 올바르지 않습니다.", success: false };
  }

  const duplicateErrors: string[] = [];

  const existingById = await prisma.user.findUnique({ where: { studentId } });
  if (existingById) {
    const idLabel = userType === "DEVELOPER" ? "이메일(ID)" : userType === "STAFF" ? "사번" : "학번";
    duplicateErrors.push(idLabel);
  }

  if (phone) {
    const existingByPhone = await prisma.user.findUnique({ where: { phone } });
    if (existingByPhone) duplicateErrors.push("전화번호");
  }

  // 대소문자 무시 중복 검사. setMissingEmailAction 과 같은 규칙이다.
  const existingByEmail = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (existingByEmail && !duplicateErrors.includes("이메일(ID)")) duplicateErrors.push("이메일");

  if (duplicateErrors.length > 0) {
    return { error: `이미 사용 중인 항목: ${duplicateErrors.join(", ")}`, success: false };
  }

  // 인증 메일을 보낼 수 없으면 계정을 만들지 않는다.
  if (!isMailReady()) {
    return {
      error: "현재 회원가입이 일시적으로 불가합니다(메일 발송 미설정). 관리자에게 문의해 주세요.",
      success: false,
    };
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  let created;
  try {
    created = await prisma.user.create({
      data: { studentId, password: hashedPassword, name, major, phone, email, role, userType },
    });
  } catch {
    return { error: "회원가입 중 오류가 발생했습니다. 다시 시도해주세요.", success: false };
  }

  // 발송에 실패하면 계정을 지운다. 남겨두면 ID·이메일만 점유한 잠긴 계정이 된다.
  const mailErr = await sendVerificationEmail(created.id);
  if (mailErr) {
    await prisma.user.delete({ where: { id: created.id } }).catch(() => {});
    return { error: `${mailErr} 잠시 후 다시 시도해 주세요.`, success: false };
  }

  return { error: null, success: true };
}

/** [인증 메일 재발송] 메일을 못 받았거나 24시간이 지난 경우. */
export async function resendVerificationAction(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ip = await getClientIP();
  const rlMsg = checkRateLimit(`verify-resend:${ip}`, 5, 30 * 60 * 1000);
  if (rlMsg) return { error: rlMsg, success: false };

  const identifier = ((formData.get("identifier") as string) || "").trim();
  if (!identifier) return { error: "이메일 또는 학번·사번을 입력해주세요.", success: false };

  // 한 계정에 메일 폭탄을 넣지 못하게 식별자별로도 막는다.
  const idMsg = checkRateLimit(`verify-id:${identifier.toLowerCase()}`, 3, 30 * 60 * 1000);
  if (idMsg) return { error: idMsg, success: false };

  const r = await resendVerification(identifier);
  if (r.configError) return { error: `${r.configError} 관리자에게 문의해 주세요.`, success: false };

  // 계정 존재 여부와 무관하게 같은 응답을 준다.
  return { error: null, success: true };
}

/**
 * [비밀번호 재설정 1단계] 재설정 링크를 메일로 보낸다.
 * 계정 존재 여부가 드러나지 않도록 결과와 무관하게 같은 응답을 준다.
 */
export async function requestPasswordResetAction(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ip = await getClientIP();
  const rlMsg = checkRateLimit(`reset:${ip}`, 5, 30 * 60 * 1000);
  if (rlMsg) return { error: rlMsg, success: false };

  const identifier = ((formData.get("identifier") as string) || "").trim();
  if (!identifier) return { error: "이메일 또는 학번·사번을 입력해주세요.", success: false };

  // 같은 계정을 반복해서 두드리는 것도 막는다(메일 폭탄 방지). IP 제한과 별개다.
  const idMsg = checkRateLimit(`reset-id:${identifier.toLowerCase()}`, 3, 30 * 60 * 1000);
  if (idMsg) return { error: idMsg, success: false };

  const r = await requestPasswordReset(identifier);

  // 발송 설정이 없는 경우는 알린다. 계정 존재 여부와는 무관한 메시지다.
  if (r.configError) {
    return {
      error: `${r.configError} 관리자에게 문의해 주세요.`,
      success: false,
    };
  }

  return { error: null, success: true };
}

/** [비밀번호 재설정 2단계] 메일 링크의 토큰으로 새 비밀번호를 설정한다. */
export async function completePasswordResetAction(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ip = await getClientIP();
  const rlMsg = checkRateLimit(`reset-complete:${ip}`, 10, 30 * 60 * 1000);
  if (rlMsg) return { error: rlMsg, success: false };

  const token = ((formData.get("token") as string) || "").trim();
  const newPassword = (formData.get("newPassword") as string) || "";
  const confirm = (formData.get("confirmPassword") as string) || "";

  if (!token) return { error: "재설정 링크가 올바르지 않습니다.", success: false };
  if (newPassword.length < 8)
    return { error: "비밀번호는 8자 이상이어야 합니다.", success: false };
  if (newPassword !== confirm)
    return { error: "새 비밀번호가 서로 다릅니다.", success: false };

  const hashed = await bcrypt.hash(newPassword, 10);
  const r = await consumeResetToken(token, hashed);

  if (r.ok) {
    const u = await prisma.user.findUnique({ where: { id: r.userId }, select: { email: true, studentId: true } });
    await logAccess({ userId: r.userId, account: u?.email || u?.studentId || r.userId, kind: "PASSWORD_RESET" });
  }
  if (!r.ok) {
    return {
      error:
        r.reason === "expired"
          ? "링크가 만료되었습니다(발송 후 30분). 재설정을 다시 요청해 주세요."
          : r.reason === "used"
            ? "이미 사용된 링크입니다. 재설정을 다시 요청해 주세요."
            : "재설정 링크가 올바르지 않습니다.",
      success: false,
    };
  }

  return { error: null, success: true };
}

export async function logoutAction() {
  const me = await getSessionUser();
  if (me) await logAccess({ userId: me.id, account: me.email || me.studentId, kind: "LOGOUT" });
  await clearSessionCookie();
  redirect("/");
}

/**
 * [1.4] 다른 모든 기기에서 로그아웃.
 * 로그아웃 버튼은 그 기기의 쿠키만 지우므로, 공용 PC 에 남긴 세션을 끊을 때 쓴다.
 * 현재 브라우저의 세션은 유지한다.
 */
export async function logoutOtherDevicesAction(
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const me = await getSessionUser();
  if (!me) return { error: "인증이 필요합니다.", success: false };

  await revokeSessionsAndRefresh(me.id);
  await logAccess({ userId: me.id, account: me.email || me.studentId, kind: "LOGOUT_OTHERS" });
  return { error: null, success: true };
}

/** [1.5] 프로필 수정 **/
export async function updateProfileAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const me = await getSessionUser();
  if (!me) return { error: "인증이 필요합니다.", success: false };

  // 기본 정보 폼과 보안 폼이 따로 제출되므로 제출된 필드만 갱신한다.
  const has = (k: string) => formData.has(k);
  const str = (k: string) => ((formData.get(k) as string) || "").trim();

  // 로그인 ID 변경 (userType 마다 입력 이름이 다르다)
  const idField =
    me.userType === "STAFF" ? "employeeId" : me.userType === "DEVELOPER" ? "devEmail" : "studentId";
  const newPassword = has("newPassword") ? str("newPassword") : "";
  const changesId = has(idField) && !!str(idField) && str(idField) !== me.studentId;

  // 이메일이 로그인 ID 이므로 이메일 변경도 비밀번호 확인 대상이다.
  const emailChanged = has("email") && (str("email") || null) !== me.email;

  // 현재 비밀번호는 자격증명을 바꿀 때만 요구한다.
  if (changesId || newPassword || emailChanged) {
    const currentPassword = str("currentPassword");
    if (!currentPassword) return { error: "현재 비밀번호를 입력해주세요.", success: false };
    const isValid = await bcrypt.compare(currentPassword, me.password);
    if (!isValid) return { error: "현재 비밀번호가 일치하지 않습니다.", success: false };
  }

  const data: Record<string, any> = {};

  if (has("name")) {
    const name = str("name");
    if (!name) return { error: "이름은 필수입니다.", success: false };
    data.name = name;
  }
  if (has("major")) data.major = str("major");
  if (has("phone")) data.phone = stripPhone(str("phone"));
  if (has("profileImage")) data.profileImage = str("profileImage") || null;

  // 이메일을 바꾸면 인증 상태를 초기화한다.
  if (has("email")) data.email = str("email") || null;
  if (emailChanged) {
    if (!isMailReady()) {
      return {
        error: "메일 발송이 설정되지 않아 이메일을 변경할 수 없습니다. 관리자에게 문의해 주세요.",
        success: false,
      };
    }
    data.emailVerifiedAt = null;
  }

  if (changesId) {
    const value = str(idField);
    if (me.userType === "STAFF") {
      if (value.length > 8) return { error: "사번은 최대 8자리입니다.", success: false };
      if (!/^[a-zA-Z0-9]+$/.test(value))
        return { error: "사번은 영문과 숫자만 가능합니다.", success: false };
    }
    data.studentId = value;
  }

  if (newPassword) {
    if (newPassword.length < 8)
      return { error: "새 비밀번호는 8자 이상이어야 합니다.", success: false };
    data.password = await bcrypt.hash(newPassword, 10);
  }

  if (Object.keys(data).length === 0) return { error: null, success: true };

  try {
    await prisma.user.update({ where: { id: me.id }, data });
  } catch {
    return { error: "이미 존재하는 ID·이메일·연락처입니다.", success: false };
  }

  // 비밀번호를 바꾸면 다른 기기의 세션을 끊는다(현재 브라우저는 유지).
  if (newPassword) {
    await revokeSessionsAndRefresh(me.id);
    await logAccess({ userId: me.id, account: me.email || me.studentId, kind: "PASSWORD_CHANGE" });
  }

  // 새 주소로 인증 메일을 보낸다. 실패하면 다음 로그인부터 막히므로 사용자에게 알린다.
  const mailErr = emailChanged ? await sendVerificationEmail(me.id) : null;

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/profile");

  if (mailErr) {
    return {
      error:
        `이메일은 변경되었지만 인증 메일을 보내지 못했습니다(${mailErr}) ` +
        `인증을 마칠 때까지 다시 로그인할 수 없으니, 로그인 화면의 ` +
        `"인증 메일 다시 받기"로 재시도해 주세요.`,
      success: false,
    };
  }
  return { error: null, success: true };
}

/** [2] 메시지: 학번으로 상대 DM 방을 확보해 메시지 전송 (통합 메신저 모델) **/
export async function sendMessageAction(formData: FormData): Promise<void> {
  const me = await getSessionUser();
  if (!me) return;

  const receiverStudentId = ((formData.get("receiverStudentId") as string) || "").trim();
  const content = ((formData.get("content") as string) || "").trim();
  if (!receiverStudentId || !content) return;

  const receiver = await prisma.user.findUnique({ where: { studentId: receiverStudentId } });
  if (!receiver || receiver.id === me.id) return;

  const roomId = await createDmRoom(receiver.id);
  if (roomId) await sendMessage(roomId, content);

  revalidatePath("/dashboard");
}

export async function deleteNotificationAction(formData: FormData) {
  const me = await getSessionUser();
  if (!me) return;

  const notificationId = (formData.get("notificationId") as string) || "";
  if (!notificationId) return;

  const n = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!n) return;

  if (n.userId !== me.id && me.role !== "ADMIN") return;

  await prisma.notification.delete({ where: { id: notificationId } });

  revalidatePath("/dashboard");
}

/** [알림 읽음 처리] 알림함을 열면 호출한다. 본인 알림만 처리한다. */
export async function markNotificationsReadAction() {
  const me = await getSessionUser();
  if (!me) return;

  await prisma.notification.updateMany({
    where: { userId: me.id, isRead: false },
    data: { isRead: true },
  });

  revalidatePath("/dashboard");
}

/** [알림 전체 삭제] 알림함 비우기. 본인 것만 지운다. */
export async function deleteAllNotificationsAction() {
  const me = await getSessionUser();
  if (!me) return;

  await prisma.notification.deleteMany({ where: { userId: me.id } });

  revalidatePath("/dashboard");
}

/** [공지 생성: ADMIN] **/
export async function createAnnouncementAction(formData: FormData) {
  const me = await getSessionUser();
  if (!me || me.role !== "ADMIN") return;

  const content = ((formData.get("content") as string) || "").trim();
  if (!content) return;

  const allUsers = await prisma.user.findMany({ select: { id: true } });
  if (allUsers.length > 0) {
    await createNotifications(
      allUsers
        .filter((u) => u.id !== me.id)
        .map((u) => ({
          userId: u.id,
          type: "ANNOUNCE",
          content,
          fromUserId: me.id,
        })),
    );
  }

  revalidatePath("/dashboard");
}

/** 평가별 공지 (생성자 → 참여자) **/
export async function sendProjectAnnouncementAction(formData: FormData) {
  const me = await getSessionUser();
  if (!me) return;

  const projectId = (formData.get("projectId") as string) || "";
  const content = ((formData.get("content") as string) || "").trim();
  if (!projectId || !content) return;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { enrollments: { select: { userId: true, status: true } } },
  });
  if (!project) return;

  if (me.role !== "ADMIN" && project.creatorId !== me.id) return;

  // 관리자가 제외한 사람(REMOVED)에게는 더 이상 이 평가 공지를 보내지 않는다.
  const participantIds = project.enrollments
    .filter((e) => e.status !== "REMOVED")
    .map((e) => e.userId)
    .filter((uid) => uid !== me.id);

  if (participantIds.length > 0) {
    await createNotifications(
      participantIds.map((uid) => ({
        userId: uid,
        type: "INFO",
        content: `[${project.title}] ${content}`,
        fromUserId: me.id,
      })),
    );
  }

  revalidatePath("/dashboard");
}
