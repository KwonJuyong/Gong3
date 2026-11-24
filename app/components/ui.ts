// 공통 표기(버튼·입력·말풍선). 화면마다 다르게 쓰지 않도록 한 곳에서 관리. 새 버튼은 손으로 클래스를 짜지 말고 여기서 고름
const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

export const ui = {
  panel: "rounded-[var(--radius-xl)] bg-white p-5 sm:p-7",
  primary: `inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] bg-[var(--accent)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-dark)] disabled:cursor-not-allowed disabled:opacity-40 ${focus}`,
  secondary: `inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] bg-[var(--gray-100)] px-5 text-sm font-semibold transition-colors hover:bg-[var(--gray-200)] disabled:opacity-40 ${focus}`,
  primarySm: `inline-flex min-h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] bg-[var(--accent)] px-3.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-dark)] disabled:opacity-40 ${focus}`,
  primaryXs: `inline-flex min-h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-dark)] disabled:opacity-40 ${focus}`,
  secondarySm: `inline-flex min-h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] bg-[var(--gray-100)] px-3.5 text-sm font-semibold transition-colors hover:bg-[var(--gray-200)] disabled:opacity-40 ${focus}`,
  chipBase: `inline-flex min-h-10 items-center rounded-full px-4 text-sm font-medium ring-1 ring-inset transition-colors disabled:opacity-40 ${focus}`,
  chip: `inline-flex min-h-10 items-center rounded-full bg-white px-4 text-sm font-medium ring-1 ring-inset ring-[var(--gray-200)] transition-colors hover:bg-[var(--accent-light)] hover:ring-[var(--accent)] disabled:opacity-40 ${focus}`,
  field: "block w-full rounded-[var(--radius-md)] border border-[var(--gray-200)] bg-white px-3 py-2.5 text-[15px] leading-relaxed placeholder:text-[var(--muted)] transition-colors focus:border-[var(--accent)] focus:outline-none",
  back: `inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-md)] text-sm font-medium text-[var(--muted)] transition-colors hover:text-[var(--foreground)] ${focus}`,
  link: "font-medium text-[var(--accent)] underline-offset-4 hover:underline",
  label: "text-sm font-semibold",
  hint: "text-sm text-[var(--muted)]",
  tint: "rounded-[var(--radius-lg)] bg-[var(--accent-light)]",
  avatar: "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white",
  badge: "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
  avatarSm: "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-bold text-white",
  textButton: `inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-md)] text-sm font-semibold text-[var(--accent)] hover:underline ${focus}`,
  num: "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-light)] text-xs font-bold text-[var(--accent)]",
  bubbleAi: "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tl-md bg-[var(--gray-100)] px-4 py-3 text-[15px] leading-relaxed",
  bubbleAiOnGray: "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tl-md bg-white px-4 py-3 text-[15px] leading-relaxed",
  bubbleMe: "ml-auto max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-[var(--accent)] px-4 py-3 text-[15px] leading-relaxed text-white",
};
