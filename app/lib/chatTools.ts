import "server-only";
import { prisma } from "@/app/db";
import { HIDDEN_PROJECT_STATUSES, visibleProjectWhere } from "./approvals";
import { maskStudentId } from "./privacy";
import { runQuery, type QuerySpec } from "./queryEngine";
import { describeSchemaForLLM, describeExamplesForLLM } from "./queryMetadata";

// AI 도우미가 호출하는 읽기 전용 조회 함수들.
// 원칙: 비밀번호(password)와 주민번호(rrnEnc)는 절대 조회/반환하지 않음
// 교차 개인정보(타인의 연락처·계좌 등)는 ADMIN 역할에게만 노출함
// 모델·필드 화이트리스트와 권한 판정은 queryMetadata.ts(구조), queryPolicy.ts(권한),
// queryEngine.ts(실행)에 있음

/** query_data 설명 안의 자리표시자. 역할별로 런타임에 채움 */
export const SCHEMA_PLACEHOLDER = "%%SCHEMA%%";
export const EXAMPLES_PLACEHOLDER = "%%EXAMPLES%%";

/**
 * 역할에 맞게 도구 설명을 확정함
 * 스키마와 예시 모두 역할별로 만들어 ADMIN 전용 모델이 다른 역할의 프롬프트에 실리지 않게 함
 */
export function toolsForRole(role: string): ToolDef[] {
  const admin = String(role).toUpperCase() === "ADMIN";
  const schema = describeSchemaForLLM(admin);
  const examples = describeExamplesForLLM(admin);
  return chatTools.map((t) =>
    t.description.includes(SCHEMA_PLACEHOLDER) || t.description.includes(EXAMPLES_PLACEHOLDER)
      ? {
          ...t,
          description: t.description
            .replace(SCHEMA_PLACEHOLDER, schema)
            .replace(EXAMPLES_PLACEHOLDER, examples),
        }
      : t,
  );
}

export type ToolUser = { id: string; name: string; role: string };

/**
 * 도구가 감사 로그에 조회 대상·정책 등을 기록하는 통로.
 * 조회 대상을 알 수 있는 도구만 세 번째 인자로 받음
 */
export type ToolAuditCtx = {
  /** 조회 대상(모델.필드) 기록 */
  setTarget: (target: string) => void;
  /** 적용된 권한 정책 식별자 기록 */
  setPolicy: (policy: string) => void;
  /** 반환 행 수 기록 */
  setRowCount: (n: number) => void;
  /** 권한 차단 기록. outcome 이 BLOCKED 로 남음 */
  setBlocked: (reason: string) => void;
};

export type ToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run: (
    user: ToolUser,
    args: Record<string, unknown>,
    audit?: ToolAuditCtx,
  ) => Promise<unknown>;
};

const KST = "Asia/Seoul";
function fmt(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toLocaleString("ko-KR", { timeZone: KST });
}
const isAdmin = (u: ToolUser) => u.role === "ADMIN";

const noArgs = { type: "object", properties: {}, additionalProperties: false };

