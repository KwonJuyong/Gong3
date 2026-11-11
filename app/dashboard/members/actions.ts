"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcrypt";
import { randomInt } from "crypto";
import { prisma } from "../../db";
import { getSessionUserId } from "@/app/session-server";
import { requestPasswordReset } from "../../lib/passwordReset";
import { issueClaimTokens } from "../../lib/accountClaim";
import { siteUrl } from "../../lib/mail";
import { checkReauth } from "../../lib/reauth";

/**
 * 회원 관리 액션(ADMIN 전용). role 과 userType 을 함께 바꾸는 등의 규칙을 코드로 지키고,
 * 모든 조작은 AuditLog 에 남김
 */

const PATH = "/dashboard/members";

async function requireAdmin() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me || me.role !== "ADMIN") return null;
  return me;
}

function str(formData: FormData, key: string): string {
  return ((formData.get(key) as string) || "").trim();
}

/** 감사 로그. 기록에 실패해도 이미 끝난 조작은 되돌리지 않음 */
async function audit(actorId: string, targetId: string, action: string, summary: string) {
  try {
    await prisma.auditLog.create({ data: { actorId, targetId, action, summary } });
  } catch {
    /* 무시 */
  }
}

function done(msg: string): never {
  revalidatePath(PATH);
  redirect(`${PATH}?ok=${encodeURIComponent(msg)}`);
}
function fail(msg: string): never {
  redirect(`${PATH}?error=${encodeURIComponent(msg)}`);
}

/**
 * 이름·전공/업체·연락처·이메일.
 * 이메일을 바꾸면 인증 상태를 초기화해 본인이 다시 인증하게 함(프로필 화면과 같은 규칙).
 */
export async function updateMemberAction(formData: FormData) {
  const me = await requireAdmin();
  if (!me) return;

  const id = str(formData, "userId");
  if (!id) return;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) fail("대상 회원을 찾을 수 없습니다.");

  const name = str(formData, "name");
  if (!name) fail("이름은 비울 수 없습니다.");

  const major = str(formData, "major");
  // 프로필 화면과 같이 숫자만 저장함. 하이픈이 섞이면 unique 검사를 비껴감
  const phone = str(formData, "phone").replace(/\D/g, "") || null;
  const email = str(formData, "email") || null;

  const emailChanged = (email ?? "") !== (target.email ?? "");
  if (emailChanged && email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("이메일 형식이 올바르지 않습니다.");
    // unique 는 대소문자를 구분하므로 직접 확인함(가입·프로필과 같은 규칙).
    const taken = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, id: { not: id } },
      select: { id: true },
    });
    if (taken) fail("이미 다른 회원이 사용 중인 이메일입니다.");
  }
  const changes: string[] = [];
  if (name !== target.name) changes.push(`이름 ${target.name} → ${name}`);
  if (major !== (target.major ?? "")) changes.push(`전공/기업 ${target.major || "-"} → ${major || "-"}`);
  if (phone !== target.phone) changes.push(`연락처 ${target.phone || "-"} → ${phone || "-"}`);
  if (emailChanged) changes.push(`이메일 ${target.email || "-"} → ${email || "-"} (인증 해제)`);
  if (changes.length === 0) done("변경된 내용이 없습니다.");

  try {
    await prisma.user.update({
      where: { id },
      data: {
        name,
        major,
        phone,
        email,
        // 이메일이 바뀌면 인증을 풀어 본인 확인을 다시 받음
        ...(emailChanged ? { emailVerifiedAt: null } : {}),
      },
    });
  } catch (e) {
    // phone·email 은 unique 다. 다른 회원이 쓰는 값이면 여기서 걸림
    if ((e as { code?: string }).code === "P2002") {
      fail("연락처 또는 이메일이 다른 회원과 중복됩니다.");
    }
    throw e;
  }

  await audit(me.id, id, "MEMBER_UPDATE", changes.join(" · "));
  done(
    emailChanged
      ? "저장했습니다. 이메일이 바뀌어 인증이 해제되었습니다. 본인이 인증 메일을 받아야 로그인됩니다."
      : "저장했습니다.",
  );
}

