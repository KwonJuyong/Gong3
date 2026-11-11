"use client";

import { toast } from "@/app/components/feedback";
import { useActionState, useRef, useState } from "react";
import { updateProfileAction } from "../../actions";
import PhoneInput from "../../components/PhoneInput";
import MajorSelect from "../../components/MajorSelect";
import { Card, Field, Note, INPUT, BTN_PRIMARY } from "./ui";

type ActionState = { error: string | null; success: boolean } | null;

/**
 * 기본 정보: 사진·이름·전공(업체명)·연락처·이메일.
 * 현재 비밀번호는 로그인 ID 인 이메일을 바꿀 때만 받음(비밀번호 변경은 보안 탭).
 * updateProfileAction 은 제출된 필드만 갱신함
 */
export default function BasicSection({
  user,
}: {
  user: {
    name: string;
    userType: string;
    major: string;
    phone: string;
    email: string;
    profileImage: string | null;
    /** 이메일 인증을 마쳤는가. 미인증이면 다음 로그인부터 막힘 */
    emailVerified: boolean;
  };
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateProfileAction,
    null,
  );
  const [imageUrl, setImageUrl] = useState(user.profileImage || "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // 이메일을 바꾸면 인증이 초기화되고 새 주소로 인증 메일이 감. 변경 여부는 화면에서 판단함
  const [email, setEmail] = useState(user.email);
  const emailChanged = email.trim() !== user.email;

  const isDev = user.userType === "DEVELOPER";
  const majorLabel = isDev ? "기업명" : "전공";

  async function upload(file: File) {
    if (!file.type.startsWith("image/")) return toast("이미지 파일만 업로드할 수 있습니다.", "error");
    if (file.size > 5 * 1024 * 1024) return toast("파일 크기는 5MB 이하만 가능합니다.", "error");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.url) setImageUrl(data.url);
      else toast(data.error || "업로드에 실패했습니다.", "error");
    } catch {
      toast("업로드 중 오류가 발생했습니다.", "error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form action={formAction} className="space-y-5">
      <Card
        title="기본 정보"
        desc="이 정보는 평가 참여·모집 안내에 쓰입니다. 이메일이 곧 로그인 ID 입니다. 바꾸려면 현재 비밀번호가 필요합니다. 비밀번호 변경은 「보안」 탭입니다."
      >
        <div className="space-y-4">
          <div>
            <span className="block text-xs font-medium text-[var(--gray-600)] mb-2">
              프로필 사진
            </span>
            <input type="hidden" name="profileImage" value={imageUrl} />
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-16 h-16 rounded-full bg-[var(--gray-100)] border-2 border-dashed border-[var(--gray-300)] flex items-center justify-center overflow-hidden hover:opacity-80 transition-opacity"
                aria-label="프로필 사진 변경"
              >
                {uploading ? (
                  <span className="text-xs text-[var(--muted)]">업로드 중</span>
                ) : imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="프로필" className="w-full h-full object-cover" />
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--gray-500)]">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                )}
              </button>
              <div className="space-x-3">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="text-xs font-medium text-[var(--accent)] hover:underline"
                >
                  {imageUrl ? "사진 변경" : "사진 업로드"}
                </button>
                {imageUrl && (
                  <button
                    type="button"
                    onClick={() => setImageUrl("")}
                    className="text-xs text-[var(--danger)] hover:underline"
                  >
                    삭제
                  </button>
                )}
                <p className="text-xs text-[var(--gray-500)] mt-1">JPG·PNG · 5MB 이하</p>
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
              }}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="이름">
              <input name="name" defaultValue={user.name} required className={INPUT} />
            </Field>

            <Field label={majorLabel}>
              {isDev ? (
                <input
                  name="major"
                  defaultValue={user.major}
                  placeholder="기업명을 입력하세요"
                  className={INPUT}
                />
              ) : (
                // 가입 폼과 같은 컴포넌트. 프로필에서는 전공이 선택 항목임
                <MajorSelect name="major" defaultValue={user.major} />
              )}
            </Field>

            <Field label="연락처">
              <PhoneInput name="phone" defaultValue={user.phone} />
            </Field>

            {/* 게스트(DEVELOPER)의 이메일은 보안 탭에서 바꿈 */}
            {!isDev && (
              <Field
                label="이메일 (로그인 ID)"
                hint="이 주소로 로그인합니다. 평가 모집·정산 안내와 비밀번호 재설정도 여기로 갑니다."
              >
                <input
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@hallym.ac.kr"
                  className={INPUT}
                />
              </Field>
            )}
          </div>

          {/* 미인증 안내(다음 로그인부터 막힘) */}
          {!isDev && !user.emailVerified && !emailChanged && (
            <Note tone="warning">
              이 이메일은 아직 <strong>인증되지 않았습니다.</strong> 메일함의 인증 링크를 눌러
              주세요. 인증하지 않으면 다음 로그인부터 막힙니다.
            </Note>
          )}
          {/* 이메일(로그인 ID)을 바꿀 때만 현재 비밀번호 칸을 보여줌(서버에서도 확인함). */}
          {!isDev && emailChanged && (
            <>
              <Note tone="warning">
                이메일은 <strong>로그인 ID</strong> 입니다. 바꾸면 다음 로그인부터 새 주소로
                접속하고, <strong>인증이 다시 필요합니다</strong> — 저장하면 새 주소로 인증
                메일이 가고 링크를 누르기 전까지 로그인이 막힙니다.
              </Note>
              <Field label="현재 비밀번호" hint="로그인 ID를 바꾸므로 본인 확인이 필요합니다.">
                <input
                  name="currentPassword"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="현재 비밀번호"
                  className={INPUT}
                />
              </Field>
            </>
          )}

          {state?.error && <Note tone="danger">{state.error}</Note>}
          {state?.success && <Note tone="success">저장되었습니다.</Note>}

          <div className="flex justify-end pt-1">
            <button type="submit" disabled={pending} className={BTN_PRIMARY}>
              {pending ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      </Card>
    </form>
  );
}
