import ClearQueryParams from "@/app/components/ClearQueryParams";
import { redirectToLogin } from "@/app/session-server";
import { redirect } from "next/navigation";
import { prisma, getSessionUser } from "../../db";
import { sessionTtlFor } from "../../session";
import { getSettlementProfile, type SettlementProfileView } from "../../lib/settlementProfile";
import { getBizProfile } from "../../lib/bizProfile";
import { computeCompletion } from "../../lib/profileCompletion";
import ProfileTabs, { TABS, type TabKey } from "./ProfileTabs";
import ProfileHeader from "./ProfileHeader";
import BasicSection from "./BasicSection";
import SettlementSection from "./SettlementSection";
import BizSection from "./BizSection";
import NotifySection from "./NotifySection";
import SecuritySection from "./SecuritySection";
import { Note } from "./ui";
import { KIND_LABEL, summarizeUA } from "../../lib/accessLog";
import { roleLabel } from "../../lib/roleLabel";

export const metadata = { title: "프로필" };

/**
 * 프로필: 개인·정산·기업 정보를 편집하는 화면. 탭은 ?tab= 쿼리로 정함(ProfileTabs.tsx).
 */
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; saved?: string; error?: string }>;
}) {
  const q = await searchParams;
  const me = await getSessionUser();
  if (!me) redirectToLogin();
  // 저장해 둔 옛 주소
  if (q.tab === "org") redirect("/dashboard/org");
  if (q.tab === "activity") redirect("/dashboard/surveys#participated");

  const role = me.role;
  const userType = me.userType || "STUDENT";
  // 알 수 없는 탭이면 기본 탭을 보여줌
  const tab: TabKey = TABS.some((t) => t.key === q.tab)
    ? (q.tab as TabKey)
    : "basic";

  const [settlement, biz] = await Promise.all([
    getSettlementProfile(me.id),
    getBizProfile(me.id),
  ]);

  // 기업 정보 탭은 모두에게 보이지만 완성도에는 ADMIN 이거나 입력을 시작한 사람만 포함함
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

  // 본인 로그인 기록(보안 탭). 시각은 서버에서 한국 시각 문자열로 만듦
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

  const idLabel = userType === "DEVELOPER" ? "이메일" : userType === "STAFF" ? "사번" : "학번";

  return (
    <div className="min-h-screen bg-[var(--surface)]">

      <ProfileHeader
        name={me.name}
        studentId={me.studentId}
        roleLabel={roleLabel(role, userType)}
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
                  // 비어 있으면 가입 이메일로 채움(발주 폼과 같은 규칙).
                  bizEmail: biz.bizEmail || me.email || "",
                  invoiceReady: biz.invoiceReady,
                  // 브라우저 타임존 차이가 없도록 서버에서 문자열로 만듦
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

/** 정산 탭. 지급 완료 보상이 있으면 홈택스 안내도 보여줌 */
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
