"use client";

import ConfirmButton from "@/app/components/ConfirmButton";
import { deleteClaim } from "../../actions";

interface ClaimRow {
  id: string;
  batchId: string;
  studentId: string;
  name: string;
  status: string;
  totalAmount: number;
  infoComplete: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "작성중",
  CONFIRMED: "확정",
};

export default function AdminClaimRow({ claim }: { claim: ClaimRow }) {
  return (
    <tr className="border-b border-[var(--gray-100)] text-sm">
      <td className="py-2 px-2 text-[var(--muted)]">{claim.studentId}</td>
      <td className="py-2 px-2 font-medium text-[var(--foreground)]">{claim.name}</td>
      <td className="py-2 px-2">
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            claim.status === "CONFIRMED" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
          }`}
        >
          {STATUS_LABEL[claim.status] || claim.status}
        </span>
      </td>
      <td className="py-2 px-2 text-right tabular-nums">{claim.totalAmount.toLocaleString("ko-KR")}원</td>
      <td className="py-2 px-2 text-center text-xs">
        {claim.infoComplete ? (
          <span className="text-green-600">완료</span>
        ) : (
          <span className="text-[var(--danger)]">미입력</span>
        )}
      </td>
      <td className="py-2 px-2">
        <div className="flex items-center gap-3">
          <a
            href={`/api/payroll/pdf/${claim.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--foreground)] underline hover:opacity-70"
          >
            PDF
          </a>
          <a
            href={`/dashboard/payroll/admin/${claim.batchId}/${claim.id}`}
            className="text-xs text-[var(--foreground)] underline hover:opacity-70"
          >
            편집
          </a>
          <form action={deleteClaim}>
            <input type="hidden" name="claimId" value={claim.id} />
            <ConfirmButton
              message={`${claim.name}님의 청구서를 삭제합니다.\n\n· 되돌릴 수 없습니다.\n· 「참여자 서류 자동 생성」을 다시 누르면 새로 만들어집니다(수정한 내용은 복구되지 않습니다).\n\n정말 삭제하시겠습니까?`}
              className="text-xs text-[var(--danger)] hover:underline"
            >
              삭제
            </ConfirmButton>
          </form>
        </div>
      </td>
    </tr>
  );
}
