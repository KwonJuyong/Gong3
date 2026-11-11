import ClearQueryParams from "@/app/components/ClearQueryParams";
import { redirectToLogin } from "@/app/session-server";
import { redirect } from "next/navigation";
import { getSessionUser } from "../../db";
import { getQuoteSupplier, getPlatformAccount } from "../../lib/orgSettings";
import { Note } from "../profile/ui";
import OrgSection from "./OrgSection";

export const metadata = { title: "조직 설정" };

export default async function OrgPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const me = await getSessionUser();
  if (!me) redirectToLogin();
  if (me.role !== "ADMIN") redirect("/dashboard");

  const q = await searchParams;
  const [supplier, account] = await Promise.all([getQuoteSupplier(), getPlatformAccount()]);

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <main className="max-w-[900px] mx-auto px-4 sm:px-6 py-8 space-y-5">
        <ClearQueryParams keys={["saved", "error"]} />
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)]">조직 설정</h1>
          <p className="text-sm text-[var(--muted)] mt-1">견적서에 찍히는 공급자 정보와 기업에게 안내할 입금 계좌를 관리해요.</p>
        </div>
        {q.error && <Note tone="danger">{q.error}</Note>}
        {q.saved && !q.error && <Note tone="success">저장되었습니다.</Note>}
        <OrgSection supplier={supplier} account={account} />
      </main>
    </div>
  );
}
