import { notFound, redirect } from "next/navigation";
import { prisma } from "@/app/db";
import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import CreateShell from "../../../services/CreateShell";
import { linkableOrdersFor } from "../../../linkableOrders";
import RecruitForm from "../../RecruitForm";

export const metadata = { title: "동행 평가 모집·비용" };

export default async function AccompanyRecruitPage({ params }: { params: Promise<{ projectId: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) redirectToLogin();
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!me) redirectToLogin();
  const { projectId } = await params;
  const project = await prisma.project.findFirst({
    where: { id: projectId, evalMode: "ACCOMPANY", ...(me.role === "ADMIN" ? {} : { creatorId: me.id }) },
    select: { id: true, title: true, status: true, startTime: true, scenario: { select: { projectId: true } } },
  });
  if (!project) notFound();
  // 이미 승인을 요청했거나 과제를 정하지 않았으면 과제 화면이 다음 할 일을 안내함
  if (project.status !== "DRAFT" || !project.scenario) redirect(`/dashboard?view=task&p=${projectId}`);
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(project.startTime);

  return (
    <main className="max-w-[900px] mx-auto px-4 sm:px-6 py-8">
      <CreateShell method="accompany" step={3} targets={{ 2: { href: `/dashboard?view=task&p=${projectId}` } }}
        title={`${project.title} 모집·비용`} lead="일정·인원과 비용 처리 방식을 정해 승인을 요청해요. 과제를 고치려면 위 단계에서 「Evi 과제 인터뷰」를 눌러요.">
        <RecruitForm projectId={project.id} title={project.title} date={date} orders={await linkableOrdersFor(me)} />
      </CreateShell>
    </main>
  );
}
