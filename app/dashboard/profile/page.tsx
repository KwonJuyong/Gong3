import ClearQueryParams from "@/app/components/ClearQueryParams";
import { redirectToLogin } from "@/app/session-server";
import Link from "next/link";
import { prisma, getSessionUser } from "../../db";
import { sessionTtlFor } from "../../session";
import { getSettlementProfile, type SettlementProfileView } from "../../lib/settlementProfile";
import { getBizProfile } from "../../lib/bizProfile";
import { getQuoteSupplier, getPlatformAccount } from "../../lib/orgSettings";
import { computeCompletion } from "../../lib/profileCompletion";
import ProfileTabs, { visibleTabs, type TabKey } from "./ProfileTabs";
import ProfileHeader from "./ProfileHeader";
import BasicSection from "./BasicSection";
import SettlementSection from "./SettlementSection";
import BizSection from "./BizSection";
import NotifySection from "./NotifySection";
import OrgSection from "./OrgSection";
import ActivitySection, { type ActivityProject } from "./ActivitySection";
import SecuritySection from "./SecuritySection";
import { Note } from "./ui";
import { KIND_LABEL, summarizeUA } from "../../lib/accessLog";

export const metadata = { title: "프로필" };

/**
 * 프로필: 개인·정산·기업·조직 정보를 편집하는 화면. 탭은 ?tab= 쿼리로 정한다(ProfileTabs.tsx).
 */
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; saved?: string; error?: string }>;
}) {
  const q = await searchParams;
  const me = await getSessionUser();
  if (!me) redirectToLogin();

  const role = me.role;
  const userType = me.userType || "STUDENT";
  const allowed = visibleTabs(role).map((t) => t.key);
  // 알 수 없거나 권한 없는 탭이면 기본 탭을 보여준다.
  const tab: TabKey = (allowed as string[]).includes(q.tab ?? "")
    ? (q.tab as TabKey)
    : "basic";

  const [settlement, biz] = await Promise.all([
    getSettlementProfile(me.id),
    getBizProfile(me.id),
  ]);

  // 기업 정보 탭은 모두에게 보이지만 완성도에는 ADMIN 이거나 입력을 시작한 사람만 포함한다.
  const showBiz = role === "ADMIN" || !!biz.bizNo;

  const completion = computeCompletion({
    role,
    name: me.name,
    phone: me.phone || "",
    email: me.email || "",
    profileImage: me.profileImage,
    settlement,
    biz,
    showBiz,
    showSettlement: true,
  });

  // 본인 로그인 기록(보안 탭). 시각은 서버에서 한국 시각 문자열로 만든다.
  const loginHistory =
    tab === "security"
      ? (
          await prisma.accessLog.findMany({
            where: {
              userId: me.id,
              kind: { in: ["LOGIN", "LOGIN_FAIL", "PASSWORD_CHANGE", "PASSWORD_RESET", "LOGOUT_OTHERS"] },
            },
            orderBy: { createdAt: "desc" },
            take: 15,
          })
        ).map((l) => ({
          id: l.id,
          at: new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(
            l.createdAt,
          ),
          kind: KIND_LABEL[l.kind] ?? l.kind,
          failed: l.kind === "LOGIN_FAIL",
          ip: l.ip,
          device: summarizeUA(l.userAgent),
          result: l.result,
        }))
      : [];

  const roleLabel =
    role === "ADMIN"
      ? "최고관리자"
      : role === "DEVELOPER"
        ? userType === "STAFF"
          ? "교직원·조교"
          : "게스트"
        : "평가단원";
  const idLabel = userType === "DEVELOPER" ? "이메일" : userType === "STAFF" ? "사번" : "학번";

  return (
    <div className="min-h-screen bg-[var(--surface)]">

      <ProfileHeader
        name={me.name}
        studentId={me.studentId}
        roleLabel={roleLabel}
        idLabel={idLabel}
        profileImage={me.profileImage}
        completion={completion}
      />

      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8">
        <ClearQueryParams keys={["saved", "error"]} />
        {/* 저장 결과 안내(?saved=1 / ?error=) */}
        {q.error && (
          <div className="mb-5">
            <Note tone="danger">{q.error}</Note>
          </div>
        )}
        {q.saved && !q.error && (
          <div className="mb-5">
            <Note tone="success">저장되었습니다.</Note>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6">
          <aside className="lg:w-56 shrink-0">
            <div className="lg:sticky lg:top-20">
              <ProfileTabs
                role={role}
                active={tab}
                tabsWithMissing={completion.tabsWithMissing}
              />
            </div>
          </aside>

          <div className="flex-1 min-w-0">
            {tab === "basic" && (
              <BasicSection
                user={{
                  name: me.name,
                  userType,
                  major: me.major || "",
                  phone: me.phone || "",
                  email: me.email || "",
                  profileImage: me.profileImage,
                  emailVerified: me.emailVerifiedAt != null,
                }}
              />
            )}

            {tab === "settlement" && <SettlementPanel userId={me.id} profile={settlement} />}

            {tab === "biz" && (
              <BizSection
                initial={{
                  bizNo: biz.bizNo,
                  bizName: biz.bizName,
                  bizCeo: biz.bizCeo,
                  bizAddr: biz.bizAddr,
                  // 비어 있으면 가입 이메일로 채운다(발주 폼과 같은 규칙).
                  bizEmail: biz.bizEmail || me.email || "",
                  invoiceReady: biz.invoiceReady,
                  // 브라우저 타임존 차이가 없도록 서버에서 문자열로 만든다.
                  attestedAt: biz.attestedAt
                    ? new Intl.DateTimeFormat("ko-KR", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "Asia/Seoul",
                      }).format(biz.attestedAt)
                    : null,
                  bizState: biz.bizState,
                }}
              />
            )}

            {tab === "notify" && <NotifySection />}

            {tab === "org" && <OrgPanel />}

            {tab === "activity" && <ActivityPanel userId={me.id} showOrders={showBiz} />}

            {tab === "security" && (
              <SecuritySection
                userType={userType}
                studentId={me.studentId}
                sessionTtlHours={sessionTtlFor(role) / 3600}
                loginHistory={loginHistory}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/** 정산 탭. 지급 완료 보상이 있으면 홈택스 안내도 보여준다. */
async function SettlementPanel({
  userId,
  profile,
}: {
  userId: string;
  profile: SettlementProfileView;
}) {
  const paidCount = await prisma.reward.count({ where: { userId, status: "PAID" } });

  return (
    <SettlementSection
      profile={{
        bankName: profile.bankName,
        accountNumber: profile.accountNumber,
        holderName: profile.holderName,
        address: profile.address,
        signatureUrl: profile.signatureUrl,
        hasRrn: profile.hasRrn,
        rrnMasked: profile.rrnMasked,
        payoutReady: profile.payoutReady,
        withholdingReady: profile.withholdingReady,
        byAdmin: profile.byAdmin,
        consented: profile.consentAt != null,
        hasPaidRewards: paidCount > 0,
      }}
    />
  );
}

async function OrgPanel() {
  const [supplier, account] = await Promise.all([getQuoteSupplier(), getPlatformAccount()]);
  return <OrgSection supplier={supplier} account={account} />;
}

async function ActivityPanel({ userId, showOrders }: { userId: string; showOrders: boolean }) {
  const [responses, orderCount] = await Promise.all([
    prisma.response.findMany({
      where: { userId },
      select: {
        project: { select: { id: true, title: true, status: true, startTime: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    showOrders ? prisma.order.count({ where: { buyerId: userId } }) : Promise.resolve(0),
  ]);

  // 한 평가에 응답이 여러 개일 수 있어 중복을 제거한다(대시보드와 같은 규칙).
  const seen = new Set<string>();
  const projects: ActivityProject[] = [];
  for (const r of responses) {
    const p = r.project;
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    projects.push({
      id: p.id,
      title: p.title,
      status: p.status,
      startTime: p.startTime.toISOString(),
    });
  }

  return <ActivitySection projects={projects} orderCount={orderCount} showOrders={showOrders} />;
}
