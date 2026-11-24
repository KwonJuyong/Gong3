import Link from "next/link";
import { ui } from "./components/ui";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[var(--surface)] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-[var(--radius-xl)] bg-white p-8 text-center">
        <p className="text-sm font-semibold text-[var(--accent)]">404</p>
        <h1 className="mt-2 text-xl font-bold text-[var(--foreground)]">화면을 찾을 수 없어요</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          주소가 바뀌었거나, 이 화면을 볼 수 있는 계정이 아니에요. 받은 링크가 맞는지 확인해 주세요.
        </p>
        <Link href="/dashboard" className={`${ui.primary} mt-6`}>
          홈으로 가기
        </Link>
      </div>
    </main>
  );
}
