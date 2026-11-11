"use client";

import SubmitButton from "@/app/components/SubmitButton";
import { uploadSensitiveImage } from "@/app/lib/uploadSensitive";

import { useState } from "react";
import { saveClaim } from "../../../actions";

export interface FormEntry {
  date: string;
  start: string;
  end: string;
  content: string;
  amount: number;
}

interface InitialData {
  affiliation: string;
  name: string;
  phone: string;
  address: string;
  bankName: string;
  accountNumber: string;
  signatureUrl: string;
  hasSavedRrn: boolean;
  consent: { personal: boolean; unique: boolean; thirdParty: boolean };
  confirmed: boolean;
}

/** 노무비 기준 근무시간: 18:00 시작, 만원당 1시간 추가 */
function workTimeFromAmount(amount: number): { start: string; end: string } {
  const totalMin = Math.round((Math.max(0, amount) / 10000) * 60);
  const endH = 18 + Math.floor(totalMin / 60);
  const endM = totalMin % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { start: "18:00", end: `${pad(endH)}:${pad(endM)}` };
}

const inputCls =
  "w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--gray-200)] text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--gray-900)]/10";

function SignatureUpload({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  async function handleFile(file: File) {
    setUploading(true);
    try {
      // 서명은 민감 첨부 저장소에 올림. 교체하지 않고 쌓으므로 확정된 청구서의 서명은 그대로 남음
      const r = await uploadSensitiveImage(file, "SIGNATURE");
      if (r.ok) onChange(r.url);
    } finally {
      setUploading(false);
    }
  }
  return (
    <div>
      <p className="text-xs text-[var(--muted)] mb-1">{label}</p>
      <div className="flex items-center gap-3">
        {value ? (
          <img src={value} alt={label} className="w-24 h-12 object-contain rounded-[var(--radius-md)] border border-[var(--gray-200)] bg-white" />
        ) : (
          <div className="w-24 h-12 rounded-[var(--radius-md)] border border-dashed border-[var(--gray-200)] flex items-center justify-center text-[var(--gray-500)] text-xs">
            없음
          </div>
        )}
        <div className="space-y-1.5">
          <label className="inline-flex cursor-pointer items-center px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-xs font-medium hover:bg-[var(--accent-dark)]">
            파일 선택
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
              className="hidden"
            />
          </label>
          {uploading && <p className="text-xs text-[var(--muted)]">업로드 중…</p>}
          {value && (
            <button type="button" onClick={() => onChange("")} className="block text-xs text-[var(--danger)] hover:underline">
              제거
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ClaimEditor({
  claimId,
  initialEntries,
  initial,
}: {
  claimId: string;
  initialEntries: FormEntry[];
  initial: InitialData;
}) {
  const [entries, setEntries] = useState<FormEntry[]>(initialEntries);
  const [signatureUrl, setSignatureUrl] = useState(initial.signatureUrl);

  const total = entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  function updateEntry(i: number, patch: Partial<FormEntry>) {
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }
  function addRow() {
    setEntries((prev) => [...prev, { date: "", start: "", end: "", content: "", amount: 0 }]);
  }
  function removeRow(i: number) {
    setEntries((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <form action={saveClaim} className="space-y-6">
      <input type="hidden" name="claimId" value={claimId} />
      <input type="hidden" name="entries" value={JSON.stringify(entries)} />
      <input type="hidden" name="signatureUrl" value={signatureUrl} />

      <section className="bg-white rounded-[var(--radius-xl)] p-5">
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-4">인적사항</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs text-[var(--muted)]">
            소속(전공)
            <input name="affiliation" defaultValue={initial.affiliation} className={`mt-1 ${inputCls}`} />
          </label>
          <label className="text-xs text-[var(--muted)]">
            성명
            <input name="name" defaultValue={initial.name} className={`mt-1 ${inputCls}`} />
          </label>
          <label className="text-xs text-[var(--muted)]">
            주민등록번호
            <input
              name="rrn"
              placeholder={initial.hasSavedRrn ? "저장됨 (변경 시에만 입력)" : "000000-0000000"}
              className={`mt-1 ${inputCls}`}
              autoComplete="off"
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            연락처
            <input name="phone" defaultValue={initial.phone} placeholder="010-0000-0000" className={`mt-1 ${inputCls}`} />
          </label>
          <label className="text-xs text-[var(--muted)] sm:col-span-2">
            주소
            <input name="address" defaultValue={initial.address} className={`mt-1 ${inputCls}`} />
          </label>
          <label className="text-xs text-[var(--muted)]">
            계좌번호
            <input name="accountNumber" defaultValue={initial.accountNumber} className={`mt-1 ${inputCls}`} />
          </label>
          <label className="text-xs text-[var(--muted)]">
            은행명
            <input name="bankName" defaultValue={initial.bankName} className={`mt-1 ${inputCls}`} />
          </label>
        </div>
      </section>

      <section className="bg-white rounded-[var(--radius-xl)] p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">근무내역</h3>
          <p className="text-xs text-[var(--muted)]">노무비 입력 시 근무시간이 18:00부터 만원당 1시간씩 자동 계산됩니다. 필요 시 수정하세요.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[var(--muted)] border-b border-[var(--gray-200)]">
                <th className="py-2 px-1 text-left font-medium">근무일자</th>
                <th className="py-2 px-1 text-left font-medium">시작</th>
                <th className="py-2 px-1 text-left font-medium">종료</th>
                <th className="py-2 px-1 text-left font-medium">근무내용</th>
                <th className="py-2 px-1 text-left font-medium">일일노무비(원)</th>
                <th className="py-2 px-1"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i} className="border-b border-[var(--gray-100)]">
                  <td className="py-1.5 px-1">
                    <input value={e.date} onChange={(ev) => updateEntry(i, { date: ev.target.value })} placeholder="2026.01.23" className="w-24 px-2 py-1 rounded border border-[var(--gray-200)]" />
                  </td>
                  <td className="py-1.5 px-1">
                    <input value={e.start} onChange={(ev) => updateEntry(i, { start: ev.target.value })} placeholder="09:00" className="w-16 px-2 py-1 rounded border border-[var(--gray-200)]" />
                  </td>
                  <td className="py-1.5 px-1">
                    <input value={e.end} onChange={(ev) => updateEntry(i, { end: ev.target.value })} placeholder="18:00" className="w-16 px-2 py-1 rounded border border-[var(--gray-200)]" />
                  </td>
                  <td className="py-1.5 px-1">
                    <input value={e.content} onChange={(ev) => updateEntry(i, { content: ev.target.value })} className="w-full min-w-[140px] px-2 py-1 rounded border border-[var(--gray-200)]" />
                  </td>
                  <td className="py-1.5 px-1">
                    <input
                      type="number"
                      min={0}
                      value={e.amount}
                      onChange={(ev) => {
                        const amount = Math.max(0, parseInt(ev.target.value || "0", 10) || 0);
                        const { start, end } = workTimeFromAmount(amount);
                        updateEntry(i, { amount, start, end });
                      }}
                      className="w-24 px-2 py-1 rounded border border-[var(--gray-200)]"
                    />
                  </td>
                  <td className="py-1.5 px-1 text-right">
                    <button type="button" onClick={() => removeRow(i)} className="text-[var(--danger)] hover:underline">삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between mt-3">
          <button type="button" onClick={addRow} className="text-xs px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--gray-200)] hover:bg-[var(--gray-100)]">
            + 행 추가
          </button>
          <p className="text-sm font-semibold text-[var(--foreground)]">합계 {total.toLocaleString("ko-KR")}원</p>
        </div>
      </section>

      <section className="bg-white rounded-[var(--radius-xl)] p-5 space-y-4">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">서명</h3>
        <SignatureUpload label="청구확인 (근무자)" value={signatureUrl} onChange={setSignatureUrl} />
        <p className="text-xs text-[var(--muted)]">
          근무확인(연구책임자) 서명은 노무비 페이지에서 설정한 단일 서명이 모든 서류에 자동 적용됩니다.
        </p>
      </section>

      <section className="bg-white rounded-[var(--radius-xl)] p-5 space-y-2">
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">개인정보 수집·이용 동의</h3>
        <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
          <input type="checkbox" name="consentPersonal" defaultChecked={initial.consent.personal} className="w-4 h-4" />
          개인정보의 수집·이용 및 목적에 동의
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
          <input type="checkbox" name="consentUnique" defaultChecked={initial.consent.unique} className="w-4 h-4" />
          고유식별정보(주민등록번호)의 수집·이용 및 목적에 동의
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
          <input type="checkbox" name="consentThirdParty" defaultChecked={initial.consent.thirdParty} className="w-4 h-4" />
          개인정보의 제3자 제공에 동의
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--foreground)] pt-2 mt-2 border-t border-[var(--gray-100)]">
          <input type="checkbox" name="confirm" defaultChecked={initial.confirmed} className="w-4 h-4" />
          이 서류를 <strong>확정</strong>합니다 (확정 후에도 다시 수정 가능)
        </label>
      </section>

      <div className="flex items-center justify-end gap-3">
        <a
          href={`/api/payroll/pdf/${claimId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 rounded-[var(--radius-md)] border border-[var(--gray-200)] text-sm font-medium text-[var(--foreground)] hover:bg-[var(--gray-100)]"
        >
          PDF 미리보기
        </a>
        <SubmitButton className="px-5 py-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-dark)]">
          저장하기
        </SubmitButton>
      </div>
    </form>
  );
}
