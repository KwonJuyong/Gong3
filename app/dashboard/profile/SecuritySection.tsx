"use client";


import SubmitButton from "@/app/components/SubmitButton";
import ConfirmButton from "@/app/components/ConfirmButton";
import { useActionState } from "react";
import { updateProfileAction, logoutOtherDevicesAction } from "../../actions";
import { Card, Field, Note, INPUT, BTN_PRIMARY, BTN_GHOST } from "./ui";

type ActionState = { error: string | null; success: boolean } | null;

/**
 * 보안: 학번·사번, 비밀번호, 로그인 기록, 다른 기기 로그아웃.
 *
 * 학번·사번은 로그인 ID 가 아니지만 이메일 등록(migrateToEmailLoginAction)의 본인 확인에 쓰여
 * 바꿀 때 현재 비밀번호를 받는다. 폼은 두 개이고, updateProfileAction 이 제출된 필드만
 * 갱신하므로 서로 값을 지우지 않는다.
 */
export type LoginHistoryRow = {
  id: string;
  at: string;
  kind: string;
  failed: boolean;
  ip: string;
  device: string;
  result: string | null;
};

export default function SecuritySection({
  userType,
  studentId,
  sessionTtlHours,
  loginHistory = [],
}: {
  userType: string;
  studentId: string;
  /** 이 계정의 세션 수명(시간). 권한별로 달라 서버가 계산한다. */
  sessionTtlHours: number;
  /** 최근 로그인·보안 기록(서버가 한국 시각 문자열로 만들어 내려준다) */
  loginHistory?: LoginHistoryRow[];
}) {
  const [idState, idAction, idPending] = useActionState<ActionState, FormData>(
    updateProfileAction,
    null,
  );
  const [pwState, pwAction, pwPending] = useActionState<ActionState, FormData>(
    updateProfileAction,
    null,
  );
  const [outState, outAction, outPending] = useActionState<ActionState, FormData>(
    logoutOtherDevicesAction,
    null,
  );

  // 24시간 단위로 떨어지면 "일", 아니면 "시간"으로 표시한다.
  const ttlLabel =
    sessionTtlHours >= 24 ? `${Math.round(sessionTtlHours / 24)}일` : `${sessionTtlHours}시간`;

  const idField =
    userType === "STAFF" ? "employeeId" : userType === "DEVELOPER" ? "devEmail" : "studentId";
  const idLabel =
    userType === "DEVELOPER" ? "이메일(로그인 ID)" : userType === "STAFF" ? "사번" : "학번";

  return (
    <div className="space-y-5">
      {/* 본인 로그인 기록. 모르는 기기가 보이면 아래에서 바로 조치할 수 있게 맨 위에 둔다. */}
      <Card
        title="최근 로그인 기록"
        desc="이 계정으로 로그인한 시각·접속 IP·기기입니다. 기억에 없는 기록이 있으면 비밀번호를 바꾸고 다른 기기에서 로그아웃하세요."
      >
        {loginHistory.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">아직 기록이 없습니다. 다음 로그인부터 남습니다.</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--muted)] border-b border-[var(--gray-200)]">
                  <th className="px-1 py-2 font-medium">시각</th>
                  <th className="px-1 py-2 font-medium">내용</th>
                  <th className="px-1 py-2 font-medium">IP</th>
                  <th className="px-1 py-2 font-medium">기기</th>
                </tr>
              </thead>
              <tbody>
                {loginHistory.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--gray-100)] last:border-0">
                    <td className="px-1 py-2 whitespace-nowrap text-[var(--gray-700)]">{r.at}</td>
                    <td className={`px-1 py-2 whitespace-nowrap ${r.failed ? "text-[var(--danger)] font-medium" : "text-[var(--foreground)]"}`}>
                      {r.kind}
                      {r.result && <span className="text-xs text-[var(--muted)] font-normal"> · {r.result}</span>}
                    </td>
                    <td className="px-1 py-2 font-mono text-xs text-[var(--gray-700)]">{r.ip}</td>
                    <td className="px-1 py-2 whitespace-nowrap text-[var(--gray-700)]">{r.device}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title={userType === "DEVELOPER" ? "로그인 ID" : `${idLabel} 변경`}
        desc={
          userType === "DEVELOPER"
            ? "이메일이 곧 로그인 ID 입니다. 바꾸면 다음 로그인부터 새 주소로 접속합니다. 본인 확인을 위해 현재 비밀번호가 필요합니다."
            : `${idLabel}는 로그인에 쓰이지 않습니다 — 로그인 ID는 「기본 정보」 탭의 이메일입니다. 다만 이메일을 잃어버렸을 때 본인 확인에 쓰이므로 변경에 현재 비밀번호가 필요합니다.`
        }
      >
        <form action={idAction} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={idLabel}>
              <input
                name={idField}
                defaultValue={studentId}
                required
                maxLength={userType === "STAFF" ? 8 : undefined}
                pattern={userType === "STAFF" ? "[a-zA-Z0-9]+" : undefined}
                className={INPUT}
              />
            </Field>
            <Field label="현재 비밀번호">
              <input
                name="currentPassword"
                type="password"
                required
                autoComplete="current-password"
                placeholder="현재 비밀번호"
                className={INPUT}
              />
            </Field>
          </div>

          {idState?.error && <Note tone="danger">{idState.error}</Note>}
          {idState?.success && <Note tone="success">{idLabel}가 저장되었습니다.</Note>}

          <div className="flex justify-end">
            <SubmitButton type="submit" disabled={idPending} className={BTN_PRIMARY}>
              {idPending ? "저장 중…" : `${idLabel} 변경`}
            </SubmitButton>
          </div>
        </form>
      </Card>

      <Card title="비밀번호 변경" desc="8자 이상. 다른 사이트와 같은 비밀번호는 쓰지 마세요.">
        <form action={pwAction} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="현재 비밀번호">
              <input
                name="currentPassword"
                type="password"
                required
                autoComplete="current-password"
                className={INPUT}
              />
            </Field>
            <Field label="새 비밀번호" hint="8자 이상">
              <input
                name="newPassword"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className={INPUT}
              />
            </Field>
          </div>

          {pwState?.error && <Note tone="danger">{pwState.error}</Note>}
          {pwState?.success && <Note tone="success">비밀번호가 변경되었습니다.</Note>}

          <div className="flex justify-end">
            <SubmitButton type="submit" disabled={pwPending} className={BTN_PRIMARY}>
              {pwPending ? "변경 중…" : "비밀번호 변경"}
            </SubmitButton>
          </div>
        </form>
      </Card>

      {/* 다른 기기 로그아웃. 세션을 끊는 조작이라 현재 비밀번호를 받지 않는다. */}
      <Card
        title="로그인 중인 다른 기기 로그아웃"
        desc={`실습실·공용 PC 처럼 로그아웃하지 않고 나온 기기가 있다면 여기서 한 번에 끊습니다. 지금 보고 계신 이 기기는 그대로 유지됩니다.`}
      >
        <form action={outAction} className="space-y-4">
          <Note tone="warning">
            이 계정의 세션은 <strong>마지막 접속으로부터 {ttlLabel}</strong> 동안 유지됩니다.
            그 사이에는 비밀번호를 묻지 않고 바로 들어가지므로, 남의 PC 에서 로그인했다면
            끊어 두는 편이 안전합니다.
          </Note>

          {outState?.error && <Note tone="danger">{outState.error}</Note>}
          {outState?.success && (
            <Note tone="success">
              다른 기기의 로그인이 모두 해제되었습니다. 그 기기에서는 다시 로그인해야 합니다.
            </Note>
          )}

          <div className="flex justify-end">
            <ConfirmButton
              message={"지금 이 기기를 뺀 다른 모든 기기에서 로그아웃합니다.\n\n· 휴대폰·다른 PC 에서도 다시 로그인해야 합니다.\n\n계속하시겠습니까?"}
              disabled={outPending}
              className={BTN_GHOST}
            >
              {outPending ? "해제 중…" : "다른 모든 기기에서 로그아웃"}
            </ConfirmButton>
          </div>
        </form>
      </Card>
    </div>
  );
}
