"use server";

import { Prisma } from "@prisma/client";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/app/db";
import { decisions, recheckResults, nextPhase, readMeasurement, checkItems, readChecks } from "@/app/lib/scenario";
import { capacityOf } from "@/app/lib/approvals";
import { createRewardForResponse } from "@/app/lib/rewards";
import { saveResponse } from "@/app/lib/responses";
import { pushNotificationRows } from "@/app/lib/notify";
import { scenarioScope, scenarioViewer } from "./access";

function field(form: FormData, key: string, max: number) {
  const value = form.get(key);
  return typeof value === "string" && value.trim().length <= max
    ? value.trim()
    : "";
}

// 대화 끝에 학생이 확인한 개선 요청 여러 건
function readNotes(form: FormData) {
  try {
    const raw: unknown = JSON.parse(String(form.get("notes") ?? "[]"));
    if (!Array.isArray(raw) || raw.length > 10) return null;
    const notes = raw.filter((n): n is string => typeof n === "string").map((n) => n.trim()).filter(Boolean);
    return notes.length === raw.length && notes.every((n) => n.length <= 1500) ? notes : null;
  } catch {
    return null;
  }
}

// 동행 대화 원문. 형식이 틀리면 저장 거절, 없으면 생략. 길면 최근 메시지만 남겨 기록 저장을 막지 않음
const TRANSCRIPT_CHARS = 60000;
function readTranscript(form: FormData): Prisma.InputJsonValue | undefined | null {
  const raw = form.get("transcript");
  if (raw === null) return undefined;
  try {
    const log: unknown = JSON.parse(String(raw));
    if (!Array.isArray(log) || !log.every((m) =>
      m && typeof m === "object" && ["npc", "me"].includes((m as { from: unknown }).from as string) &&
      typeof (m as { text: unknown }).text === "string")) return null;
    const kept: { from: string; text: string }[] = [];
    let size = 0;
    for (const m of (log as { from: string; text: string }[]).toReversed()) {
      const text = m.text.slice(0, 4000);
      if (size + text.length > TRANSCRIPT_CHARS || kept.length >= 300) break;
      size += text.length;
      kept.unshift({ from: m.from, text });
    }
    return kept;
  } catch {
    return null;
  }
}

// 학생이 올린 화면 캡처. 이 서비스의 업로드 경로로 저장된 이미지 주소만 10장까지
function readImages(form: FormData) {
  try {
    const raw: unknown = JSON.parse(String(form.get("images") ?? "[]"));
    if (!Array.isArray(raw) || raw.length > 10) return null;
    const ok = raw.every((i) => i && typeof i === "object" &&
      /^\/api\/uploads\/[0-9a-f-]{36}\.(png|jpe?g|gif|webp)$/.test(String((i as { url: unknown }).url)) &&
      typeof (i as { name: unknown }).name === "string" && (i as { name: string }).name.length <= 200);
    return ok ? (raw as { url: string; name: string }[]).map(({ url, name }) => ({ url, name })) : null;
  } catch {
    return null;
  }
}

// 학생이 남긴 개선 요청을 개설자가 알 수 있게 알림(회신 대기 목록으로 바로 이동)
async function notifyNewRequests(tx: Prisma.TransactionClient, pushes: Pushed, creatorId: string | null, title: string, count: number, link: string) {
  if (!creatorId || count < 1) return;
  const row = { userId: creatorId, content: `동행 평가 ‘${title}’에 새 개선 요청 ${count}건이 도착했어요.`, link };
  await tx.notification.create({ data: { ...row, type: "INFO" } });
  pushes.push(row);
}
type Pushed = { userId: string; content: string; link: string }[];

