"use client";

import { useMemo, useRef, useState } from "react";
import { MAJOR_OPTIONS } from "../lib/majors";

/**
 * 전공 선택(검색형 콤보박스). 전공이 100개가 넘어 <select> 로는 찾기 어렵다.
 *
 * 입력한 글자로 전공명과 단과대학을 함께 검색한다. 고르면 확정되고 다시 누르면 목록이 열린다.
 * 제출값은 숨은 칸이지만, 브라우저가 hidden 을 검증하지 않으므로 required 는 보이는 칸에 건다.
 * 목록에 없는 값은 서버(isKnownMajor)에서 거른다.
 */
export default function MajorSelect({
  name = "major",
  defaultValue = "",
  required = false,
  placeholder = "전공을 검색하세요 (예: 소프트웨어, 간호)",
}: {
  name?: string;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const [selected, setSelected] = useState(defaultValue);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MAJOR_OPTIONS;
    // 전공명과 단과대학을 모두 검색한다.
    return MAJOR_OPTIONS.filter(
      (o) =>
        o.major.toLowerCase().includes(q) || o.college.toLowerCase().includes(q),
    );
  }, [query]);

  const inputCls =
    "w-full px-3.5 py-2.5 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors placeholder:text-[var(--gray-400)]";

  const choose = (major: string) => {
    setSelected(major);
    setQuery("");
    setOpen(false);
  };

  return (
    <div
      ref={boxRef}
      className="relative"
      // 목록을 클릭하는 동안 닫히지 않도록 포커스가 컨테이너 밖으로 나갈 때만 닫는다.
      onBlur={(e) => {
        if (!boxRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      {selected && !open ? (
        // 확정 상태. 다시 누르면 검색으로 돌아간다.
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`${inputCls} text-left flex items-center justify-between`}
        >
          <span className="text-[var(--gray-900)]">{selected}</span>
          <span className="text-xs text-[var(--muted)] shrink-0 ml-2">변경</span>
        </button>
      ) : (
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          // 확정된 값이 있으면 이 칸은 비어도 된다(숨은 칸에 값이 있다).
          required={required && !selected}
          autoComplete="off"
          className={inputCls}
        />
      )}

      {open && (
        <ul className="absolute z-30 mt-1 w-full max-h-[240px] overflow-y-auto bg-white border border-[var(--gray-200)] rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] py-1">
          {results.length === 0 ? (
            <li className="px-3.5 py-3 text-xs text-[var(--muted)]">
              검색 결과가 없습니다. 단과대학 이름으로도 찾아보세요.
            </li>
          ) : (
            results.map((o) => (
              <li key={`${o.college}/${o.major}`}>
                <button
                  type="button"
                  onClick={() => choose(o.major)}
                  className={`w-full text-left px-3.5 py-2 hover:bg-[var(--gray-50)] ${
                    o.major === selected ? "bg-[var(--accent-light)]" : ""
                  }`}
                >
                  <span className="text-sm text-[var(--gray-900)]">{o.major}</span>
                  {/* 이름이 비슷한 전공을 구분하도록 소속도 보여준다 */}
                  <span className="block text-xs text-[var(--muted)]">{o.college}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}

      <input type="hidden" name={name} value={selected} />
    </div>
  );
}
