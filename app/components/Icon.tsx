// 탭·버튼·상태 표시용 선 아이콘(장식용 사용 금지)
const paths = {
  chart: "M3 3v18h18M8 17V11m5 6V7m5 10v-4",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2m20 0v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6m20 0L18.5 5.1A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1L2 12",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  refresh: "M3 12a9 9 0 0 1 15-6.7L21 8m0-5v5h-5m5 4a9 9 0 0 1-15 6.7L3 16m0 5v-5h5",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm0 0v6h6M8 13h8M8 17h5",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-5 5 5 5-5m-5 5V3",
  check: "M20 6 9 17l-5-5",
  play: "M6 4v16l14-8z",
  external: "M15 3h6v6m0-6-9 9M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
  send: "m22 2-7 20-4-9-9-4zM22 2 11 13",
  undo: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-4",
  plus: "M12 5v14M5 12h14",
  close: "M18 6 6 18M6 6l12 12",
  back: "m15 18-6-6 6-6",
  attach: "m21.4 11-9.2 9.2a6 6 0 0 1-8.5-8.5l8.6-8.6A4 4 0 1 1 18 8.8l-8.6 8.6a2 2 0 0 1-2.8-2.8l8.5-8.5",
  chat: "M7.9 20A9 9 0 1 0 4 16.1L2 22z",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
};

export type IconName = keyof typeof paths;

export default function Icon({ name, size = 16, className = "" }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path d={paths[name]} />
    </svg>
  );
}