/**
 * role(권한: USER|DEVELOPER|ADMIN)과 userType(표시: STUDENT|DEVELOPER|STAFF)을
 * 프리셋으로 함께 바꿈. 교직원은 userType=STAFF, role=DEVELOPER 다.
 */
const ROLE_PRESETS: Record<string, { role: "USER" | "DEVELOPER" | "ADMIN"; userType: string; label: string }> = {
  student: { role: "USER", userType: "STUDENT", label: "학생 평가자" },
  company: { role: "DEVELOPER", userType: "DEVELOPER", label: "기업" },
  staff: { role: "DEVELOPER", userType: "STAFF", label: "교직원/조교" },
  admin: { role: "ADMIN", userType: "STAFF", label: "관리자" },
};

export async function changeMemberRoleAction(formData: FormData) {
  const me = await requireAdmin();
  if (!me) return;

  const id = str(formData, "userId");
  const preset = ROLE_PRESETS[str(formData, "preset")];
  if (!id || !preset) fail("역할 값이 올바르지 않습니다.");

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) fail("대상 회원을 찾을 수 없습니다.");

  const reauthErr = await checkReauth(me, formData);
  if (reauthErr) fail(reauthErr);

  // 마지막 관리자를 강등하면 아무도 이 화면에 못 들어옴
  if (target.role === "ADMIN" && preset.role !== "ADMIN") {
    const admins = await prisma.user.count({ where: { role: "ADMIN", status: "ACTIVE" } });
    if (admins <= 1) fail("마지막 관리자입니다. 다른 관리자를 먼저 지정해 주세요.");
  }

  await prisma.user.update({
    where: { id },
    data: {
      role: preset.role,
      userType: preset.userType,
      // 권한이 바뀌면 세션을 끊음. 세션 수명이 권한별로 다르므로 새 권한으로 다시 발급받게 함
      sessionEpoch: { increment: 1 },
    },
  });
  await audit(
    me.id,
    id,
    "MEMBER_ROLE",
    `역할 ${target.role}/${target.userType} → ${preset.role}/${preset.userType} (${preset.label})`,
  );
  done(`역할을 «${preset.label}»(으)로 바꿨습니다.`);
}

/**
 * 활성 · 정지 · 탈퇴.
 * 탈퇴해도 행은 남김. 보상·노무비·원장이 userId 를 참조하고 지급명세서의 근거가 됨
 */
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "활성",
  SUSPENDED: "정지",
  WITHDRAWN: "탈퇴",
};

export async function setMemberStatusAction(formData: FormData) {
  const me = await requireAdmin();
  if (!me) return;

  const id = str(formData, "userId");
  const status = str(formData, "status");
  if (!id || !STATUS_LABEL[status]) fail("상태 값이 올바르지 않습니다.");
  if (id === me.id) fail("본인 계정의 상태는 바꿀 수 없습니다.");

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) fail("대상 회원을 찾을 수 없습니다.");
  if (target.status === status) done("이미 그 상태입니다.");

  if (target.role === "ADMIN" && status !== "ACTIVE") {
    const admins = await prisma.user.count({ where: { role: "ADMIN", status: "ACTIVE" } });
    if (admins <= 1) fail("마지막 관리자입니다. 다른 관리자를 먼저 지정해 주세요.");
  }

  await prisma.user.update({
    where: { id },
    data: {
      status,
      withdrawnAt: status === "WITHDRAWN" ? new Date() : null,
      // 이미 로그인된 세션도 끊음(loginAction 은 로그인 시점만 막음).
      // ACTIVE 로 되돌릴 때도 정지 전 세션이 살아나지 않도록 올림
      sessionEpoch: { increment: 1 },
    },
  });
  await audit(
    me.id,
    id,
    "MEMBER_STATUS",
    `상태 ${STATUS_LABEL[target.status] ?? target.status} → ${STATUS_LABEL[status]}`,
  );
  done(`«${target.name}» 회원을 ${STATUS_LABEL[status]} 상태로 바꿨습니다.`);
}

