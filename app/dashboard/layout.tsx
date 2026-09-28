
import { getSessionUserId } from "@/app/session-server";
import { redirect } from "next/navigation";
import { prisma } from "../db";
import FloatingHub from "./FloatingHub";
import NavRail from "./NavRail";
import AppHeader from "./AppHeader";
import { getUnreadTotal } from "./messenger/actions";
import { maskStudentId } from "../lib/privacy";
import { pendingApprovalCount } from "../lib/approvals";
import { canTransact } from "../lib/bizProfile";
import { getSettlementProfile } from "../lib/settlementProfile";
import { getBizProfile } from "../lib/bizProfile";
import { computeCompletion } from "../lib/profileCompletion";
import { kstMonth, monthRange } from "./access/month";

/** 알림함에 싣는 최대 개수. 안 읽은 개수는 따로 센다. */
const NOTIFICATION_LIMIT = 50;

// 모든 대시보드 페이지에 공용 머리글·내비게이션·메신저를 붙인다.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = await getSessionUserId();

  let userRole = "";
  let notifications: {
    id: string;
    content: string;
    isRead: boolean;
    type: string;
    fromUserId: string | null;
    fromStudentId: string | null;
    fromName: string | null;
    createdAt: string;
  }[] = [];
  let unreadNotifications = 0;
  let unreadMessages = 0;
  let pendingApprovals = 0;
  let accessReviewDue = false;
  // 발주 메뉴 표시 여부. 실제 권한 검사는 발주 화면·액션·견적서 API 가 각각 한다.
  let transactable = false;
  let header: React.ComponentProps<typeof AppHeader> | null = null;

  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        notifications: {
          orderBy: { createdAt: "desc" },
          take: NOTIFICATION_LIMIT,
          include: { fromUser: true },
        },
      },
    });
    // 이메일이 없는 계정은 이메일 등록 화면으로 보낸다(/dashboard 밖에 있어야 루프가 없다).
    if (user && !user.email) redirect("/email-setup");

    if (user) {
      userRole = user.role;
      const isAdmin = user.role === "ADMIN";
      notifications = (user.notifications || []).map((n) => ({
        id: n.id,
        content: n.content,
        isRead: n.isRead,
        type: n.type,
        fromUserId: n.fromUserId,
        fromStudentId: n.fromUser ? maskStudentId(n.fromUser.studentId, isAdmin) : null,
        fromName: n.fromUser?.name || null,
        createdAt: n.createdAt.toISOString(),
      }));
      unreadNotifications = await prisma.notification.count({ where: { userId, isRead: false } });
      unreadMessages = await getUnreadTotal();
      transactable = await canTransact(user);
      // 관리자에게만 필요한 값이라 역할을 확인하고 센다.
      if (isAdmin) pendingApprovals = await pendingApprovalCount();
      // 지난달 접속기록 점검(월 1회)을 하지 않았으면 표시한다. 기록이 없던 달은 제외한다.
      if (isAdmin) {
        const prev = kstMonth(-1);
        const range = monthRange(prev)!;
        const [reviewed, logged] = await Promise.all([
          prisma.accessReview.findUnique({ where: { month: prev }, select: { id: true } }),
          prisma.accessLog.count({ where: { createdAt: { gte: range.from, lt: range.to } }, take: 1 }),
        ]);
        accessReviewDue = !reviewed && logged > 0;
      }

      // 머리글 프로필 메뉴의 요약. 완성도는 프로필 화면과 같은 계산을 쓴다.
      const [settlement, biz, rewardCount, participated] = await Promise.all([
        getSettlementProfile(user.id),
        getBizProfile(user.id),
        prisma.reward.count({ where: { userId: user.id } }),
        prisma.response.findMany({ where: { userId: user.id }, distinct: ["projectId"], select: { projectId: true } }),
      ]);
      const completion = computeCompletion({
        role: user.role,
        name: user.name,
        phone: user.phone || "",
        email: user.email || "",
        profileImage: user.profileImage || null,
        settlement,
        biz,
        showBiz: isAdmin || !!biz.bizNo,
        showSettlement: true,
      });
      header = {
        user: {
          name: user.name,
          studentId: user.studentId,
          role: user.role,
          userType: user.userType || "STUDENT",
          major: user.major || "",
          phone: user.phone || "",
          email: user.email || "",
          profileImage: user.profileImage || null,
        },
        participatedCount: participated.length,
        completionPercent: completion.percent,
        // 받을 보상이 있는데 계좌가 없을 때만 표시한다.
        payoutBlocked: !settlement.payoutReady && rewardCount > 0,
        unreadNotifications,
      };
    }
  }

  return (
    <>
      <div className="flex min-h-screen">
        <NavRail
          userRole={userRole}
          pendingApprovals={pendingApprovals}
          canTransact={transactable}
          accessReviewDue={accessReviewDue}
        />
        <div className="flex-1 min-w-0 flex flex-col">
          {header && <AppHeader {...header} />}
          <div className="flex-1">{children}</div>
        </div>
      </div>
      <FloatingHub
        notifications={notifications}
        userRole={userRole}
        initialUnreadMessages={unreadMessages}
      />
    </>
  );
}
