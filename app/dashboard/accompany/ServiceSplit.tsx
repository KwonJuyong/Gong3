"use client";

import { useEffect, useState } from "react";
import { ui } from "@/app/components/ui";
import Icon from "@/app/components/Icon";

// 넓은 화면은 서비스를 왼쪽에, Evi 를 오른쪽 패널에 둠. 좁은 화면은 새 탭 안내만
export default function ServiceSplit({ projectId, link }: { projectId: string; link: string }) {
  const [embeddable, setEmbeddable] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(`/api/frame-check?p=${encodeURIComponent(projectId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        setEmbeddable(d?.embeddable ?? false);
        if (d?.embeddable === true && window.innerWidth >= 1024) setOpen(true);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [projectId]);

  let host = link;
  try { host = new URL(link).host; } catch {}

  if (open) {
    return (
      <div className="fixed bottom-0 left-0 right-[440px] top-14 z-[55] flex flex-col bg-white">
        <div className="flex min-h-12 items-center gap-3 border-b border-[var(--gray-100)] px-4">
          <span className="min-w-0 flex-1 truncate text-sm">
            <span className="font-semibold">{host}</span>
            <span className="text-[var(--muted)]"> · 로그인이 안 되면 새 탭에서 열어 주세요</span>
          </span>
          <a className={`${ui.link} shrink-0 text-sm`} href={link} target="_blank" rel="noreferrer">새 탭에서 열기</a>
          <button type="button" className={`${ui.back} shrink-0`} onClick={() => setOpen(false)}>옆 화면 닫기</button>
        </div>
        <iframe src={link} title="평가할 서비스" className="w-full flex-1 border-0" sandbox="allow-same-origin allow-scripts allow-popups allow-forms" />
      </div>
    );
  }
  if (embeddable === true) {
    return (
      <div className={`${ui.panel} hidden items-center justify-between gap-3 lg:flex`}>
        <p className="text-sm">서비스를 왼쪽에 띄우고 오른쪽 Evi와 함께 진행할 수 있어요.</p>
        <button type="button" className={ui.primary} onClick={() => setOpen(true)}>서비스 옆에 띄우기</button>
      </div>
    );
  }
  if (embeddable === false) {
    return (
      <div className={`${ui.panel} flex flex-wrap items-center justify-between gap-3`}>
        <p className="text-sm">이 서비스는 이 화면 안에 띄울 수 없어요. 새 탭에서 열고 Evi에게 돌아와 주세요.</p>
        <a className={ui.primary} href={link} target="_blank" rel="noreferrer"><Icon name="external" size={15} className="mr-2" />서비스 새 탭에서 열기</a>
      </div>
    );
  }
  return null;
}
