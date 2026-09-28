"use client";

import SubmitButton from "@/app/components/SubmitButton";
import { uploadSensitiveImage } from "@/app/lib/uploadSensitive";

import { useRef, useState } from "react";
import { saveMyProfileSettlementAction } from "./actions";
import { Card, Field, Note, Badge, INPUT, BTN_PRIMARY } from "./ui";

/**
 * 정산 정보 편집 폼(계좌·예금주·주소·주민번호·동의·전자서명).
 * 계좌만 있으면 이체할 수 있고 주민번호는 신고용이라, 두 항목의 경고 수준을 다르게 보여준다.
 */

// 은행 이름 제안 목록. 입력은 자유 텍스트라 목록에 없는 은행도 적을 수 있다.
// (팝빌 BANK_CODES 는 서버 전용 모듈이라 쓰지 않는다)
const BANKS = [
  "국민은행", "신한은행", "우리은행", "하나은행", "농협은행", "기업은행",
  "카카오뱅크", "토스뱅크", "케이뱅크", "새마을금고", "신협", "우체국",
  "부산은행", "대구은행", "광주은행", "전북은행", "경남은행", "제주은행",
  "산업은행", "수협은행", "SC제일은행", "씨티은행",
];

export interface SettlementSectionProps {
  bankName: string;
  accountNumber: string;
  holderName: string;
  address: string;
  signatureUrl: string;
  hasRrn: boolean;
  rrnMasked: string;
  payoutReady: boolean;
  withholdingReady: boolean;
  byAdmin: boolean;
  /** 본인이 개인정보 수집에 동의한 이력이 있는가. 대리입력분은 false 다. */
  consented: boolean;
  /** 지급 완료된 보상이 있는가(홈택스 안내 표시 여부) */
  hasPaidRewards: boolean;
}