export async function saveScenario(projectId: string, form: FormData) {
  const user = await scenarioViewer();
  const path = `/dashboard/accompany/${encodeURIComponent(projectId)}`;
  const op = form.get("op");
  const taskUrl = `/dashboard?view=task&p=${encodeURIComponent(projectId)}`;
  const invalid = () => redirect(taskUrl + "&error=invalid");
  const stale = () => redirect(taskUrl + "&error=changed");
  let createdResponse: string | null = null;
  let published: "published" | "published-wait" | null = null;
  // 트랜잭션 안에서 저장한 알림. 커밋 뒤 웹 푸시로 보냄
  const pushes: Pushed = [];
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
      const project = await tx.project.findFirst({
        where: { id: projectId, ...scenarioScope(user) },
        select: {
          title: true,
          status: true,
          closedAt: true,
          creatorId: true,
          evalMode: true,
          maxParticipants: true,
          order: { select: { panelSize: true } },
          scenario: {
            include: { releases: { orderBy: { phase: "desc" }, take: 1 } },
          },
        },
      });
      if (!project) notFound();
      const manager = user.role === "ADMIN" || project.creatorId === user.id;
      const brief = project.scenario;
      const latest = brief?.releases[0]?.phase ?? 1;

      if (op === "draft") {
        if (!manager || project.evalMode !== "ACCOMPANY" || brief?.publishedAt || project.status === "FINISHED")
          notFound();
        if (String(brief?.revision ?? 0) !== form.get("revision")) stale();
        const data = {
          description: field(form, "description", 1500),
          task: field(form, "task", 1500),
          outcome: field(form, "outcome", 500),
          metric: field(form, "metric", 250),
          unit: field(form, "unit", 30),
          version: field(form, "version", 80),
          lowerBetter: form.get("direction") === "lower",
        };
        if (
          Object.values(data).some((v) => v === "") ||
          !["lower", "higher"].includes(String(form.get("direction")))
        )
          invalid();
        await tx.scenarioBrief.upsert({
          where: { projectId },
          create: { projectId, ...data, revision: 1 },
          update: { ...data, revision: { increment: 1 } },
        });
        return;
      }
      if (!brief) notFound();
      if (op === "publish") {
        if (
          user.role !== "ADMIN" ||
          !["ACTIVE", "RECRUITING"].includes(project.status)
        )
          notFound();
        if (
          brief.publishedAt ||
          String(brief.revision) !== form.get("revision")
        )
          stale();
        await tx.scenarioBrief.update({
          where: { projectId },
          data: { publishedAt: new Date() },
        });
        // 이미 시작한 평가의 선발 학생에게만 알림. 모집 중이면 평가 시작 알림이 과제로 안내함(학생은 시작 전 과제 화면에 못 들어감)
        const accepted = project.status !== "ACTIVE" ? [] : await tx.enrollment.findMany({
          where: { projectId, status: "ACCEPTED" },
          select: { userId: true },
        });
        const opened = accepted.map(({ userId }) => ({
          userId,
          content: `동행 평가 ‘${project.title}’의 과제가 열렸어요. Evi와 함께 진행해 주세요.`,
          link: taskUrl,
        }));
        // 개설자는 공개 여부를 따로 알 길이 없어 함께 알림
        if (project.creatorId && project.creatorId !== user.id)
          opened.push({
            userId: project.creatorId,
            content: project.status === "ACTIVE"
              ? `동행 평가 ‘${project.title}’의 과제를 학생에게 공개했어요.`
              : `동행 평가 ‘${project.title}’의 과제를 공개했어요. 평가를 시작하면 선발된 학생이 바로 참여해요.`,
            link: taskUrl,
          });
        await tx.notification.createMany({ data: opened.map((r) => ({ ...r, type: "INFO" })) });
        pushes.push(...opened);
        published = project.status === "ACTIVE" ? "published" : "published-wait";
        return;
      }
      if (!brief.publishedAt) notFound();
      if (op === "read" || op === "start" || op === "incident") {
        if (manager) notFound();
        const mine = await tx.scenarioReading.findMany({
          where: { projectId, userId: user.id },
          select: { phase: true },
        });
        const phase = nextPhase(
          mine.map((r) => r.phase),
          latest,
          project.status === "ACTIVE" && !project.closedAt,
        );
        if (phase === null || String(phase) !== form.get("phase"))
          return stale();
        const key = { projectId, userId: user.id, phase };
        if (phase > 0) {
          if (op === "start") {
            await tx.scenarioTask.upsert({
              where: { projectId_userId_phase: key },
              create: key,
              update: {},
            });
            return;
          }
          const started = await tx.scenarioTask.findUnique({
            where: { projectId_userId_phase: key },
          });
          if (!started) return stale();
          if (op === "incident") {
            const incident = field(form, "incident", 1000);
            if (!incident) return invalid();
            if (started.stuckAt) return stale();
            await tx.scenarioTask.update({
              where: { projectId_userId_phase: key },
              data: { incident, stuckAt: new Date() },
            });
            return;
          }
        } else if (op !== "read") {
          return invalid();
        }
        const items = checkItems(brief.metric);
        const checks = items.length > 1 ? readChecks(form, items.length) : null;
        if (items.length > 1 && !checks) return invalid();
        const data = readMeasurement(form, checks ?? undefined);
        if (!data) return invalid();
        const notes = phase > 0 ? readNotes(form) : [];
        const transcript = readTranscript(form);
        const images = readImages(form);
        if (!notes || transcript === null || !images) return invalid();
        await tx.scenarioReading.create({ data: {
          ...key, ...data, checks: checks ?? undefined, transcript, images: images.length ? images : undefined, note: phase === 0 ? data.note : "",
          requests: notes.length ? { create: notes.map((note) => ({ note })) } : undefined,
        } });
        await notifyNewRequests(tx, pushes, project.creatorId, project.title, notes.length, taskUrl + "&tab=requests");
        // 첫 사용 기록을 마치면 대화가 설문을 대신해 참여 응답 1건 생성(정원·보상 경로 동일, 같은 트랜잭션)
        if (phase === 1) {
          const outcome = await saveResponse(projectId, user.id, { accompany: "동행 평가 대화로 응답" }, capacityOf(project), false, tx);
          if (outcome.kind === "created") createdResponse = outcome.responseId;
        }
        return;
      }
      if (op === "request") {
        if (manager) notFound();
        const note = field(form, "note", 1500);
        const id = field(form, "requestId", 36);
        if (!note || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return invalid();
        const reading = await tx.scenarioReading.findFirst({
          where: { id: field(form, "reading", 100), projectId, userId: user.id, phase: { gt: 0 } },
          select: { phase: true },
        });
        if (!reading) return stale();
        await tx.scenarioRequest.create({ data: { id, projectId, userId: user.id, phase: reading.phase, note } });
        await notifyNewRequests(tx, pushes, project.creatorId, project.title, 1, taskUrl + "&tab=requests");
        return;
      }
      if (op === "recheck") {
        if (manager) notFound();
        if (latest < 2 || String(latest) !== form.get("phase")) return stale();
        const recheckResult = field(form, "result", 20);
        const recheckNote = field(form, "observation", 1500);
        if (!recheckResults.some(result => result === recheckResult) || !recheckNote) return invalid();
        const saved = await tx.scenarioRequest.updateMany({
          where: {
            id: field(form, "reading", 100), projectId, userId: user.id,
            phase: { gt: 0 }, deployedPhase: latest, recheckedAt: null,
          },
          data: { recheckResult, recheckNote, recheckedAt: new Date() },
        });
        if (saved.count !== 1) return stale();
        return;
      }
      if (!manager) notFound();
      if (op === "reply") {
        const id = field(form, "reading", 100),
          reply = field(form, "reply", 1500),
          decision = field(form, "decision", 20);
        if (!reply || !decisions.some((d) => d === decision)) invalid();
        const row = await tx.scenarioRequest.findFirst({
          where: {
            id,
            projectId,
            phase: { gt: 0 },
            note: { not: "" },
            repliedAt: null,
          },
        });
        if (!row) return stale();
        await tx.scenarioRequest.update({
          where: { id },
          data: { decision, reply, repliedAt: new Date() },
        });
        const replied = { userId: row.userId, content: `동행 평가 ‘${project.title}’에 개발사 회신이 도착했어요.`, link: taskUrl };
        await tx.notification.create({ data: { ...replied, type: "INFO" } });
        pushes.push(replied);
        return;
      }
      if (op !== "release") notFound();
      if (String(latest) !== form.get("latest")) stale();
      const version = field(form, "version", 80),
        reply = field(form, "reply", 1500);
      // 직전 재평가 버전과 같으면 결과 화면의 단계 이름이 겹침
      if (!version || version === brief.version || version === brief.releases[0]?.version || !reply) invalid();
      const any = await tx.scenarioReading.count({
        where: { projectId, phase: latest },
      });
      if (!any) stale();
      await tx.scenarioRelease.create({
        data: { projectId, phase: latest + 1, version, reply },
      });
      const linked = [...new Set(form.getAll("implemented"))];
      if (linked.length) {
        if (
          !linked.every(
            (id): id is string => typeof id === "string" && id.length <= 100,
          )
        )
          return invalid();
        const matched = await tx.scenarioRequest.updateMany({
          where: {
            projectId,
            id: { in: linked },
            decision: { in: ["수용", "부분 수용"] },
            deployedPhase: null,
          },
          data: { deployedPhase: latest + 1 },
        });
        if (matched.count !== linked.length) stale();
      }
      const enrolled = await tx.enrollment.findMany({
        where: {
          projectId,
          status: "ACCEPTED",
          user: { scenarioReadings: { some: { projectId, phase: 1 } } },
        },
        select: { userId: true },
      });
      const retest = enrolled.map(({ userId }) => ({
        userId,
        content: `동행 평가 ‘${project.title}’의 ${version} 개선판을 재평가해 주세요.`,
        link: taskUrl,
      }));
      await tx.notification.createMany({ data: retest.map((r) => ({ ...r, type: "INFO" })) });
      pushes.push(...retest);
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      stale();
    throw error;
  }
  await pushNotificationRows(pushes);
  revalidatePath("/dashboard/accompany");
  revalidatePath(path);
  revalidatePath("/dashboard");
  if (createdResponse) await createRewardForResponse(createdResponse);
  // 요청에 답한 뒤에는 다음 요청을 이어서 답하도록 같은 탭으로 돌아감
  const back = form.get("tab") === "requests" ? "&tab=requests" : "";
  redirect(taskUrl + back + `&saved=${published ?? "1"}`);
}
