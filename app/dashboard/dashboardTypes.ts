import type { ProjectGuide } from "../lib/projectGuides";
import type { ProjectQuestion } from "../lib/projectQuestions";

export type QType = "rating" | "likert5" | "text" | "dropdown" | "checkbox" | "image";

export type DraftQuestion = {
  label: string;
  type: QType;
  optionsText: string;
};

export type DashboardUser = {
  id: string;
  studentId: string;
  name: string;
  role: string;
  userType: string;
};

export type DashboardProject = {
  evalMode: "SURVEY" | "ACCOMPANY";
  questionSource: "AUTO" | "MANUAL";
  hasOrder: boolean;
  needsOrder: boolean;
  taskStatus: "draft" | "published" | null;
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  status: string;
  startTime: string;
  endTime: string | null;
  closedAt: string | null;
  questions: ProjectQuestion[];
  guides?: ProjectGuide[];
  link: string | null;
  creatorId: string | null;
  creatorName: string | null;
  creatorMajor: string | null;
  creatorUserType: string | null;
  minParticipants: number;
  maxParticipants: number;
  capacity: number;
  rewardPerPerson: number;
  rejectReason: string | null;
  enrollmentDeadline: string | null;
  responseCount: number;
  enrollmentCount: number;
  acceptedCount: number;
  responses: {
    id: string;
    userId: string;
    userName: string | null;
    userStudentId: string;
    answers: Record<string, unknown>;
  }[];
  enrollments: {
    id: string;
    userId: string;
    userName: string;
    userStudentId: string;
    userMajor: string;
    userResponseCount: number;
    status: string;
    createdAt: string;
  }[];
};

export const QTYPE_LABEL: Record<string, string> = {
  rating: "별점(1~5)",
  likert5: "동의 척도(5점)",
  semantic7: "의미 척도(7점)",
  scale: "숫자 척도",
  text: "서술형",
  dropdown: "보기 중 1개",
  checkbox: "보기 중 여러 개",
  image: "이미지 업로드",
};

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// 오늘 10시는 오후에 만들면 이미 지난 시각이 되어 내일을 기본값으로 둠
export function tomorrowStrLocal() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function timeStrLocal() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function canManageProject(user: DashboardUser, project: DashboardProject) {
  return user.role === "ADMIN" || (!!project.creatorId && project.creatorId === user.id);
}
