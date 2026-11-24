"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { hubDock, useDockSlot } from "../hubDock";

// 넓은 화면은 Evi 평가 세션을 Evi·메신저 창의 오른쪽 패널에 띄우고, 좁은 화면은 페이지 안에 그대로 둠
export default function HubDock({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const [wide, setWide] = useState<boolean | null>(null);
  const slot = useDockSlot();

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (wide !== false) return;
    hubDock.setInline(true);
    return () => hubDock.setInline(false);
  }, [wide]);

  useEffect(() => {
    if (!wide) return;
    hubDock.setRequest({ title, subtitle });
    return () => hubDock.setRequest(null);
  }, [wide, title, subtitle]);

  if (wide === null) return null;
  if (!wide) return <>{children}</>;
  return slot ? createPortal(children, slot) : null;
}
