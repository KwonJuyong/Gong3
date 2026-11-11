import { checkRateLimit } from "../rate-limit";

/**
 * 사용량 한도 정본. 값을 바꿀 때는 이 파일만 고침
 *
 * 인메모리 카운터라 재시작하면 초기화되고 컨테이너끼리 공유되지 않음. 보안 경계가 아니라
 * 비용·자원 보호 장치임. 로그인·재설정 한도는 인증 흐름과 함께 보도록 `app/actions.ts` 에 둠
 * 문항 생성(`generateDraftsAction`)에는 한도를 두지 않음
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** 이름 → [허용 횟수, 시간 창] */
export const LIMIT_RULES = {
  // 메신저
  message: [60, MIN],
  roomCreate: [30, HOUR],
  userSearch: [30, MIN],
  // 평가
  enroll: [30, 10 * MIN],
  frameCheck: [60, MIN],
  // 메일이 나가는 조작
  emailChange: [5, DAY],
  // 무거운 문서 생성
  evalExport: [30, 10 * MIN],
  queryExport: [20, 10 * MIN],
  quotePdf: [30, 10 * MIN],
  adminDocument: [120, 10 * MIN],
  // 발주 생성은 건마다 팝빌 조회(50원)가 따름
  orderCreate: [30, HOUR],
  // 관리자가 손으로 돌리는 외부 연동(크론 호출은 제외)
  adminJob: [10, HOUR],
} as const satisfies Record<string, readonly [number, number]>;

export type LimitName = keyof typeof LIMIT_RULES;

/** 통과하면 null, 넘으면 안내 문구 */
export function checkLimit(name: LimitName, userId: string): string | null {
  const [max, windowMs] = LIMIT_RULES[name];
  return checkRateLimit(`${name}:${userId}`, max, windowMs);
}

/** LLM 질문(도우미·데이터 조회 공용). 한 질문이 모델을 최대 5번 호출함 */
export const LLM_PER_MINUTE = 20;
export const LLM_PER_DAY: Record<string, number> = { USER: 100, DEVELOPER: 200, ADMIN: 500 };
export const LLM_PLATFORM_PER_DAY = 3000;

export function checkLlmQuota(user: { id: string; role: string }): string | null {
  return (
    checkRateLimit(`llm-min:${user.id}`, LLM_PER_MINUTE, MIN) ??
    checkRateLimit(`llm-day:${user.id}`, LLM_PER_DAY[user.role] ?? LLM_PER_DAY.USER, DAY) ??
    (checkRateLimit("llm-day:all", LLM_PLATFORM_PER_DAY, DAY)
      ? "오늘 AI 사용량이 많아 잠시 쉬고 있어요. 내일 다시 시도해 주세요."
      : null)
  );
}

/** 기업정보조회(건당 50원). 체크섬 검사 뒤, 실제로 조회할 때만 호출함 */
export const BIZ_LOOKUP_PER_DAY = 20;
export const BIZ_LOOKUP_PLATFORM_PER_DAY = 300;

export function checkBizLookupQuota(userId: string): string | null {
  return (
    checkRateLimit(`biz-lookup:${userId}`, BIZ_LOOKUP_PER_DAY, DAY) ??
    (checkRateLimit("biz-lookup:all", BIZ_LOOKUP_PLATFORM_PER_DAY, DAY)
      ? "오늘 사업자 조회 한도를 모두 썼어요. 내일 다시 시도해 주세요."
      : null)
  );
}

/** 사용자별 하루 업로드 용량 */
export const UPLOAD_BYTES_PER_DAY = {
  message: 300 * 1024 * 1024,
  image: 100 * 1024 * 1024,
  attachment: 100 * 1024 * 1024,
} as const;
export const UPLOAD_QUOTA_WINDOW_MS = DAY;
/** 디스크 여유가 이보다 적으면 업로드를 받지 않음 */
export const MIN_FREE_DISK_BYTES = 1024 * 1024 * 1024;

/** LLM 호출 상한 */
export const LLM_TIMEOUT_MS = 60_000;
export const LLM_LONG_TIMEOUT_MS = 180_000; // 문항 생성·요약처럼 출력이 긴 호출
export const LLM_MAX_RETRIES = 1;
export const CHAT_MAX_OUTPUT_TOKENS = 1500;
export const QUERY_MAX_OUTPUT_TOKENS = 1000;
export const TOOL_RESULT_MAX_CHARS = 20_000;

/** 도우미에게 넘기는 첨부. 이력 전체를 다시 보내면 질문마다 같은 파일 비용을 냄 */
export const AI_ATTACHMENT_TURNS = 2;
export const AI_IMAGES_PER_TURN = 3;
export const AI_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const AI_FILE_READ_BYTES = 32 * 1024;
export const AI_FILE_MAX_CHARS = 4000;
export const AI_TURN_FILE_MAX_CHARS = 12_000;

/** 외부 호출 대기 상한 */
export const POPBILL_LOOKUP_TIMEOUT_MS = 8000;
export const MAIL_TIMEOUT_MS = 10_000;
