import { redirect } from "next/navigation";
import { prisma } from "@/app/db";
import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import SubmitButton from "@/app/components/SubmitButton";
import { ui } from "@/app/components/ui";
import CreateShell from "../../services/CreateShell";
import { startAccompanyAction } from "../create-actions";

export const metadata = { title: "동행 평가 만들기" };

const labelCls = "block text-sm font-semibold mb-1.5";

export default async function NewAccompanyPage({ searchParams }: { searchParams: Promise<{ d?: string; error?: string; service?: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) redirectToLogin();
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!me) redirectToLogin();
  if (me.role !== "DEVELOPER" && me.role !== "ADMIN") redirect("/dashboard");
  const { d, error, service } = await searchParams;
  const date = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
  // 같은 서비스를 다시 평가할 때 이름을 다시 치지 않게 이전 이름을 고를 수 있게 함
  const services = await prisma.service.findMany({ where: { ownerId: me.id }, select: { id: true, name: true }, orderBy: { createdAt: "desc" } });
  const preset = services.find((s) => s.id === service)?.name ?? "";

  return (
    <main className="max-w-[900px] mx-auto px-4 sm:px-6 py-8">
      <CreateShell method="accompany" step={1} date={date || undefined} title="Evi 동행 평가 만들기"
        lead="무엇을 평가할지만 알려 주세요. 다음 단계에서 Evi와 학생에게 줄 과제를 정해요.">
      <form action={startAccompanyAction} className={`${ui.panel} space-y-5`}>
        {date && <input type="hidden" name="d" value={date} />}
        <div>
          <label htmlFor="acc-service" className={labelCls}>평가할 서비스 이름</label>
          <input id="acc-service" name="serviceName" required maxLength={100} defaultValue={preset} list="acc-services" placeholder="예: 스터디메이트 AI 학습 플래너" className={ui.field} />
          {services.length > 0 && (
            <datalist id="acc-services">
              {services.map((s) => <option key={s.id} value={s.name} />)}
            </datalist>
          )}
          {error === "name" && <p role="alert" className="text-sm text-[var(--danger)] mt-1">서비스 이름을 입력해 주세요.</p>}
        </div>
        <div>
          <label htmlFor="acc-link" className={labelCls}>서비스 주소 (선택)</label>
          <input id="acc-link" name="link" inputMode="url" autoComplete="url" placeholder="https://..." className={ui.field} />
          <p className={`${ui.hint} mt-1`}>학생이 과제 화면에서 바로 열어요. 앱처럼 주소가 없으면 비워 두세요.</p>
        </div>
        <div className="flex justify-end">
          <SubmitButton pendingText="준비 중…" className={ui.primary}>다음: Evi와 과제 정하기</SubmitButton>
        </div>
      </form>
      </CreateShell>
    </main>
  );
}