/**
 * 관리자가 비밀번호 값을 알지 않도록 본인에게 재설정 링크를 보냄
 */
export async function sendResetMailAction(formData: FormData) {
  const me = await requireAdmin();
  if (!me) return;

  const id = str(formData, "userId");
  if (!id) return;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) fail("대상 회원을 찾을 수 없습니다.");
  if (!target.email) fail("이메일이 등록되지 않아 링크를 보낼 수 없습니다.");

  const r = await requestPasswordReset(target.email);
  if (r.configError) fail(`${r.configError} 메일 설정을 확인해 주세요.`);

  await audit(me.id, id, "MEMBER_RESET_MAIL", `비밀번호 재설정 메일 발송 → ${target.email}`);
  done(`${target.email} 로 재설정 링크를 보냈습니다. (30분·1회용)`);
}

/**
 * 계정의 활동 건수. 하나라도 있으면 삭제하지 않음(보상·노무비·발주는 보관 의무가 있음).
 * FK 도 삭제를 막지만 사유를 보여주려고 먼저 확인함
 */
async function activityOf(userId: string) {
  const [responses, surveyResponses, rewards, laborClaims, orders, services, projects, enrollments, messages] =
    await Promise.all([
      prisma.response.count({ where: { userId } }),
      prisma.surveyResponse.count({ where: { userId } }),
      prisma.reward.count({ where: { userId } }),
      prisma.laborClaim.count({ where: { userId } }),
      prisma.order.count({ where: { buyerId: userId } }),
      prisma.service.count({ where: { ownerId: userId } }),
      prisma.project.count({ where: { creatorId: userId } }),
      prisma.enrollment.count({ where: { userId } }),
      prisma.message.count({ where: { senderId: userId } }),
    ]);
  const items = [
    { label: "응답", n: responses + surveyResponses },
    { label: "보상", n: rewards },
    { label: "노무비", n: laborClaims },
    { label: "의뢰", n: orders },
    { label: "서비스", n: services },
    { label: "개설평가", n: projects },
    { label: "신청", n: enrollments },
    { label: "메시지", n: messages },
  ].filter((x) => x.n > 0);
  return { clean: items.length === 0, summary: items.map((x) => `${x.label} ${x.n}`).join(" · ") };
}

/**
 * 활동이 없는 계정(잘못 가입·테스트 계정)만 지움. 활동이 있으면 탈퇴로 처리함
 * 알림과 메신저 참여 행은 FK 때문에 함께 지움. 토큰·푸시구독·프로필은 Cascade 로 지워짐
 * 응답·보상·발주는 삭제 대상에 넣지 않음
 */
export async function deleteMemberAction(formData: FormData) {
  const me = await requireAdmin();
  if (!me) return;

  const id = str(formData, "userId");
  if (!id) return;
  if (id === me.id) fail("본인 계정은 삭제할 수 없습니다.");

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) fail("대상 회원을 찾을 수 없습니다.");
  if (target.role === "ADMIN") fail("관리자 계정은 삭제할 수 없습니다. 역할을 먼저 바꿔 주세요.");

  const act = await activityOf(id);
  if (!act.clean) {
    fail(`활동 기록이 있어 삭제할 수 없습니다 (${act.summary}). 탈퇴 처리로 진행해 주세요.`);
  }

  await prisma.notification.deleteMany({ where: { userId: id } });
  await prisma.conversationMember.deleteMany({ where: { userId: id } });
  await prisma.user.delete({ where: { id } });

  // 감사 로그는 계정 삭제 후에도 남음(AuditLog 에 FK 를 두지 않았음).
  await audit(me.id, id, "MEMBER_DELETE", `계정 삭제 (${target.studentId} · ${target.name})`);
  done(`«${target.name}» 계정을 삭제했습니다.`);
}

