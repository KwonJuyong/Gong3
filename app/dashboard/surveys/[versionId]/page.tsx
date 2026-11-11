import SubmitButton from "@/app/components/SubmitButton";
import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "../../../db";
import { type SurveyBlock } from "../../../lib/surveyBlocks";
import { legacySurveyWhere } from "../../../lib/approvals";
import { submitResponseAction } from "../actions";

export const metadata = { title: "평가 응답" };

const LIKERT5 = ["전혀 그렇지 않다", "그렇지 않다", "보통", "그렇다", "매우 그렇다"];

function Likert5({ name }: { name: string }) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {LIKERT5.map((label, i) => (
        <label
          key={i}
          className="flex items-center gap-1.5 text-xs text-[var(--muted)] px-2.5 py-1.5 rounded-[var(--radius-md)] border border-[var(--gray-200)] cursor-pointer hover:bg-[var(--surface)]"
        >
          <input type="radio" name={name} value={i + 1} required />
          {label}
        </label>
      ))}
    </div>
  );
}

function Semantic7({
  name,
  left,
  right,
}: {
  name: string;
  left: string;
  right: string;
}) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="w-28 text-right text-xs text-[var(--foreground)] shrink-0">{left}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5, 6, 7].map((v) => (
          <label key={v} className="cursor-pointer">
            <input type="radio" name={name} value={v} required />
          </label>
        ))}
      </div>
      <span className="w-28 text-xs text-[var(--foreground)] shrink-0">{right}</span>
    </div>
  );
}

export default async function TakeSurveyPage({
  params,
  searchParams,
}: {
  params: Promise<{ versionId: string }>;
  searchParams: Promise<{ incomplete?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirectToLogin();
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) redirectToLogin();

  const { versionId } = await params;
  const { incomplete } = await searchParams;

  // URL 로 직접 들어와도 목록과 같은 공개 조건(approvals.ts)을 적용함
  // 없는 id 와 미공개 회차는 같은 응답으로 처리함
  const version = await prisma.surveyVersion.findFirst({
    where: { id: versionId, ...legacySurveyWhere },
    include: { service: { select: { name: true } } },
  });
  if (!version || !version.blocks) redirect("/dashboard/surveys?error=unavailable");

  const already = await prisma.surveyResponse.findUnique({
    where: { surveyVersionId_userId: { surveyVersionId: versionId, userId: me.id } },
  });
  if (already) redirect("/dashboard/surveys?error=duplicate");

  const blocks = version.blocks as unknown as SurveyBlock[];
  const adaptive = blocks.filter((b): b is Extract<SurveyBlock, { kind: "LLM_ADAPTIVE" }> => b.kind === "LLM_ADAPTIVE");
  const instruments = blocks.filter((b): b is Extract<SurveyBlock, { kind: "INSTRUMENT" }> => b.kind === "INSTRUMENT");
  const vignettes = blocks.filter((b): b is Extract<SurveyBlock, { kind: "VIGNETTE" }> => b.kind === "VIGNETTE");

  return (
    <div className="min-h-screen bg-[var(--surface)]">

      <main className="max-w-[900px] mx-auto px-4 sm:px-6 py-8">
        <Link href="/dashboard/surveys" className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)] mb-4">
          ← 목록
        </Link>
        <div className="mb-6">
          <h1 className="text-xl font-bold text-[var(--foreground)]">{version.service.name} 평가</h1>
          <p className="text-sm text-[var(--muted)] mt-1">회차 {version.round} · 모든 문항에 응답해주세요.</p>
        </div>

        {incomplete === "1" && (
          <div className="mb-4 rounded-[var(--radius-md)] bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-2.5">
            모든 문항에 응답해야 제출됩니다.
          </div>
        )}

        <form action={submitResponseAction} className="space-y-6">
          <input type="hidden" name="versionId" value={version.id} />

          {adaptive.length > 0 && (
            <section className="bg-white rounded-[var(--radius-xl)] p-5 space-y-5">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">서비스 평가</h3>
              {adaptive.map((b) => (
                <div key={b.itemKey}>
                  <p className="text-sm text-[var(--foreground)]">{b.text}</p>
                  <Likert5 name={b.itemKey} />
                  <input
                    name={`text:${b.itemKey}`}
                    placeholder="개선 의견 (선택)"
                    className="mt-2 w-full px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--gray-200)] text-xs"
                  />
                </div>
              ))}
            </section>
          )}

          {/* 검증도구 (UEQ 등) */}
          {instruments.map((b) => (
            <section key={b.constructId} className="bg-white rounded-[var(--radius-xl)] p-5">
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-1">{b.constructName}</h3>
              <p className="text-xs text-[var(--muted)] mb-3">
                양쪽 표현 중 더 가깝다고 느끼는 쪽에 표시해주세요. (1~7)
              </p>
              <div className="divide-y divide-[var(--gray-200)]">
                {b.items.map((it) => (
                  <Semantic7
                    key={it.itemKey}
                    name={it.itemKey}
                    left={it.leftLabel || it.text}
                    right={it.rightLabel || ""}
                  />
                ))}
              </div>
            </section>
          ))}

          {vignettes.length > 0 && (
            <section className="bg-white rounded-[var(--radius-xl)] p-5 space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-[var(--foreground)]">기준 시나리오 평가</h3>
                <p className="text-xs text-[var(--muted)] mt-1">
                  아래는 가상의 서비스 상황입니다. 각 상황의 서비스라면 어느 정도일지, 위와 같은 기준으로 평가해주세요.
                </p>
              </div>
              {vignettes.map((b) => (
                <div key={b.constructId} className="space-y-3">
                  <p className="text-xs font-semibold text-[var(--muted)]">{b.constructName} 기준</p>
                  {b.items.map((it) => (
                    <div key={it.itemKey} className="pl-3 border-l-2 border-[var(--gray-200)]">
                      <p className="text-sm text-[var(--foreground)]">{it.text}</p>
                      <Likert5 name={it.itemKey} />
                    </div>
                  ))}
                </div>
              ))}
            </section>
          )}

          <SubmitButton className="w-full px-4 py-3 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-dark)]">
            제출하기
          </SubmitButton>
        </form>
      </main>
    </div>
  );
}
