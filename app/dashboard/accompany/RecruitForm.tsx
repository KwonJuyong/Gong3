"use client";

import { useState } from "react";
import SubmitButton from "@/app/components/SubmitButton";
import { ProjectGuidesInput } from "@/app/components/ProjectGuidesField";
import { ui } from "@/app/components/ui";
import FundingFields, { type LinkableOrder } from "../FundingFields";
import { requestAccompanyApprovalAction } from "./create-actions";

const field = ui.field;
const labelCls = "block text-sm font-semibold mb-1.5";

/** 동행 평가 3단계(모집·비용). 과제를 정한 뒤 일정·인원·비용 처리를 정해 승인을 요청함 */
export default function RecruitForm({ projectId, title, date, orders }: {
  projectId: string;
  title: string;
  date: string;
  orders: LinkableOrder[];
}) {
  const [funding, setFunding] = useState("COMPANY");
  const [error, setError] = useState("");

  return (
    <form
      action={requestAccompanyApprovalAction}
      onSubmit={(e) => {
        const fd = new FormData(e.currentTarget);
        const min = parseInt(String(fd.get("minParticipants") || "1"), 10);
        const max = parseInt(String(fd.get("maxParticipants") || "0"), 10);
        const msg = !(min >= 1) ? "최소 인원은 1명 이상이어야 해요." : !(max >= min) ? "정원은 최소 인원보다 적을 수 없어요." : "";
        setError(msg);
        if (msg) e.preventDefault();
      }}
      className="space-y-4"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <section className={`${ui.panel} space-y-4`}>
        <h2 className="text-base font-bold">모집</h2>
        <div>
          <label htmlFor="acc-title" className={labelCls}>평가 제목</label>
          <input id="acc-title" name="title" required defaultValue={title} className={field} />
        </div>
        <div>
          <label htmlFor="acc-desc" className={labelCls}>모집 안내 (선택)</label>
          <textarea id="acc-desc" name="description" rows={3} placeholder="참여 대상, 준비물, 시험용 계정 등" className={`${field} resize-y`} />
        </div>
        <ProjectGuidesInput />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="acc-date" className={labelCls}>평가 날짜</label>
            <input id="acc-date" name="date" type="date" required defaultValue={date} className={field} />
          </div>
          <div>
            <label htmlFor="acc-time" className={labelCls}>시간</label>
            <input id="acc-time" name="time" type="time" required defaultValue="10:00" className={field} />
          </div>
        </div>
        <div>
          <label htmlFor="acc-loc" className={labelCls}>장소</label>
          <input id="acc-loc" name="location" placeholder="온라인이면 비워 두세요" className={field} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="acc-min" className={labelCls}>최소 인원</label>
            <input id="acc-min" name="minParticipants" type="number" min={1} defaultValue={1} className={field} />
          </div>
          <div>
            <label htmlFor="acc-max" className={labelCls}>정원 (최대 인원)</label>
            <input id="acc-max" name="maxParticipants" type="number" min={1} defaultValue={10} className={field} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="acc-ed" className={labelCls}>신청 마감일 (선택)</label>
            <input id="acc-ed" name="enrollmentDeadlineDate" type="date" className={field} />
          </div>
          <div>
            <label htmlFor="acc-et" className={labelCls}>신청 마감 시간</label>
            <input id="acc-et" name="enrollmentDeadlineTime" type="time" defaultValue="23:59" className={field} />
          </div>
        </div>
      </section>

      <section className={ui.panel}>
        <FundingFields value={funding} onChange={setFunding} orders={orders} />
      </section>

      {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3">
        <p className={`${ui.hint} sm:mr-auto`}>관리자가 승인하면 모집이 시작돼요. 학생을 선발하면 운영진이 과제를 공개해요.</p>
        <SubmitButton pendingText="요청 중…" className={ui.primary}>승인 요청하기</SubmitButton>
      </div>
    </form>
  );
}