/** 임시 비밀번호용 문자 집합. 헷갈리는 글자(0/O, 1/l/I)는 뺐음 */
const TEMP_CHARS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * 메일을 받을 수 없는 계정의 복구 수단.
 *
 * - 값은 난수로 만들고 관리자가 정하지 않음
 * - URL 에 싣지 않고 반환값으로 화면에 한 번만 보여줌
 * - AuditLog 에 남김
 * 다음 로그인 때 변경을 강제하는 기능은 아직 없음
 */
export interface TempPwState {
  password?: string;
  error?: string;
}

export async function issueTempPasswordAction(
  _prev: TempPwState | null,
  formData: FormData,
): Promise<TempPwState> {
  const me = await requireAdmin();
  if (!me) return { error: "권한이 없습니다." };

  const id = str(formData, "userId");
  if (!id) return { error: "대상이 없습니다." };

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return { error: "대상 회원을 찾을 수 없습니다." };

  const reauthErr = await checkReauth(me, formData);
  if (reauthErr) return { error: reauthErr };

  let pw = "";
  for (let i = 0; i < 12; i++) pw += TEMP_CHARS[randomInt(TEMP_CHARS.length)];

  await prisma.user.update({
    where: { id },
    data: {
      password: await bcrypt.hash(pw, 10),
      // 기존 세션도 끊음
      sessionEpoch: { increment: 1 },
    },
  });

  // 기존 재설정 링크를 무효화함
  await prisma.passwordResetToken.deleteMany({ where: { userId: id } });

  await audit(me.id, id, "MEMBER_TEMP_PW", `임시 비밀번호 발급 (${target.studentId})`);
  revalidatePath(PATH);
  return { password: pw };
}

/**
 * 이메일이 없는 기존 계정에 1회용 링크를 발급함(app/lib/accountClaim.ts).
 *
 * 토큰 원본은 반환값으로 한 번만 보여줌(DB 에는 해시만 남음).
 * 대상은 화면이 보낸 id 를 그대로 믿지 않고 서버에서 이메일이 없는 활성 계정만 고름
 */
export interface ClaimLinkRow {
  name: string;
  studentId: string;
  phone: string;
  url: string;
}
export interface ClaimLinksState {
  rows?: ClaimLinkRow[];
  error?: string;
}

export async function issueClaimLinksAction(
  _prev: ClaimLinksState | null,
  formData: FormData,
): Promise<ClaimLinksState> {
  const me = await requireAdmin();
  if (!me) return { error: "권한이 없습니다." };

  // 화면에서 고른 id 가 있으면 그 안에서, 없으면 전체에서 고름
  const picked = str(formData, "userIds")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // 이메일이 없는 활성 계정만(탈퇴·정지 계정 제외)
  const targets = await prisma.user.findMany({
    where: {
      email: null,
      status: "ACTIVE",
      ...(picked.length > 0 ? { id: { in: picked } } : {}),
    },
    select: { id: true },
    orderBy: { studentId: "asc" },
  });

  if (targets.length === 0) {
    return { error: "발급 대상이 없습니다. (이메일이 없는 활성 계정이 0명입니다)" };
  }

  const issued = await issueClaimTokens(targets.map((t) => t.id));
  const base = siteUrl();

  for (const it of issued) {
    await audit(me.id, it.userId, "MEMBER_CLAIM_LINK", `계정 인계 링크 발급 (${it.studentId})`);
  }

  revalidatePath(PATH);
  return {
    rows: issued.map((it) => ({
      name: it.name,
      studentId: it.studentId,
      // 링크는 문자로 전달하므로 번호가 없으면 표시함
      phone: it.phone || "(번호 없음)",
      url: `${base}/claim/${it.token}`,
    })),
  };
}
