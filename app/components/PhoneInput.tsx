"use client";
import { useState } from "react";

/**
 * 전화번호 입력. 한 칸으로 받고 자릿수에 따라 하이픈을 넣음
 * 지역번호가 2자리(02)와 3자리로 나뉘어 칸 수를 고정할 수 없기 때문임
 * 내선번호는 받지 않음(phone 이 unique 라 대표번호만 저장함).
 */

interface PhoneInputProps {
  name?: string;
  defaultValue?: string | null;
  required?: boolean;
  className?: string;
}

/**
 * 숫자열에 하이픈을 넣음
 *
 * - `02` 로 시작하면 지역번호 2자리 (서울)
 * - 그 외는 3자리 (`010`·`031`·`033`·`070`·`080`…)
 * - 가운데 자리는 전체 길이로 갈림: 짧으면 3자리, 길면 4자리
 *
 * - 15xx·16xx·18xx 대표번호(1588-1234)는 4-4 로 끊음
 */
export function formatPhone(raw: string): string {
  const d = (raw || "").replace(/\D/g, "").slice(0, 11);
  if (!d) return "";

  // 대표번호 15xx·16xx·18xx(8자리)
  if (/^1[5678]/.test(d) && d.length <= 8) {
    return d.length <= 4 ? d : `${d.slice(0, 4)}-${d.slice(4)}`;
  }

  const areaLen = d.startsWith("02") ? 2 : 3;
  if (d.length <= areaLen) return d;

  const rest = d.slice(areaLen);
  // 국번 길이는 전체 길이로 정함(02-123-4567 은 3자리, 02-1234-5678 은 4자리).
  // 010·070 은 항상 4-4 라 입력 도중 하이픈 위치가 바뀌지 않도록 미리 고정함
  const alwaysFour = /^(010|070)/.test(d);
  const midLen = alwaysFour || d.length >= areaLen + 8 ? 4 : 3;
  if (rest.length <= midLen) return `${d.slice(0, areaLen)}-${rest}`;

  return `${d.slice(0, areaLen)}-${rest.slice(0, midLen)}-${rest.slice(midLen)}`;
}

export default function PhoneInput({
  name = "phone",
  defaultValue,
  required = false,
  className = "",
}: PhoneInputProps) {
  const [value, setValue] = useState(() => formatPhone(defaultValue || ""));

  // 제출값은 숫자만(stripPhone 과 같은 규칙)
  const digits = value.replace(/\D/g, "");

  return (
    <div className={className}>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        value={value}
        onChange={(e) => setValue(formatPhone(e.target.value))}
        placeholder="010-1234-5678"
        aria-label="전화번호"
        // required·pattern 은 보이는 칸에 걸기(hidden 은 브라우저가 검증하지 않음).
        required={required}
        pattern="[0-9\-]{9,13}"
        title="지역번호를 포함해 입력해 주세요 (예: 010-1234-5678, 033-248-0000)"
        className="w-full px-3.5 py-2.5 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors placeholder:text-[var(--gray-400)]"
      />
      {/* 실제 제출값(하이픈 없는 숫자) */}
      <input type="hidden" name={name} value={digits} />
      <p className="text-xs text-[var(--gray-500)] mt-1">
        휴대폰·유선번호 모두 가능합니다 (예: 033-248-0000, 02-123-4567)
      </p>
    </div>
  );
}
