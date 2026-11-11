import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import Link from "next/link";
import { prisma } from "@/app/db";
import { activeCertGroups, type CertAnswers, type CertServiceFlags } from "@/app/lib/certChecklist";
import ChecklistForm, { type PlainGroup } from "./ChecklistForm";

export const metadata = { title: "인증 준비 점검" };

// 인증 준비 자가점검(부가 기능). 인증 절차가 아니므로 판정처럼 읽히는 표현은 쓰지 않음
// 제도 설명은 직접 쓰고 공식 자료는 링크로만 안내함

export const dynamic = "force-dynamic";

/** 공식 안내처. 본문을 옮기지 않고 링크만 보냄 */
const OFFICIAL_LINKS = [
  { name: "TTA 소프트웨어 시험인증", href: "https://cs.tta.or.kr/" },
  { name: "KTR 소프트웨어 시험평가", href: "https://ktr.or.kr/" },
  { name: "KTL 소프트웨어 시험인증", href: "https://customer.ktl.re.kr/" },
];

const PROCESS = [
  { step: "사전 상담", body: "제품 자료를 내고 시험 대상이 되는지, 비용이 얼마인지 확인합니다." },
  { step: "비용 납부", body: "제시된 견적에 따라 납부합니다. 공개 정가는 없고 제품마다 다릅니다." },
  { step: "시험 준비", body: "시험원이 배정되고 시험 환경을 협의합니다. 계정·설치 절차가 여기서 필요합니다." },
  { step: "시험 수행", body: "제출한 기능 목록에서 만든 시험 항목을 수행하고, 결함이 나오면 보완 기회를 준 뒤 다시 시험합니다." },
  { step: "결과 통보", body: "시험 결과서와 인증서가 발급되고 기관 홈페이지에 게시됩니다." },
];

export default async function CertificationPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirectToLogin();
  const { service: wanted } = await searchParams;

  const services = await prisma.service.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      isAiService: true,
      hasPersonalData: true,
      isSafetyCritical: true,
      certReadiness: { select: { answers: true, note: true, updatedAt: true } },
    },
  });

  // 요청한 서비스가 내 것이 아니면 첫 번째 서비스를 보여줌
  const service = services.find((s) => s.id === wanted) ?? services[0] ?? null;

  const flags: CertServiceFlags | null = service
    ? {
        isAiService: service.isAiService,
        hasPersonalData: service.hasPersonalData,
        isSafetyCritical: service.isSafetyCritical,
      }
    : null;

  // 조건부 문항(when)은 함수라 클라이언트로 넘길 수 없어 여기서 거름
  const groups: PlainGroup[] = flags
    ? activeCertGroups(flags).map((g) => ({
        id: g.id,
        title: g.title,
        note: g.note,
        items: g.items.map((it) => ({ id: it.id, q: it.q, why: it.why, basis: it.basis })),
      }))
    : [];

  const saved = (service?.certReadiness?.answers ?? {}) as CertAnswers;

  return (
    <div className="min-h-screen bg-[var(--surface)]">

      <main className="max-w-[900px] mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-[var(--foreground)]">인증 준비 점검</h1>
          <p className="text-sm text-[var(--muted)] mt-1 leading-relaxed">
            소프트웨어 시험인증을 신청하기 전에 스스로 확인할 것을 모았습니다.
            우리 평가와는 별개의 제도입니다.
          </p>
        </div>

        <div className="mb-6 rounded-[var(--radius-xl)] border border-[var(--gray-300)] bg-white p-5">
          <p className="text-sm text-[var(--gray-700)] leading-relaxed">
            <b className="text-[var(--foreground)]">이 점검은 인증이 아닙니다.</b> 우리는
            시험기관이 아니며 어떤 판정도 하지 않습니다. 여기서 나오는 것은 합격 여부나 점수가
            아니라 <b className="text-[var(--foreground)]">보완이 필요한 항목의 목록</b>뿐입니다.
            실제 시험은 지정된 기관이 시험원을 배정해 수행합니다.
          </p>
        </div>

        <section className="mb-6 bg-white rounded-[var(--radius-xl)] p-6">
          <div className="mb-5">
            <h3 className="text-base font-semibold text-[var(--foreground)]">제도가 어떻게 돌아가나</h3>
            <p className="text-sm text-[var(--muted)] mt-1 leading-relaxed">
              문서 심사만으로 주는 인증과 달리 실제 운영환경과 비슷한 환경에서 시험을 수행합니다.
              그래서 <b>준비물이 곧 시험의 범위</b>가 됩니다.
            </p>
          </div>

          <ol className="space-y-3">
            {PROCESS.map((p, i) => (
              <li key={p.step} className="flex gap-3.5">
                <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--gray-100)] text-[var(--gray-600)] text-xs font-semibold flex items-center justify-center tabular-nums">
                  {i + 1}
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-sm font-medium text-[var(--foreground)]">{p.step}</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5 leading-relaxed">{p.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-5 pt-4 border-t border-[var(--gray-100)] space-y-2">
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              기준 표준: ISO/IEC 25023(품질 측정) · 25041(평가 절차) · 25051(문서·품질 요구사항).
              절차·비용·소요기간은 기관과 제품에 따라 다르므로 공식 안내처에서 확인하세요.
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {OFFICIAL_LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-xs text-[var(--gray-600)] underline hover:text-[var(--foreground)]"
                >
                  {l.name} ↗
                </a>
              ))}
            </div>
          </div>
        </section>

        {!service ? (
          <section className="bg-white rounded-[var(--radius-xl)] p-8 text-center">
            <p className="text-sm text-[var(--gray-700)]">
              등록한 서비스가 없어 점검을 시작할 수 없습니다.
            </p>
            <p className="text-xs text-[var(--muted)] mt-1.5 leading-relaxed">
              서비스 속성(AI 여부·개인정보 처리 등)에 따라 확인할 항목이 달라집니다.
            </p>
            <Link
              href="/dashboard/services"
              className="inline-block mt-5 px-4 py-2 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-sm font-medium hover:bg-[var(--accent-dark)] transition-colors"
            >
              서비스 등록하러 가기
            </Link>
          </section>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              {services.length > 1 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[var(--muted)]">대상 서비스</span>
                  {services.map((s) => (
                    <Link
                      key={s.id}
                      href={`/dashboard/certification?service=${s.id}`}
                      className={`text-xs px-3 py-1.5 rounded-[var(--radius-md)] border transition-colors ${
                        s.id === service.id
                          ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                          : "bg-white text-[var(--muted)] border-[var(--gray-200)] hover:border-[var(--gray-400)]"
                      }`}
                    >
                      {s.name}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--gray-700)]">
                  대상 서비스 <b className="text-[var(--foreground)]">{service.name}</b>
                </p>
              )}
              {service.certReadiness?.updatedAt && (
                <p className="text-xs text-[var(--muted)]">
                  마지막 저장{" "}
                  {service.certReadiness.updatedAt.toLocaleDateString("ko-KR", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    timeZone: "Asia/Seoul",
                  })}
                </p>
              )}
            </div>
            <ChecklistForm
              // 서비스를 바꾸면 폼 상태를 새로 만듦
              key={service.id}
              serviceId={service.id}
              groups={groups}
              initialAnswers={saved}
              initialNote={service.certReadiness?.note ?? ""}
            />
          </>
        )}
      </main>
    </div>
  );
}