export const chatTools: ToolDef[] = [
  {
    name: "get_my_profile",
    description:
      "로그인한 사용자 본인의 프로필(이름, 학번/사번, 전공/소속, 연락처, 이메일, 역할, 유형)과 정산 정보 등록 여부를 반환한다. 계좌·주민등록번호는 반환하지 않는다.",
    parameters: noArgs,
    async run(user, _args, audit) {
      audit?.setTarget("user.self");
      audit?.setPolicy("self-only");
      const u = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          name: true,
          studentId: true,
          major: true,
          phone: true,
          email: true,
          role: true,
          userType: true,
          createdAt: true,
          // 계좌·주민번호는 본인 것이라도 도우미로는 내보내지 않도록 select 에서 뺌
          payrollProfile: { select: { address: true, updatedAt: true } },
        },
      });
      if (!u) return { error: "사용자를 찾을 수 없습니다." };
      audit?.setRowCount(1);
      return {
        ...u,
        createdAt: fmt(u.createdAt),
        payrollProfile: u.payrollProfile
          ? { ...u.payrollProfile, updatedAt: fmt(u.payrollProfile.updatedAt), 계좌정보: "등록됨(보안상 표시하지 않음)" }
          : null,
        note: "계좌번호·주민등록번호는 도우미가 조회할 수 없습니다. 프로필 > 정산 정보에서 확인하세요.",
      };
    },
  },
  {
    name: "get_my_evaluations",
    description:
      "로그인한 사용자가 신청(참여 신청)했거나 응답을 제출한 평가 목록을 반환한다.",
    parameters: noArgs,
    async run(user) {
      const [enrollments, responses] = await Promise.all([
        prisma.enrollment.findMany({
          where: { userId: user.id },
          include: { project: true },
        }),
        prisma.response.findMany({
          where: { userId: user.id },
          include: { project: true },
        }),
      ]);
      const responded = new Set(responses.map((r) => r.projectId));
      const byId = new Map<string, Record<string, unknown>>();
      for (const e of enrollments) {
        if (!e.project) continue;
        byId.set(e.projectId, {
          projectId: e.projectId,
          title: e.project.title,
          status: e.project.status,
          location: e.project.location,
          startTime: fmt(e.project.startTime),
          enrolled: true,
          responded: responded.has(e.projectId),
        });
      }
      for (const r of responses) {
        if (!r.project) continue;
        const cur = byId.get(r.projectId);
        if (cur) cur.responded = true;
        else
          byId.set(r.projectId, {
            projectId: r.projectId,
            title: r.project.title,
            status: r.project.status,
            location: r.project.location,
            startTime: fmt(r.project.startTime),
            enrolled: false,
            responded: true,
          });
      }
      return { evaluations: Array.from(byId.values()) };
    },
  },
  {
    name: "get_my_survey_status",
    description:
      "로그인한 사용자의 설문 응답 진행 상태(제출 완료 / 작성 중)를 반환한다.",
    parameters: noArgs,
    async run(user) {
      const responses = await prisma.surveyResponse.findMany({
        where: { userId: user.id },
        include: { surveyVersion: { include: { service: { select: { name: true } } } } },
        orderBy: { createdAt: "desc" },
      });
      return {
        surveys: responses.map((r) => ({
          serviceName: r.surveyVersion?.service?.name ?? "(알 수 없음)",
          round: r.surveyVersion?.round ?? null,
          submitted: r.submittedAt !== null,
          submittedAt: fmt(r.submittedAt),
        })),
      };
    },
  },

  {
    name: "list_open_evaluations",
    description:
      "지금 참여 신청이 가능한(모집 중·신청 마감 전) 평가 목록을 반환한다. 정원을 넘어도 신청은 받고 선발 때 정원을 적용한다.",
    parameters: noArgs,
    async run(user) {
      const now = new Date();
      // 신청은 모집 중(RECRUITING)에만 받음(enrollProjectAction 과 같은 조건).
      const projects = await prisma.project.findMany({
        where: { status: "RECRUITING" },
        include: {
          _count: { select: { enrollments: true } },
          enrollments: { where: { userId: user.id }, select: { id: true } },
        },
        orderBy: { startTime: "asc" },
      });
      const open = projects
        .filter((p) => !p.enrollmentDeadline || p.enrollmentDeadline > now)
        .map((p) => ({
          projectId: p.id,
          title: p.title,
          location: p.location,
          startTime: fmt(p.startTime),
          enrollmentDeadline: fmt(p.enrollmentDeadline),
          applicants: `${p._count.enrollments}명 신청 · 정원 ${p.maxParticipants}명`,
          alreadyEnrolled: p.enrollments.length > 0,
        }));
      return { openEvaluations: open };
    },
  },
  {
    name: "list_projects",
    description:
      "플랫폼의 평가(프로젝트) 목록을 반환한다. status(ACTIVE/FINISHED 등)로 필터 가능. 제목·상태·일정·정원·신청/응답 수·개설자 포함.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", description: "필터할 상태(예: ACTIVE, FINISHED). 생략 시 전체" },
      },
      additionalProperties: false,
    },
    async run(user, args) {
      const status = args.status ? String(args.status) : undefined;
      // 비관리자에게는 승인 대기·반려 평가를 숨김(status 인자와 AND 로 묶음).
      const statusFilter = status ? [{ status }] : [];
      const projects = await prisma.project.findMany({
        where: isAdmin(user)
          ? status
            ? { status }
            : undefined
          : { AND: [visibleProjectWhere, ...statusFilter] },
        include: {
          _count: { select: { enrollments: true, responses: true } },
          creator: { select: { name: true, studentId: true } },
        },
        orderBy: { startTime: "desc" },
        take: 100,
      });
      return {
        projects: projects.map((p) => ({
          projectId: p.id,
          title: p.title,
          status: p.status,
          location: p.location,
          startTime: fmt(p.startTime),
          endTime: fmt(p.endTime),
          enrollmentDeadline: fmt(p.enrollmentDeadline),
          capacity: `${p._count.enrollments}/${p.maxParticipants}`,
          responseCount: p._count.responses,
          creator: p.creator
            ? `${p.creator.name}(${maskStudentId(p.creator.studentId, isAdmin(user))})`
            : null,
        })),
      };
    },
  },
  {
    name: "get_evaluation_detail",
    description:
      "특정 평가(projectId)의 상세 정보와 로그인 사용자의 신청/응답 여부를 반환한다.",
    parameters: {
      type: "object",
      properties: { projectId: { type: "string", description: "평가(프로젝트) ID" } },
      required: ["projectId"],
      additionalProperties: false,
    },
    async run(user, args) {
      const projectId = String(args.projectId || "");
      if (!projectId) return { error: "projectId가 필요합니다." };
      const p = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          _count: { select: { enrollments: true, responses: true } },
          enrollments: { where: { userId: user.id }, select: { id: true } },
          responses: { where: { userId: user.id }, select: { id: true } },
          creator: { select: { name: true, studentId: true } },
        },
      });
      // 승인 전·반려 평가는 개설자와 ADMIN 에게만 보임
      const hidden = !!p && (HIDDEN_PROJECT_STATUSES as readonly string[]).includes(p.status);
      if (!p || (hidden && !isAdmin(user) && p.creatorId !== user.id)) {
        return { error: "해당 평가를 찾을 수 없습니다." };
      }
      return {
        title: p.title,
        description: p.description,
        location: p.location,
        status: p.status,
        startTime: fmt(p.startTime),
        endTime: fmt(p.endTime),
        enrollmentDeadline: fmt(p.enrollmentDeadline),
        capacity: `${p._count.enrollments}/${p.maxParticipants}`,
        spotsLeft: Math.max(0, p.maxParticipants - p._count.enrollments),
        responseCount: p._count.responses,
        creator: p.creator
          ? `${p.creator.name}(${maskStudentId(p.creator.studentId, isAdmin(user))})`
          : null,
        iAmEnrolled: p.enrollments.length > 0,
        iResponded: p.responses.length > 0,
      };
    },
  },
  {
    name: "get_project_participants",
    description:
      "특정 평가(projectId)에 신청한 사람과 응답을 제출한 사람 명단(이름·학번)을 반환한다. 평가 개설자와 ADMIN 만 조회할 수 있다.",
    parameters: {
      type: "object",
      properties: { projectId: { type: "string", description: "평가(프로젝트) ID" } },
      required: ["projectId"],
      additionalProperties: false,
    },
    async run(user, args) {
      const projectId = String(args.projectId || "");
      if (!projectId) return { error: "projectId가 필요합니다." };
      const p = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          enrollments: { include: { user: { select: { name: true, studentId: true } } } },
          responses: { include: { user: { select: { name: true, studentId: true } } } },
        },
      });
      if (!p) return { error: "해당 평가를 찾을 수 없습니다." };
      // 참여자 명단은 개설자와 ADMIN 만 봄(다른 학생의 참여 이력이 드러남).
      if (!isAdmin(user) && p.creatorId !== user.id) {
        return { error: "참여자 명단은 평가 개설자와 관리자만 볼 수 있습니다." };
      }
      // 비관리자에게는 참여자 학번을 가려서 보여줌(게스트는 studentId 가 이메일임).
      const admin = isAdmin(user);
      return {
        title: p.title,
        enrolled: p.enrollments.map(
          (e) => `${e.user.name}(${maskStudentId(e.user.studentId, admin)})`,
        ),
        responded: p.responses.map(
          (r) => `${r.user?.name}(${maskStudentId(r.user?.studentId, admin)})`,
        ),
      };
    },
  },

  {
    name: "search_members",
    description:
      "평가단원/사용자를 검색한다. 이름·학번으로 부분검색(query 생략 시 최근 가입 순). ADMIN은 연락처·이메일까지, 그 외에는 이름·학번·전공·역할만 반환한다.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "이름 또는 학번 부분검색어(선택)" } },
      additionalProperties: false,
    },
    async run(user, args) {
      const q = args.query ? String(args.query).trim() : "";
      const where = q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { studentId: { contains: q, mode: "insensitive" as const } },
              { major: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {};
      const users = await prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          name: true,
          studentId: true,
          major: true,
          role: true,
          userType: true,
          ...(isAdmin(user)
            ? { phone: true, email: true, createdAt: true }
            : {}),
          _count: { select: { responses: true, enrollments: true } },
        },
      });
      return {
        members: users.map((u) => ({
          name: u.name,
          // 메신저 사람 검색과 같은 규칙으로 학번을 가림
          studentId: maskStudentId(u.studentId, isAdmin(user)),
          major: u.major,
          role: u.role,
          userType: u.userType,
          responseCount: u._count.responses,
          enrollmentCount: u._count.enrollments,
          ...(isAdmin(user)
            ? { phone: u.phone, email: u.email, joinedAt: fmt(u.createdAt) }
            : {}),
        })),
        note: isAdmin(user)
          ? undefined
          : "연락처·이메일 등 민감정보는 관리자만 조회할 수 있습니다.",
      };
    },
  },
  {
    name: "get_member_detail",
    description:
      "특정 사용자(studentId)의 상세 정보를 반환한다. 본인 또는 ADMIN은 연락처·정산 프로필(계좌 등, 주민번호 제외)까지, 그 외에는 기본 정보만 반환한다.",
    parameters: {
      type: "object",
      properties: { studentId: { type: "string", description: "대상 사용자의 학번/사번" } },
      required: ["studentId"],
      additionalProperties: false,
    },
    async run(user, args) {
      const studentId = String(args.studentId || "").trim();
      if (!studentId) return { error: "studentId가 필요합니다." };
      const u = await prisma.user.findUnique({
        where: { studentId },
        select: {
          id: true,
          name: true,
          studentId: true,
          major: true,
          role: true,
          userType: true,
          phone: true,
          email: true,
          createdAt: true,
          // 계좌 정보는 역할과 무관하게 내보내지 않음
          payrollProfile: { select: { address: true, updatedAt: true } },
          _count: { select: { responses: true, enrollments: true, ownedServices: true } },
        },
      });
      if (!u) return { error: "해당 사용자를 찾을 수 없습니다." };
      const privileged = isAdmin(user) || u.id === user.id;
      const base = {
        name: u.name,
        // 조회 키로 이미 아는 값이어도 비관리자에게는 다른 사람의 로그인 ID 원본을 주지 않음
        studentId: maskStudentId(u.studentId, privileged),
        major: u.major,
        role: u.role,
        userType: u.userType,
        responseCount: u._count.responses,
        enrollmentCount: u._count.enrollments,
        ownedServiceCount: u._count.ownedServices,
      };
      if (!privileged) {
        return { ...base, note: "민감정보는 본인 또는 관리자만 조회할 수 있습니다." };
      }
      return {
        ...base,
        phone: u.phone,
        email: u.email,
        joinedAt: fmt(u.createdAt),
        payrollProfile: u.payrollProfile
          ? { ...u.payrollProfile, updatedAt: fmt(u.payrollProfile.updatedAt) }
          : null,
      };
    },
  },

  {
    name: "list_services_surveys",
    description:
      "평가 대상 서비스와 각 서비스의 설문 버전(회차·상태·응답 수)을 반환한다. ADMIN은 전체, 그 외에는 본인 소유 서비스를 반환한다.",
    parameters: noArgs,
    async run(user) {
      const services = await prisma.service.findMany({
        where: isAdmin(user) ? undefined : { ownerId: user.id },
        include: {
          owner: { select: { name: true, studentId: true } },
          surveys: {
            select: {
              round: true,
              status: true,
              createdAt: true,
              _count: { select: { responses: true } },
            },
            orderBy: { round: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return {
        services: services.map((s) => ({
          serviceId: s.id,
          name: s.name,
          preset: s.preset,
          modality: s.modality,
          isAiService: s.isAiService,
          // 비관리자는 where 에서 본인 소유만 걸러지므로 owner 는 자기 자신임
          owner: `${s.owner.name}(${maskStudentId(s.owner.studentId, isAdmin(user))})`,
          surveys: s.surveys.map((v) => ({
            round: v.round,
            status: v.status,
            responseCount: v._count.responses,
            createdAt: fmt(v.createdAt),
          })),
        })),
      };
    },
  },

  {
    name: "list_payroll",
    description:
      "노무비 청구 회차와 청구 내역(이름·소속·금액·상태)을 반환한다. ADMIN 전용. batchId로 특정 회차만 조회 가능. 계좌·주민등록번호는 반환하지 않는다.",
    parameters: {
      type: "object",
      properties: { batchId: { type: "string", description: "특정 청구 회차 ID(선택)" } },
      additionalProperties: false,
    },
    async run(user, args, audit) {
      audit?.setTarget("claimBatch,laborClaim");
      if (!isAdmin(user)) {
        audit?.setPolicy("admin-only-tool");
        audit?.setBlocked(`비관리자(${user.role})가 노무비 조회 시도`);
        return { error: "노무비 정보는 관리자만 조회할 수 있습니다." };
      }
      audit?.setPolicy("admin-full");
      const batchId = args.batchId ? String(args.batchId) : undefined;
      const batches = await prisma.claimBatch.findMany({
        where: batchId ? { id: batchId } : undefined,
        include: {
          claims: {
            select: {
              name: true,
              affiliation: true,
              totalAmount: true,
              status: true,
              // 은행·계좌는 ADMIN 에게도 도우미로는 주지 않음(정산 화면에서 확인).
              confirmedAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      return {
        batches: batches.map((b) => ({
          batchId: b.id,
          title: b.title,
          period: `${fmt(b.periodStart)} ~ ${fmt(b.periodEnd)}`,
          status: b.status,
          claimCount: b.claims.length,
          totalAmount: b.claims.reduce((s, c) => s + c.totalAmount, 0),
          claims: b.claims.map((c) => ({
            name: c.name,
            affiliation: c.affiliation,
            totalAmount: c.totalAmount,
            status: c.status,
            confirmedAt: fmt(c.confirmedAt),
          })),
        })),
        note: "계좌·주민등록번호는 도우미가 조회할 수 없습니다. 정산 화면에서 확인하세요.",
      };
    },
  },

  {
    name: "platform_stats",
    description:
      "플랫폼 전체 요약 통계(사용자 수, 진행중/종료 평가 수, 총 응답 수, 서비스·설문 수)를 반환한다.",
    parameters: noArgs,
    async run() {
      const [users, active, finished, responses, services, surveys] =
        await Promise.all([
          prisma.user.count(),
          prisma.project.count({ where: { status: "ACTIVE" } }),
          prisma.project.count({ where: { status: "FINISHED" } }),
          prisma.response.count(),
          prisma.service.count(),
          prisma.surveyVersion.count(),
        ]);
      return { users, activeProjects: active, finishedProjects: finished, responses, services, surveys };
    },
  },

  {
    name: "query_data",
    description:
      [
        "DB를 조회·집계하는 범용 도구. 전용 도구로 답할 수 없는 개수·분포·목록·교차분석·기간추이 질문은 이 도구를 쓴다.",
        "mode: count(개수) | list(목록) | groupBy(분포) | crosstab(두 기준 교차분석) | trend(기간별 추이) | aggregate(합계·평균·최소·최대). 기본 list.",
        "where 예시: {\"major\":{\"contains\":\"빅데이터\"}} / {\"status\":\"ACTIVE\"} / {\"enrollments\":\"some\"} / {\"OR\":[{\"enrollments\":\"some\"},{\"responses\":\"some\"}]}.",
        "문자열은 {\"contains\":\"...\"}로 부분검색, 관계 필드는 \"some\"/\"none\"으로 존재여부를 건다. 날짜는 {\"gte\":\"2026-08-01\"} 형태.",
        "aggregate 는 metric:{fn:\"sum\"|\"avg\"|\"min\"|\"max\", field:\"숫자필드\"}. trend 는 interval:\"day\"|\"week\"|\"month\" 와 dateField(생략 시 모델 기본값).",
        "crosstab 은 groupBy 와 groupBy2 두 개를 모두 지정한다.",
        "",
        "조회 가능한 model 과 필드:",
        "%%SCHEMA%%",
        "",
        "major 는 자유 텍스트다. 복수전공은 '빅데이터/스마트iot'처럼 '/'로 구분돼 있다 → 복수전공 = {major:{contains:'/'}}, 단일전공 = {NOT:{major:{contains:'/'}}}.",
        EXAMPLES_PLACEHOLDER,
        "비밀번호·주민번호·계좌 등 민감정보는 역할과 무관하게 조회되지 않는다. 조건(where)으로도 쓸 수 없다.",
      ].join("\n"),
    parameters: {
      type: "object",
      properties: {
        model: { type: "string", description: "조회할 모델명" },
        mode: {
          type: "string",
          enum: ["count", "list", "groupBy", "crosstab", "trend", "aggregate"],
          description: "조회 방식. 기본 list",
        },
        where: { type: "object", description: "필터 조건", additionalProperties: true },
        groupBy: { type: "string", description: "집계 기준 필드 (groupBy·crosstab)" },
        groupBy2: { type: "string", description: "교차분석의 두 번째 기준 (crosstab)" },
        metric: {
          type: "object",
          description: "집계 함수 (aggregate). 예: {\"fn\":\"sum\",\"field\":\"totalAmount\"}",
          properties: {
            fn: { type: "string", enum: ["count", "sum", "avg", "min", "max"] },
            field: { type: "string" },
          },
          additionalProperties: false,
        },
        interval: { type: "string", enum: ["day", "week", "month"], description: "추이 간격 (trend)" },
        dateField: { type: "string", description: "추이의 시간축 필드 (trend). 생략 시 모델 기본값" },
        fields: { type: "array", items: { type: "string" }, description: "list 반환 필드" },
        take: { type: "number", description: "list 최대 행 수(최대 100, 기본 20)" },
        orderBy: { type: "object", description: "list 정렬. 예: {\"field\":\"createdAt\",\"direction\":\"desc\"}", additionalProperties: true },
      },
      required: ["model"],
      additionalProperties: false,
    },
    async run(user, args, audit) {
      // 실행과 권한 판정은 엔진이 함
      const out = await runQuery(user.role, args as unknown as QuerySpec, user.id);
      if (!out.ok) {
        audit?.setPolicy(out.policy);
        audit?.setBlocked(out.reason);
        return { error: out.reason };
      }
      audit?.setTarget(out.target);
      audit?.setPolicy(out.policy);
      audit?.setRowCount(out.rowCount);
      return {
        model: out.model,
        mode: out.mode,
        columns: out.columns,
        rows: out.rows,
        rowCount: out.rowCount,
        truncated: out.truncated,
        notes: out.notes.length ? out.notes : undefined,
      };
    },
  },
];

export const toolByName = new Map(chatTools.map((t) => [t.name, t]));
