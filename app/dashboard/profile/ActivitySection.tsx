import Link from "next/link";
import { Card } from "./ui";

/** 활동 내역: 참여한 평가(기업이면 발주 요약도) */

export interface ActivityProject {
  id: string;
  title: string;
  status: string;
  startTime: string;
}

export default function ActivitySection({
  projects,
  orderCount,
  showOrders,
}: {
  projects: ActivityProject[];
  orderCount: number;
  showOrders: boolean;
}) {
  return (
    <div className="space-y-5">
      <Card
        title={`참여한 평가 (${projects.length})`}
        desc="응답을 제출한 평가입니다. 제목을 누르면 상세로 이동합니다."
      >
        {projects.length === 0 ? (
          <p className="text-sm text-[var(--gray-500)] text-center py-8">
            아직 참여한 평가가 없습니다.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/dashboard?view=detail&p=${p.id}`}
                className="flex items-center justify-between gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--surface)] hover:bg-[var(--gray-100)] transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--foreground)] truncate">{p.title}</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    {new Date(p.startTime).toLocaleDateString("ko-KR", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
                    p.status === "FINISHED"
                      ? "bg-[var(--gray-100)] text-[var(--gray-500)]"
                      : "bg-[var(--success-light)] text-[var(--success)]"
                  }`}
                >
                  {p.status === "FINISHED" ? "종료" : "진행 중"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {showOrders && (
        <Card title="발주 내역" desc="기업으로서 발주한 평가입니다.">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-[var(--foreground)]">
              총 <strong>{orderCount}</strong>건
            </p>
            <Link
              href="/dashboard/orders"
              className="text-xs font-medium text-[var(--accent)] hover:underline"
            >
              발주 화면으로 이동 →
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
