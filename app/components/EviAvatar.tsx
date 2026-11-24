// Evi(에비) 얼굴 로고. 남색 원에 흰 눈 두 개와 미소. bare 는 바탕 원 없이 얼굴만(남색 버튼 위)
export default function EviAvatar({ size = 32, bare = false, className = "" }: { size?: number; bare?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className={`shrink-0 ${className}`}>
      {!bare && <circle cx="20" cy="20" r="20" fill="var(--accent)" />}
      <ellipse cx="14.5" cy="17" rx="2.6" ry="3.2" fill="#fff" />
      <ellipse cx="25.5" cy="17" rx="2.6" ry="3.2" fill="#fff" />
      <path d="M13.5 24.5c3.6 3.6 9.4 3.6 13 0" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