export default function SettlementSection({ profile }: { profile: SettlementSectionProps }) {
  const [bank, setBank] = useState(profile.bankName);
  const [account, setAccount] = useState(profile.accountNumber);
  const [rrn, setRrn] = useState("");
  const [consent, setConsent] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState(profile.signatureUrl);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const rrnDigits = rrn.replace(/[^0-9]/g, "");
  // 서버는 13자리일 때만 저장하므로 일부만 입력했으면 제출을 막고 알려준다.
  const rrnIncomplete = rrnDigits.length > 0 && rrnDigits.length !== 13;

  // 동의가 필요한 경우: 주민번호를 새로 입력하거나, 등록돼 있지만 본인 동의 기록이 없을 때
  // (관리자 대리입력).
  const needConsent =
    (!profile.hasRrn && rrnDigits.length > 0) || (profile.hasRrn && !profile.consented);

  const canSubmit =
    bank.trim().length > 0 &&
    account.trim().length > 0 &&
    !rrnIncomplete &&
    (!needConsent || consent);

  async function uploadSignature(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      // 서명은 민감 첨부 저장소에 올린다.
      const r = await uploadSensitiveImage(file, "SIGNATURE");
      if (!r.ok) setUploadError(r.error);
      else setSignatureUrl(r.url);
    } catch {
      setUploadError("업로드 중 오류가 발생했습니다.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form action={saveMyProfileSettlementAction} className="space-y-5">
      <Card
        title="정산 정보"
        desc="평가 보상 지급과 연구비 노무비 청구가 이 정보를 함께 씁니다. 한 번만 입력하면 됩니다."
        aside={
          profile.payoutReady ? (
            <Badge tone="success">지급 가능</Badge>
          ) : (
            <Badge tone="danger">계좌 미등록</Badge>
          )
        }
      >
        <div className="space-y-4">
          {!profile.payoutReady && (
            <Note tone="danger">
              계좌 정보가 없으면 <strong>보상을 지급할 수 없습니다.</strong> 지급 대상이 되기 전에
              미리 등록해 두세요.
            </Note>
          )}
          {profile.byAdmin && (
            <Note tone="warning">
              관리자가 대신 입력한 정보입니다. 맞는지 확인하고 저장해 주세요.
            </Note>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="은행">
              <input
                name="bankName"
                list="profile-banks"
                value={bank}
                onChange={(e) => setBank(e.target.value)}
                placeholder="예: 국민은행"
                className={INPUT}
                required
              />
              <datalist id="profile-banks">
                {BANKS.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </Field>

            <Field label="계좌번호" hint="하이픈(-) 없이 숫자만 입력하세요.">
              <input
                name="accountNumber"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="1234567890123"
                inputMode="numeric"
                className={INPUT}
                required
              />
            </Field>

            {/* 예금주(본인 이름과 다를 때만 입력) */}
            <Field
              label="예금주 (선택)"
              hint="본인 이름과 다를 때만 입력하세요. 비우면 본인 이름으로 이체합니다."
            >
              <input
                name="holderName"
                defaultValue={profile.holderName}
                placeholder="예: 홍길동"
                className={INPUT}
              />
            </Field>

            <Field label="주소" hint="지급명세서(원천징수 신고)에 들어갑니다.">
              <input
                name="address"
                defaultValue={profile.address}
                placeholder="주소를 입력하세요"
                className={INPUT}
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card
        title="주민등록번호"
        desc="원천징수 신고(지급명세서)에만 사용합니다. 암호화되어 저장되며 화면에는 마스킹만 표시됩니다."
        aside={
          profile.withholdingReady ? (
            <Badge tone="success">등록됨</Badge>
          ) : (
            <Badge tone="warning">미등록</Badge>
          )
        }
      >
        <div className="space-y-3">
          {profile.payoutReady && !profile.withholdingReady && (
            <Note tone="muted">
              주민등록번호가 없어도 <strong>지급은 됩니다.</strong> 다만 원천징수 신고 서류를
              만들 수 없어 나중에 다시 요청드리게 됩니다.
            </Note>
          )}

          <Field label="주민등록번호 13자리">
            <input
              name="rrn"
              value={rrn}
              onChange={(e) => setRrn(e.target.value)}
              placeholder={
                profile.hasRrn ? `${profile.rrnMasked} (변경할 때만 입력)` : "주민등록번호 13자리"
              }
              inputMode="numeric"
              autoComplete="off"
              className={INPUT}
            />
          </Field>
          {rrnIncomplete && (
            <p className="text-xs text-[var(--danger)]">
              주민등록번호는 13자리를 모두 입력해야 저장됩니다 (현재 {rrnDigits.length}자리).
              등록하지 않으려면 비워 두세요.
            </p>
          )}

          {needConsent && (
            <label className="flex items-start gap-2 text-xs text-[var(--muted)] leading-snug bg-[var(--gray-50)] rounded-[var(--radius-md)] px-3 py-2.5">
              <input
                type="checkbox"
                name="consent"
                value="1"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 shrink-0"
              />
              <span>
                {profile.hasRrn ? (
                  // 등록돼 있지만 본인 동의 기록이 없는 경우(관리자 대리입력 등). 확인만 받는다.
                  <>
                    등록된 계좌·<strong>주민등록번호</strong>가 본인 정보가 맞으며, 보상 지급과
                    원천징수 신고에 이용하는 데 동의합니다.
                  </>
                ) : (
                  <>
                    보상 지급과 <strong>원천징수 신고</strong>를 위해 계좌·주민등록번호를
                    수집·이용하는 데 동의합니다. 주민등록번호는 암호화되어 저장되고 지급명세서
                    제출 외에는 쓰지 않습니다.
                  </>
                )}
              </span>
            </label>
          )}
        </div>
      </Card>

      <Card
        title="전자서명 (선택)"
        desc="연구비 노무비 청구 확인서에 들어갑니다. 평가 보상 지급에는 쓰이지 않습니다."
      >
        {/* 서명은 이 폼에서만 보낸다(관리자 대리입력 폼은 보내지 않아 기존 서명이 유지된다). */}
        <input type="hidden" name="signatureUrl" value={signatureUrl} />
        <div className="flex items-center gap-4">
          {signatureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={signatureUrl}
              alt="전자서명"
              className="w-28 h-14 object-contain rounded-[var(--radius-md)] border border-[var(--gray-200)] bg-white"
            />
          ) : (
            <div className="w-28 h-14 rounded-[var(--radius-md)] border border-dashed border-[var(--gray-300)] flex items-center justify-center text-xs text-[var(--gray-500)]">
              없음
            </div>
          )}
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-xs font-medium text-[var(--accent)] hover:underline"
            >
              {signatureUrl ? "서명 변경" : "서명 이미지 업로드"}
            </button>
            {signatureUrl && (
              <button
                type="button"
                onClick={() => setSignatureUrl("")}
                className="block text-xs text-[var(--danger)] hover:underline"
              >
                제거
              </button>
            )}
            {uploading && <p className="text-xs text-[var(--muted)]">업로드 중…</p>}
            {uploadError && <p className="text-xs text-[var(--danger)]">{uploadError}</p>}
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadSignature(f);
          }}
        />
      </Card>

      {/* 원천징수영수증은 지급명세서 제출 후 학생이 홈택스에서 직접 출력한다. */}
      {profile.hasPaidRewards && (
        <Note tone="muted">
          원천징수영수증은{" "}
          <a
            href="https://www.hometax.go.kr"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] underline underline-offset-2"
          >
            홈택스
          </a>
          에서 발급합니다 — 나의 홈택스 &gt; 소득·연말정산 &gt; 지급명세서·원천징수영수증 내역.
          지급명세서 제출 후 조회할 수 있습니다.
        </Note>
      )}

      <div className="flex justify-end">
        <SubmitButton type="submit" disabled={!canSubmit} className={BTN_PRIMARY}>
          정산 정보 저장
        </SubmitButton>
      </div>
    </form>
  );
}
